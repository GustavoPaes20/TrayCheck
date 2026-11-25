// Reconhecimento de fala do navegador (Web Speech API), uma ESCUTA POR VEZ.
//
// Cada `ouvir()` abre o microfone, espera UMA frase final e fecha o microfone na hora. A janela de resposta
// (TEMPO_MAXIMO_DE_ESCUTA_MS) é garantida: se o navegador fechar o reconhecimento antes, ele é reaberto sozinho. Assim o controlador
// decide exatamente quando o microfone está aberto (nunca durante a fala do assistente). Só resultados
// FINAIS são usados (interimResults = false), e depois da primeira resposta tudo que chegar é ignorado:
// não existe "resultado acumulado" que possa ser processado duas vezes.

export type Alternativa = { transcript: string; confidence?: number };

export type ResultadoDaEscuta =
  | { tipo: 'fala'; alternativas: Alternativa[] }
  | { tipo: 'silencio' }
  | { tipo: 'erro'; motivo: 'permissao' | 'sem-microfone' | 'rede' | 'indisponivel' }
  | { tipo: 'cancelado' };

export type Reconhecedor = {
  readonly suportado: boolean;
  /**
   * Abre o microfone e resolve com a próxima frase (ou silêncio/erro/cancelamento). Nunca rejeita.
   * `aoAbrir` é chamado quando o navegador REALMENTE começou a captar áudio (só daí o usuário pode falar).
   */
  ouvir(aoAbrir?: () => void): Promise<ResultadoDaEscuta>;
  /** Fecha o microfone imediatamente; a escuta em andamento resolve como `cancelado`. */
  cancelar(): void;
};

type AlternativaDoNavegador = { transcript: string; confidence?: number };
type ResultadoDoNavegador = { isFinal: boolean; length?: number; [indice: number]: AlternativaDoNavegador };
type EventoDeResultado = { resultIndex?: number; results: { length: number; [indice: number]: ResultadoDoNavegador } };
type EventoDeErro = { error?: string };

