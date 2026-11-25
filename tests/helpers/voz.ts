import { act, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { ajustesDeTempo } from '@/voice/controlador';
import { ajustesDeEscuta } from '@/voice/reconhecedor';

// Falas pedidas ao backend (ElevenLabs) durante o teste atual: a API falsa registra aqui o texto de cada pedido.
let falasAtuais: string[] | null = null;
export function registrarFalaSintetizada(texto: string) { falasAtuais?.push(texto); }

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
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;

  constructor() {
    ReconhecimentoDeVozFalso.instancias.push(this);
  }

  start() {
    this.iniciado = true;
    this.jaIniciou = true;
    this.onaudiostart?.(); // o navegador começou a captar áudio
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
  ajustesDeTempo.reaberturasSilenciosas = 0; // os testes de tela ligam a reabertura silenciosa só onde precisam
  ajustesDeEscuta.janelaMs = 1200; // janela de resposta curta nos testes (em produção são 12 s)
  ajustesDeEscuta.pausaEntreReiniciosMs = 10;
  const falas: string[] = [];
  falasAtuais = falas;
  let segurando = false;
  let emFala: EnunciadoFalso[] = [];
  let emFalaAudio: Array<() => void> = [];
  let sequenciaDeUrls = 0;

  class EnunciadoFalso {
    lang = '';
    rate = 1;
    pitch = 1;
    voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }

  // Áudio da ElevenLabs (modo conectado): termina logo depois de tocar, ou só quando o teste chamar `terminarFala()`.
  class AudioFalso {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private fim = () => this.onended?.();
    constructor(public src: string) {}
    play() {
      if (segurando) emFalaAudio.push(this.fim);
      else setTimeout(this.fim, 0);
      return Promise.resolve();
    }
    pause() { emFalaAudio = emFalaAudio.filter((f) => f !== this.fim); }
  }
  URL.createObjectURL = vi.fn(() => `blob:teste-${++sequenciaDeUrls}`);
  URL.revokeObjectURL = vi.fn();

  vi.stubGlobal('Audio', AudioFalso);
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
      const pendentesDoAudio = emFalaAudio;
      emFalaAudio = [];
      act(() => {
        pendentes.forEach((e) => e.onend?.());
        pendentesDoAudio.forEach((fim) => fim());
      });
    },
    get falando() { return emFala.length > 0 || emFalaAudio.length > 0; },
  };
}
