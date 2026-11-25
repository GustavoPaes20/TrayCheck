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
  onresult: ((evento: { resultIndex: number; results: ResultadoFalso[] }) => void) | null = null;
  onerror: ((evento: { error: string }) => void) | null = null;
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
    act(() => this.onresult?.({ resultIndex: 0, results: [resultado] }));
  }

  /** Simula um erro do navegador. `not-allowed` = permissão do microfone negada; `no-speech` = silêncio. */
  falharComErro(codigo = 'not-allowed') {
    act(() => this.onerror?.({ error: codigo }));
  }
}

/** Instala a Web Speech API falsa (reconhecimento + síntese). Retorna as frases que o app "falou". */
export function instalarVozFalsa() {
  ReconhecimentoDeVozFalso.instancias = [];
  const falas: string[] = [];
  /** Com `segurarFalas = true`, a fala só termina quando o teste chamar `terminarFala()`. */
  const controle = { segurarFalas: false, falaEmAndamento: null as EnunciadoFalso | null };

  class EnunciadoFalso {
    lang = '';
    rate = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }

  function terminarFala() {
    const enunciado = controle.falaEmAndamento;
    controle.falaEmAndamento = null;
    act(() => enunciado?.onend?.());
  }

  vi.stubGlobal('SpeechRecognition', ReconhecimentoDeVozFalso);
  vi.stubGlobal('SpeechSynthesisUtterance', EnunciadoFalso);
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak: vi.fn((enunciado: EnunciadoFalso) => {
      falas.push(enunciado.text);
      controle.falaEmAndamento = enunciado;
      if (!controle.segurarFalas) enunciado.onend?.(); // o navegador avisa que terminou de falar
    }),
  });
  vi.stubGlobal('alert', vi.fn());

  return { falas, controle, terminarFala };
}
