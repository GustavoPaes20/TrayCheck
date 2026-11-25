import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarReconhecedor, solicitarPermissaoDoMicrofone } from '@/voice/reconhecedor';

// Reconhecedor: UMA escuta por vez, só resultados finais, microfone fechado assim que a resposta chega.

class ReconhecimentoFalso {
  static instancias: ReconhecimentoFalso[] = [];
  lang = ''; continuous = true; interimResults = true; maxAlternatives = 1;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  iniciado = false;
  abortado = false;
  constructor() { ReconhecimentoFalso.instancias.push(this); }
  start() { this.iniciado = true; }
  stop() { this.iniciado = false; }
  abort() { this.iniciado = false; this.abortado = true; }
  resultado(texto: string, final = true, outras: string[] = []) {
    const r = Object.assign([{ transcript: texto, confidence: 0.9 }, ...outras.map((t) => ({ transcript: t, confidence: 0.5 }))], { isFinal: final });
    this.onresult?.({ resultIndex: 0, results: [r] });
  }
}
const ultima = () => ReconhecimentoFalso.instancias.at(-1)!;

beforeEach(() => {
  ReconhecimentoFalso.instancias = [];
  vi.stubGlobal('SpeechRecognition', ReconhecimentoFalso);
});
afterEach(() => vi.useRealTimers());

describe('reconhecedor de escuta única', () => {
  it('configura pt-BR, sem modo contínuo e sem resultados parciais', () => {
    void criarReconhecedor().ouvir();
    expect(ultima()).toMatchObject({ lang: 'pt-BR', continuous: false, interimResults: false, maxAlternatives: 3, iniciado: true });
  });

  it('entrega a primeira frase FINAL com as alternativas e fecha o microfone na hora', async () => {
    const reconhecedor = criarReconhecedor();
    const escuta = reconhecedor.ouvir();

    ultima().resultado('sim temos', true, ['sim, temos']);

    expect(await escuta).toEqual({ tipo: 'fala', alternativas: [{ transcript: 'sim temos', confidence: 0.9 }, { transcript: 'sim, temos', confidence: 0.5 }] });
    expect(ultima().iniciado).toBe(false);
    expect(ultima().abortado).toBe(true);
  });

  it('resultados parciais são ignorados', async () => {
    vi.useFakeTimers();
    const escuta = criarReconhecedor(1000).ouvir();

    ultima().resultado('sim', false);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await escuta).toEqual({ tipo: 'silencio' });
  });

  it('só a primeira resposta vale: o que chegar depois é descartado', async () => {
    const escuta = criarReconhecedor().ouvir();
    const instancia = ultima();

    instancia.resultado('sim');
    instancia.resultado('não');
    instancia.onend?.();

    expect(await escuta).toMatchObject({ tipo: 'fala', alternativas: [{ transcript: 'sim' }] });
  });

  it('fim da escuta sem frase = silêncio (não é erro)', async () => {
    const escuta = criarReconhecedor().ouvir();
    ultima().onend?.();
    expect(await escuta).toEqual({ tipo: 'silencio' });
  });

  it('tempo máximo de escuta: sem resposta vira silêncio e o microfone fecha', async () => {
    vi.useFakeTimers();
    const escuta = criarReconhecedor(5000).ouvir();

    await vi.advanceTimersByTimeAsync(5000);

    expect(await escuta).toEqual({ tipo: 'silencio' });
    expect(ultima().iniciado).toBe(false);
  });

  it.each([
    ['no-speech', { tipo: 'silencio' }],
    ['aborted', { tipo: 'cancelado' }],
    ['not-allowed', { tipo: 'erro', motivo: 'permissao' }],
    ['service-not-allowed', { tipo: 'erro', motivo: 'permissao' }],
    ['audio-capture', { tipo: 'erro', motivo: 'sem-microfone' }],
    ['network', { tipo: 'erro', motivo: 'rede' }],
    ['language-not-supported', { tipo: 'erro', motivo: 'indisponivel' }],
  ])('erro "%s" é traduzido', async (codigo, esperado) => {
    const escuta = criarReconhecedor().ouvir();
    ultima().onerror?.({ error: codigo });
    expect(await escuta).toEqual(esperado);
  });

  it('cancelar() fecha o microfone e resolve como "cancelado"', async () => {
    const reconhecedor = criarReconhecedor();
    const escuta = reconhecedor.ouvir();

    reconhecedor.cancelar();

    expect(await escuta).toEqual({ tipo: 'cancelado' });
    expect(ultima().iniciado).toBe(false);
  });

  it('abrir uma nova escuta cancela a anterior: nunca há dois microfones abertos', async () => {
    const reconhecedor = criarReconhecedor();
    const primeira = reconhecedor.ouvir();
    const antiga = ultima();

    void reconhecedor.ouvir();

    expect(await primeira).toEqual({ tipo: 'cancelado' });
    expect(antiga.iniciado).toBe(false);
    expect(ultima().iniciado).toBe(true);
  });

  it('start() que lança exceção vira erro "indisponivel"', async () => {
    vi.spyOn(ReconhecimentoFalso.prototype, 'start').mockImplementation(() => { throw new Error('InvalidStateError'); });
    expect(await criarReconhecedor().ouvir()).toEqual({ tipo: 'erro', motivo: 'indisponivel' });
  });

  it('sem suporte no navegador: suportado=false e erro "indisponivel"', async () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    const reconhecedor = criarReconhecedor();
    expect(reconhecedor.suportado).toBe(false);
    expect(await reconhecedor.ouvir()).toEqual({ tipo: 'erro', motivo: 'indisponivel' });
  });

  it('usa webkitSpeechRecognition quando é o único disponível (Chrome/Safari)', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', ReconhecimentoFalso);
    expect(criarReconhecedor().suportado).toBe(true);
  });
});

describe('permissão do microfone', () => {
  const comMicrofone = (getUserMedia: unknown) => vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const erro = (name: string) => Object.assign(new Error(name), { name });

  it('libera o microfone logo depois de testar a permissão', async () => {
    const parar = vi.fn();
    comMicrofone(vi.fn().mockResolvedValue({ getTracks: () => [{ stop: parar }] }));
    expect(await solicitarPermissaoDoMicrofone()).toBe('ok');
    expect(parar).toHaveBeenCalled();
  });

  it.each([['NotAllowedError', 'permissao'], ['SecurityError', 'permissao'], ['NotFoundError', 'sem-microfone']])(
    '%s => %s', async (nome, esperado) => {
      comMicrofone(vi.fn().mockRejectedValue(erro(nome)));
      expect(await solicitarPermissaoDoMicrofone()).toBe(esperado);
    });

  it('sem mediaDevices deixa o próprio reconhecimento pedir a permissão', async () => {
    vi.stubGlobal('navigator', {});
    expect(await solicitarPermissaoDoMicrofone()).toBe('ok');
  });

  it('outros erros não bloqueiam (o reconhecimento tratará)', async () => {
    comMicrofone(vi.fn().mockRejectedValue(erro('AbortError')));
    expect(await solicitarPermissaoDoMicrofone()).toBe('ok');
  });
});
