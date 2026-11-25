import { expect, type Locator, type Page } from '@playwright/test';

export const CONTAS = {
  enfermeira: { email: 'ana.silva@hospitalcentral.br', senha: 'senha123', nome: 'Ana' },
  tecnico: { email: 'rafael.lima@hospitalcentral.br', senha: 'circ123', nome: 'Rafael' },
  administrador: { email: 'admin@hospitalcentral.br', senha: 'admin123', nome: 'Carlos' },
} as const;

export const URL_DA_API_DE_REFERENCIA = 'http://127.0.0.1:3101';

export async function entrar(page: Page, conta: { email: string; senha: string }) {
  await page.goto('/');
  await page.getByPlaceholder('nome@hospitalcentral.br').fill(conta.email);
  await page.getByPlaceholder('••••••••').fill(conta.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** A navegação lateral (desktop) é o único <aside> da página. */
export const menuLateral = (page: Page) => page.getByRole('complementary');

export async function irPara(page: Page, rotulo: string | RegExp) {
  await menuLateral(page).getByRole('button', { name: rotulo }).click();
}

/** Título da barra superior (as telas também têm <h1>, por isso o escopo no cabeçalho). */
export const tituloDaTela = (page: Page): Locator => page.getByRole('banner').getByRole('heading', { level: 1 });

/**
 * Abre a conferência por voz da cirurgia pelo botão "Conferir" da programação do dia.
 * Deve ser chamada logo após `entrar` (o app abre no Dashboard, o que vale também para a navegação móvel).
 */
export async function abrirConferencia(page: Page, cirurgia: string) {
  await expect(tituloDaTela(page)).toHaveText('Dashboard');
  const linha = page.getByText(cirurgia, { exact: true }).locator('visible=true').first().locator('xpath=ancestor::*[contains(@class,"group")][1]');
  await linha.getByRole('button', { name: 'Conferir' }).click();
  await expect(tituloDaTela(page)).toHaveText('Conferência por Voz');
}

/**
 * Web Speech API falsa para o navegador. O microfone real não é automatizável (ver plano de QA, "mock de voz");
 * o teste de taxa de reconhecimento de voz (RNF03) continua sendo um roteiro manual.
 * Deve ser chamada ANTES de `page.goto`.
 *
 * Imita o comportamento do navegador que importa para o diálogo:
 *  - o app abre UMA escuta (nova instância + start) a cada pergunta e a fecha (abort) ao receber a resposta;
 *  - a síntese "termina" (onend) logo depois de falar — ou só quando o teste mandar, com `segurarFala()`;
 *  - o registro `eventos` guarda a ordem fala/microfone para provar que nunca se sobrepõem.
 */
export async function instalarVozFalsa(page: Page) {
  await page.addInitScript(() => {
    type Resultado = Array<{ transcript: string; confidence: number }> & { isFinal: boolean };
    const w = window as unknown as Record<string, unknown>;
    const falas: string[] = [];
    const eventos: string[] = [];
    let falando = false;
    let segurando = false;
    let pendentes: Array<{ onend: (() => void) | null }> = [];
    let sobreposicoes = 0;
    let atual: ReconhecimentoFalso | null = null;

    class ReconhecimentoFalso {
      onresult: ((e: { resultIndex: number; results: Resultado[] }) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      iniciado = false;
      start() {
        if (falando) sobreposicoes++; // o microfone abriu enquanto o assistente falava
        this.iniciado = true;
        atual = this;
        eventos.push('mic:abre');
      }
      stop() { this.fechar(); }
      abort() { this.fechar(); }
      private fechar() {
        if (this.iniciado) eventos.push('mic:fecha');
        this.iniciado = false;
        if (atual === this) atual = null;
      }
    }

    w.SpeechRecognition = ReconhecimentoFalso;
    w.webkitSpeechRecognition = ReconhecimentoFalso;
    w.SpeechSynthesisUtterance = class {
      lang = '';
      rate = 1;
      pitch = 1;
      voice = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel() { pendentes = []; falando = false; },
        speak(e: { text: string; onend: (() => void) | null }) {
          falas.push(e.text);
          eventos.push(`fala:${e.text}`);
          falando = true;
          const terminar = () => { falando = false; eventos.push('fala:fim'); e.onend?.(); };
          if (segurando) pendentes.push({ onend: terminar });
          else setTimeout(terminar, 0);
        },
      },
    });
    w.__voz = {
      /** Espera o microfone ABRIR (o app só o abre depois da pergunta) e entrega a transcrição final. */
      async falar(texto: string) {
        const limite = Date.now() + 8000;
        while (!(atual && atual.iniciado)) {
          if (Date.now() > limite) throw new Error('O microfone não foi aberto pelo assistente.');
          await new Promise((r) => setTimeout(r, 20));
        }
        const resultado = Object.assign([{ transcript: texto, confidence: 0.92 }], { isFinal: true }) as Resultado;
        atual.onresult?.({ resultIndex: 0, results: [resultado] });
      },
      falas: () => [...falas],
      eventos: () => [...eventos],
      sobreposicoes: () => sobreposicoes,
      microfoneAberto: () => Boolean(atual?.iniciado),
      segurarFala() { segurando = true; },
      terminarFala() {
        segurando = false;
        const lista = pendentes;
        pendentes = [];
        lista.forEach((p) => p.onend?.());
      },
    };
  });
}

type VozNaPagina = {
  falar(t: string): Promise<void>; falas(): string[]; eventos(): string[]; sobreposicoes(): number;
  microfoneAberto(): boolean; segurarFala(): void; terminarFala(): void;
};
/** O operador responde ao assistente (espera o microfone abrir e entrega a frase). */
export const falar = (page: Page, texto: string) => page.evaluate((t) => (window as unknown as { __voz: VozNaPagina }).__voz.falar(t), texto);
export const falasDoApp = (page: Page) => page.evaluate(() => (window as unknown as { __voz: VozNaPagina }).__voz.falas());
export const eventosDeVoz = (page: Page) => page.evaluate(() => (window as unknown as { __voz: VozNaPagina }).__voz.eventos());
export const sobreposicoesDeVoz = (page: Page) => page.evaluate(() => (window as unknown as { __voz: VozNaPagina }).__voz.sobreposicoes());
export const microfoneAberto = (page: Page) => page.evaluate(() => (window as unknown as { __voz: VozNaPagina }).__voz.microfoneAberto());
export const segurarFala = (page: Page) => page.evaluate(() => (window as unknown as { __voz: VozNaPagina }).__voz.segurarFala());
export const terminarFala = (page: Page) => page.evaluate(() => (window as unknown as { __voz: VozNaPagina }).__voz.terminarFala());

/** Contadores do cabeçalho da conferência (visíveis a partir de `sm`): o número fica logo acima do rótulo. */
export function contador(page: Page, rotulo: 'OK' | 'Pend.' | 'Falta'): Locator {
  return page.getByText(rotulo, { exact: true }).locator('xpath=preceding-sibling::div[1]');
}
