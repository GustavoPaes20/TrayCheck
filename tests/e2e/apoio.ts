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
 */
export async function instalarVozFalsa(page: Page) {
  await page.addInitScript(() => {
    type Resultado = Array<{ transcript: string }> & { isFinal: boolean };
    const w = window as unknown as Record<string, unknown>;
    const instancias: Array<{ onresult: ((e: { results: Resultado[] }) => void) | null }> = [];
    const falas: string[] = [];

    class ReconhecimentoFalso {
      onresult: ((e: { results: Resultado[] }) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      lang = '';
      continuous = false;
      interimResults = false;
      constructor() {
        instancias.push(this);
      }
      start() {}
      stop() {}
    }

    w.SpeechRecognition = ReconhecimentoFalso;
    w.webkitSpeechRecognition = ReconhecimentoFalso;
    w.SpeechSynthesisUtterance = class {
      lang = '';
      rate = 1;
      constructor(public text: string) {}
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel() {}, speak: (e: { text: string }) => void falas.push(e.text) },
    });
    w.__voz = {
      /** Entrega uma transcrição final ao reconhecimento mais recente. */
      falar(texto: string) {
        const reconhecimento = instancias.at(-1);
        if (!reconhecimento?.onresult) throw new Error('O microfone ainda não foi ativado.');
        reconhecimento.onresult({ results: [Object.assign([{ transcript: texto }], { isFinal: true }) as Resultado] });
      },
      falas: () => [...falas],
    };
  });
}

export const falar = (page: Page, texto: string) => page.evaluate((t) => (window as unknown as { __voz: { falar(t: string): void } }).__voz.falar(t), texto);
export const falasDoApp = (page: Page) => page.evaluate(() => (window as unknown as { __voz: { falas(): string[] } }).__voz.falas());

/** Contadores do cabeçalho da conferência (visíveis a partir de `sm`): o número fica logo acima do rótulo. */
export function contador(page: Page, rotulo: 'OK' | 'Pend.' | 'Falta'): Locator {
  return page.getByText(rotulo, { exact: true }).locator('xpath=preceding-sibling::div[1]');
}
