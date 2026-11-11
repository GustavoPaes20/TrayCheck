import { act } from '@testing-library/react';
import { vi } from 'vitest';

type ResultadoFalso = Array<{ transcript: string }> & { isFinal: boolean };

/** Reconhecimento de voz falso: imita a parte da Web Speech API usada pelo TrayCheck. */
export class ReconhecimentoDeVozFalso {
  static instancias: ReconhecimentoDeVozFalso[] = [];

  static ultima(): ReconhecimentoDeVozFalso {
    const instancia = ReconhecimentoDeVozFalso.instancias.at(-1);
    if (!instancia) throw new Error('Nenhum reconhecimento de voz foi criado.');
    return instancia;
  }

  lang = '';
  continuous = false;
  interimResults = false;
  iniciado = false;
  onresult: ((evento: { results: ResultadoFalso[] }) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    ReconhecimentoDeVozFalso.instancias.push(this);
  }

  start() {
    this.iniciado = true;
  }

  stop() {
    this.iniciado = false;
  }

  /** Simula o navegador entregando uma transcrição (parcial ou final). */
  falar(texto: string, final = true) {
    const resultado = Object.assign([{ transcript: texto }], { isFinal: final }) as ResultadoFalso;
    act(() => this.onresult?.({ results: [resultado] }));
  }

  falharComErro() {
    act(() => this.onerror?.());
  }
}

/** Instala a Web Speech API falsa (reconhecimento + síntese). Retorna as frases que o app "falou". */
export function instalarVozFalsa() {
  ReconhecimentoDeVozFalso.instancias = [];
  const falas: string[] = [];

  class EnunciadoFalso {
    lang = '';
    rate = 1;
    constructor(public text: string) {}
  }

  vi.stubGlobal('SpeechRecognition', ReconhecimentoDeVozFalso);
  vi.stubGlobal('SpeechSynthesisUtterance', EnunciadoFalso);
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak: vi.fn((enunciado: EnunciadoFalso) => falas.push(enunciado.text)),
  });

  return { falas };
}
