import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarReconhecedor, solicitarPermissaoDoMicrofone } from '@/voice/reconhecedor';

// Reconhecedor: UMA escuta por vez, só resultados finais, microfone fechado assim que a resposta chega.

class ReconhecimentoFalso {
  static instancias: ReconhecimentoFalso[] = [];
  lang = ''; continuous = true; interimResults = true; maxAlternatives = 1;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
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

  it('se o navegador encerra a escuta sem frase, o microfone é REABERTO até completar a janela (só então é silêncio)', async () => {
    vi.useFakeTimers();
    const escuta = criarReconhecedor(5000).ouvir();

    ultima().onend?.(); // fim espontâneo logo no início (o "1 segundo" do Chrome)
    await vi.advanceTimersByTimeAsync(300);
    expect(ReconhecimentoFalso.instancias).toHaveLength(2);
    expect(ultima().iniciado).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    expect(await escuta).toEqual({ tipo: 'silencio' });
    expect(ultima().iniciado).toBe(false); // microfone fechado no fim
  });

  it('a frase dita depois de uma reabertura vale normalmente', async () => {
    vi.useFakeTimers();
    const escuta = criarReconhecedor(5000).ouvir();
    ultima().onend?.();
    await vi.advanceTimersByTimeAsync(300);

    ultima().resultado('sim, está aqui');

    expect(await escuta).toMatchObject({ tipo: 'fala', alternativas: [{ transcript: 'sim, está aqui' }] });
  });

  it.each(['no-speech', 'aborted'])('erro "%s" do navegador reabre o microfone em vez de encerrar a janela', async (codigo) => {
    vi.useFakeTimers();
    const escuta = criarReconhecedor(5000).ouvir();

    ultima().onerror?.({ error: codigo });
    await vi.advanceTimersByTimeAsync(300);
    expect(ReconhecimentoFalso.instancias).toHaveLength(2);

    ultima().resultado('tem');
    expect(await escuta).toMatchObject({ tipo: 'fala' });
  });

  it('muitos encerramentos seguidos nunca estouram a janela nem deixam microfones abertos', async () => {
    vi.useFakeTimers();
    const escuta = criarReconhecedor(3000).ouvir();
    for (let i = 0; i < 8; i++) {
      ultima().onend?.();
      await vi.advanceTimersByTimeAsync(250);
    }
    await vi.advanceTimersByTimeAsync(3000);
    expect(await escuta).toEqual({ tipo: 'silencio' });
    expect(ReconhecimentoFalso.instancias.filter((r) => r.iniciado)).toHaveLength(0);
  });

  it('permissão negada NÃO reabre: encerra na hora', async () => {
    const escuta = criarReconhecedor().ouvir();
    ultima().onerror?.({ error: 'not-allowed' });
    expect(await escuta).toEqual({ tipo: 'erro', motivo: 'permissao' });
    expect(ReconhecimentoFalso.instancias).toHaveLength(1);
  });

  it('tempo máximo de escuta: sem resposta vira silêncio e o microfone fecha', async () => {
    vi.useFakeTimers();
    const escuta = criarReconhecedor(5000).ouvir();

    await vi.advanceTimersByTimeAsync(5000);

    expect(await escuta).toEqual({ tipo: 'silencio' });
    expect(ultima().iniciado).toBe(false);
  });

  it.each([
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

describe('aviso de microfone aberto e diagnóstico', () => {
  it('aoAbrir só é chamado quando o navegador começa a captar áudio (uma vez)', () => {
    const aoAbrir = vi.fn();
    void criarReconhecedor().ouvir(aoAbrir);
    expect(aoAbrir).not.toHaveBeenCalled(); // start() foi chamado, mas ainda não captou
    ultima().onaudiostart?.();
    ultima().onstart?.();
    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });

  it('aoAbrir é chamado uma só vez mesmo com reaberturas da escuta', async () => {
    vi.useFakeTimers();
    const aoAbrir = vi.fn();
    void criarReconhecedor(5000).ouvir(aoAbrir);
    ultima().onaudiostart?.();
    ultima().onend?.();
    await vi.advanceTimersByTimeAsync(300);
    ultima().onaudiostart?.();
    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });

  it('usa onstart quando o navegador não tem onaudiostart', () => {
    const aoAbrir = vi.fn();
    void criarReconhecedor().ouvir(aoAbrir);
    ultima().onstart?.();
    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });

  it('registra no Console por que e quando a escuta terminou', async () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const escuta = criarReconhecedor(1000).ouvir();
    ultima().onend?.();
    await vi.advanceTimersByTimeAsync(1000);
    await escuta;
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/o navegador encerrou a escuta \(end\) após \d+ ms; reabrindo o microfone \(1\)/));
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/\[voz\] escuta encerrada: silencio após \d+ ms; microfone aberto: não; reinícios: 1/));
    info.mockRestore();
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