type InstanciaDeReconhecimento = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: ((evento: EventoDeResultado) => void) | null;
  onerror: ((evento: EventoDeErro) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type JanelaComVoz = {
  SpeechRecognition?: new () => InstanciaDeReconhecimento;
  webkitSpeechRecognition?: new () => InstanciaDeReconhecimento;
};

/** Janela total que o usuário tem para responder. O Chrome costuma encerrar o reconhecimento antes (silêncio curto,
 *  fim espontâneo): nesse caso o microfone é reaberto sozinho até completar esta janela. */
export const TEMPO_MAXIMO_DE_ESCUTA_MS = 12_000;
const PAUSA_ENTRE_REINICIOS_MS = 200;
/** Valores em uso (os testes encurtam para não esperar de verdade). */
export const ajustesDeEscuta = { janelaMs: TEMPO_MAXIMO_DE_ESCUTA_MS, pausaEntreReiniciosMs: PAUSA_ENTRE_REINICIOS_MS };

function construtorDoNavegador() {
  const janela = window as unknown as JanelaComVoz;
  return janela.SpeechRecognition ?? janela.webkitSpeechRecognition;
}

function motivoDoErro(codigo: string | undefined): ResultadoDaEscuta {
  switch (codigo) {
    case 'no-speech': return { tipo: 'silencio' };
    case 'aborted': return { tipo: 'cancelado' };
    case 'not-allowed':
    case 'service-not-allowed': return { tipo: 'erro', motivo: 'permissao' };
    case 'audio-capture': return { tipo: 'erro', motivo: 'sem-microfone' };
    case 'network': return { tipo: 'erro', motivo: 'rede' };
    default: return { tipo: 'erro', motivo: 'indisponivel' };
  }
}

export function criarReconhecedor(tempoMaximoMs = ajustesDeEscuta.janelaMs): Reconhecedor {
  let escutaAtual: { encerrar: (resultado: ResultadoDaEscuta) => void } | null = null;

  function cancelar() {
    escutaAtual?.encerrar({ tipo: 'cancelado' });
  }

  function ouvir(aoAbrir?: () => void): Promise<ResultadoDaEscuta> {
    cancelar(); // garante um único microfone aberto
    const Construtor = construtorDoNavegador();
    if (!Construtor) return Promise.resolve({ tipo: 'erro', motivo: 'indisponivel' });

    return new Promise<ResultadoDaEscuta>((resolver) => {
      let resolvido = false;
      let aberto = false;
      let reinicios = 0;
      let instancia: InstanciaDeReconhecimento | null = null;
      let temporizadorDeReinicio: ReturnType<typeof setTimeout> | undefined;
      const inicio = Date.now();
      const avisarAbertura = () => {
        if (aberto || resolvido) return;
        aberto = true;
        aoAbrir?.();
      };

      /** Solta a instância atual: sem callbacks e com o microfone fechado. */
      function soltarInstancia() {
        const antiga = instancia;
        if (!antiga) return;
        instancia = null;
        antiga.onresult = null;
        antiga.onerror = null;
        antiga.onend = null;
        antiga.onstart = null;
        antiga.onaudiostart = null;
        try { (antiga.abort ?? antiga.stop).call(antiga); } catch { /* já encerrado */ }
      }

      const escuta = {
        encerrar(resultado: ResultadoDaEscuta) {
          if (resolvido) return; // primeira resposta vence; o resto é descartado
          resolvido = true;
          // Diagnóstico (Console do navegador, nível Info): por que e quando a escuta terminou.
          console.info(`[voz] escuta encerrada: ${resultado.tipo}${'motivo' in resultado ? ` (${resultado.motivo})` : ''} após ${Date.now() - inicio} ms; microfone aberto: ${aberto ? 'sim' : 'não'}; reinícios: ${reinicios}`);
          clearTimeout(limite);
          clearTimeout(temporizadorDeReinicio);
          if (escutaAtual === escuta) escutaAtual = null;
          soltarInstancia();
          resolver(resultado);
        },
      };
      escutaAtual = escuta;
      // A janela vale mesmo que o navegador feche o reconhecimento antes: só depois dela é "silêncio".
      const limite = setTimeout(() => escuta.encerrar({ tipo: 'silencio' }), tempoMaximoMs);

      /** O navegador fechou o reconhecimento sem frase (silêncio, fim espontâneo): reabre até completar a janela. */
      function fimPrematuro(motivo: string) {
        if (resolvido) return;
        soltarInstancia();
        reinicios += 1;
        console.info(`[voz] o navegador encerrou a escuta (${motivo}) após ${Date.now() - inicio} ms; reabrindo o microfone (${reinicios})`);
        temporizadorDeReinicio = setTimeout(iniciarInstancia, ajustesDeEscuta.pausaEntreReiniciosMs);
      }

      function iniciarInstancia() {
        if (resolvido) return;
        const reconhecimento = new Construtor!();
        instancia = reconhecimento;
        reconhecimento.lang = 'pt-BR';
        reconhecimento.continuous = false;
        reconhecimento.interimResults = false;
        reconhecimento.maxAlternatives = 3;

        reconhecimento.onstart = avisarAbertura; // navegadores sem onaudiostart
        reconhecimento.onaudiostart = avisarAbertura;
        reconhecimento.onresult = (evento) => {
          for (let i = evento.resultIndex ?? 0; i < evento.results.length; i++) {
            const resultado = evento.results[i];
            if (!resultado?.isFinal) continue;
            const alternativas: Alternativa[] = [];
            for (let a = 0; a < (resultado.length ?? 1) && a < 3; a++) {
              const alternativa = resultado[a];
              if (alternativa?.transcript?.trim()) alternativas.push({ transcript: alternativa.transcript, confidence: alternativa.confidence });
            }
            if (alternativas.length > 0) escuta.encerrar({ tipo: 'fala', alternativas });
            else fimPrematuro('resultado vazio');
            return;
          }
        };
        reconhecimento.onerror = (evento) => {
          const resultado = motivoDoErro(evento?.error);
          // Silêncio/aborto do próprio navegador não encerram a janela; permissão, microfone e rede sim.
          if (resultado.tipo === 'silencio' || resultado.tipo === 'cancelado') fimPrematuro(evento?.error ?? 'erro');
          else escuta.encerrar(resultado);
        };
        reconhecimento.onend = () => fimPrematuro('end');

        try {
          reconhecimento.start();
        } catch {
          escuta.encerrar({ tipo: 'erro', motivo: 'indisponivel' });
        }
      }

      iniciarInstancia();
    });
  }

  return { get suportado() { return Boolean(construtorDoNavegador()); }, ouvir, cancelar };
}

/**
 * Pede a permissão do microfone ANTES de começar, para mostrar uma mensagem clara se for negada
 * (o reconhecimento sozinho só devolve um erro genérico). Libera o microfone logo em seguida.
 */
export async function solicitarPermissaoDoMicrofone(): Promise<'ok' | 'permissao' | 'sem-microfone'> {
  const dispositivos = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!dispositivos?.getUserMedia) return 'ok'; // o próprio reconhecimento pedirá a permissão
  try {
    const fluxo = await dispositivos.getUserMedia({ audio: true });
    fluxo.getTracks().forEach((faixa) => faixa.stop());
    return 'ok';
  } catch (erro) {
    const nome = (erro as { name?: string })?.name;
    if (nome === 'NotAllowedError' || nome === 'SecurityError' || nome === 'PermissionDeniedError') return 'permissao';
    if (nome === 'NotFoundError' || nome === 'DevicesNotFoundError') return 'sem-microfone';
    return 'ok';
  }
}
