import { act, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { ajustesDeTempo } from '@/voice/controlador';

type ResultadoFalso = Array<{ transcript: string; confidence?: number }> & { isFinal: boolean };

/**
 * Reconhecimento de voz falso: imita a parte da Web Speech API usada pelo TrayCheck.
 * O app cria UMA instância por escuta (uma pergunta = um `start()`), como no navegador real.
 */
export class ReconhecimentoDeVozFalso {
  static instancias: ReconhecimentoDeVozFalso[] = [];

  static ultima(): ReconhecimentoDeVozFalso {
    const instancia = ReconhecimentoDeVozFalso.instancias.at(-1);
    if (!instancia) throw new Error('Nenhum reconhecimento de voz foi criado.');
    return instancia;
  }

  /** Quantas vezes o microfone foi aberto (start) em toda a sessão. */
  static get aberturas() {
    return ReconhecimentoDeVozFalso.instancias.filter((i) => i.jaIniciou).length;
  }

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  iniciado = false;
  jaIniciou = false;
  onresult: ((evento: { resultIndex?: number; results: ResultadoFalso[] }) => void) | null = null;
  onerror: ((evento?: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    ReconhecimentoDeVozFalso.instancias.push(this);
  }

  start() {
    this.iniciado = true;
    this.jaIniciou = true;
  }

  stop() {
    this.iniciado = false;
  }

  abort() {
    this.iniciado = false;
  }

  /** Simula o navegador entregando uma transcrição (parcial ou final). */
  falar(texto: string, final = true, confianca = 0.92) {
    const resultado = Object.assign([{ transcript: texto, confidence: confianca }], { isFinal: final }) as ResultadoFalso;
    act(() => this.onresult?.({ results: [resultado] }));
  }

  falharComErro(codigo = 'network') {
    act(() => this.onerror?.({ error: codigo }));
  }

  /** O navegador encerrou a escuta sem nenhuma frase (silêncio). */
  encerrarSemFala() {
    act(() => this.onend?.());
  }
}

/** Espera o microfone ABRIR (nova escuta) e devolve o reconhecimento ativo. */
export async function aguardarMicrofoneAberto(): Promise<ReconhecimentoDeVozFalso> {
  await waitFor(() => expect(ReconhecimentoDeVozFalso.instancias.at(-1)?.iniciado).toBe(true), { timeout: 4000 });
  return ReconhecimentoDeVozFalso.ultima();
}

/** O que o usuário faz: espera o assistente terminar de perguntar, o microfone abrir, e responde. */
export async function responderPorVoz(texto: string, confianca = 0.92) {
  const reconhecimento = await aguardarMicrofoneAberto();
  reconhecimento.falar(texto, true, confianca);
  return reconhecimento;
}

/** Espera o assistente falar uma frase (a síntese falsa registra tudo o que foi dito). */
export async function aguardarFala(falas: string[], trecho: string | RegExp) {
  await waitFor(() => expect(falas.some((f) => (typeof trecho === 'string' ? f.includes(trecho) : trecho.test(f)))).toBe(true), { timeout: 4000 });
}

/**
 * Instala a Web Speech API falsa (reconhecimento + síntese). Retorna as frases que o app "falou".
 * A síntese falsa dispara `onend` logo depois de falar (como o navegador). Com `segurarFala()` ela só termina
 * quando o teste chamar `terminarFala()` — é assim que provamos que o microfone não abre durante a fala.
 */
export function instalarVozFalsa() {
  ReconhecimentoDeVozFalso.instancias = [];
  ajustesDeTempo.atrasoAposFalaMs = 0;
  const falas: string[] = [];
  let segurando = false;
  let emFala: EnunciadoFalso[] = [];

  class EnunciadoFalso {
    lang = '';
    rate = 1;
    pitch = 1;
    voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }

  vi.stubGlobal('SpeechRecognition', ReconhecimentoDeVozFalso);
  vi.stubGlobal('SpeechSynthesisUtterance', EnunciadoFalso);
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [],
    cancel: vi.fn(() => { emFala = []; }),
    speak: vi.fn((enunciado: EnunciadoFalso) => {
      falas.push(enunciado.text);
      if (segurando) emFala.push(enunciado);
      else setTimeout(() => enunciado.onend?.(), 0);
    }),
  });

  return {
    falas,
    /** A partir daqui o assistente "fala" sem parar, até `terminarFala()`. */
    segurarFala() { segurando = true; },
    terminarFala() {
      segurando = false;
      const pendentes = emFala;
      emFala = [];
      act(() => pendentes.forEach((e) => e.onend?.()));
    },
    get falando() { return emFala.length > 0; },
  };
}
