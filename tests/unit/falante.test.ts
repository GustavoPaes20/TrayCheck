import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarFalante } from '@/voice/falante';

// Falante: com backend toda fala é da ElevenLabs (sem voz do navegador de reserva); sem backend (demonstração) usa o navegador.

class AudioFalso {
  static instancias: AudioFalso[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pausado = false;
  constructor(public src: string) { AudioFalso.instancias.push(this); }
  play() { return Promise.resolve(); }
  pause() { this.pausado = true; }
  terminar() { this.onended?.(); }
}

class EnunciadoFalso {
  lang = ''; rate = 1; pitch = 1; voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

let faladasNoNavegador: EnunciadoFalso[];
const blobDeAudio = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' });

beforeEach(() => {
  AudioFalso.instancias = [];
  faladasNoNavegador = [];
  vi.stubGlobal('Audio', AudioFalso);
  vi.stubGlobal('SpeechSynthesisUtterance', EnunciadoFalso);
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [],
    cancel: vi.fn(),
    speak: vi.fn((e: EnunciadoFalso) => { faladasNoNavegador.push(e); setTimeout(() => e.onend?.(), 0); }),
  });
  URL.createObjectURL = vi.fn(() => `blob:audio-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.useRealTimers());

const esperarAudio = () => vi.waitFor(() => expect(AudioFalso.instancias.length).toBeGreaterThan(0));

describe('falante com ElevenLabs', () => {
  it('a Promise de falar() só resolve quando o áudio TERMINA', async () => {
    const sintetizar = vi.fn(async () => blobDeAudio());
    const falante = criarFalante({ sintetizar });
    let terminou = false;

    const fala = falante.falar('Pinça Kelly. Está disponível?').then(() => { terminou = true; });
    await esperarAudio();
    await Promise.resolve();
    expect(terminou).toBe(false); // áudio ainda tocando: o microfone não pode abrir

    AudioFalso.instancias[0]!.terminar();
    await fala;
    expect(terminou).toBe(true);
    expect(falante.motor).toBe('elevenlabs');
    expect(sintetizar).toHaveBeenCalledWith('Pinça Kelly. Está disponível?', expect.any(AbortSignal));
    expect(faladasNoNavegador).toHaveLength(0);
  });

  it('frases repetidas vêm do cache: o servidor é chamado uma única vez', async () => {
    const sintetizar = vi.fn(async () => blobDeAudio());
    const falante = criarFalante({ sintetizar });

    const primeira = falante.falar('Conferido.');
    await esperarAudio();
    AudioFalso.instancias[0]!.terminar();
    await primeira;

    const segunda = falante.falar('Conferido.');
    await vi.waitFor(() => expect(AudioFalso.instancias).toHaveLength(2));
    AudioFalso.instancias[1]!.terminar();
    await segunda;

    expect(sintetizar).toHaveBeenCalledTimes(1);
  });

  it('com backend, se a ElevenLabs falhar (503) tenta de novo e NUNCA usa a voz do navegador', async () => {
    const sintetizar = vi.fn(async () => { throw new Error('503'); });
    const falante = criarFalante({ sintetizar, tentativas: 3, pausaEntreTentativasMs: 0 });

    await falante.falar('Primeiro item.');

    expect(sintetizar).toHaveBeenCalledTimes(3);
    expect(falante.falhou).toBe(true);
    expect(falante.motor).toBeNull();
    expect(faladasNoNavegador).toEqual([]); // nada de voz robótica no lugar
    expect(AudioFalso.instancias).toHaveLength(0);
  });

  it('uma falha passageira é recuperada pela nova tentativa e a fala sai pela ElevenLabs', async () => {
    const sintetizar = vi.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValue(blobDeAudio());
    const falante = criarFalante({ sintetizar, pausaEntreTentativasMs: 0 });

    const fala = falante.falar('Olá.');
    await esperarAudio();
    AudioFalso.instancias[0].terminar();
    await fala;

    expect(sintetizar).toHaveBeenCalledTimes(2);
    expect(falante.falhou).toBe(false);
    expect(falante.motor).toBe('elevenlabs');
    expect(faladasNoNavegador).toEqual([]);
  });

  it('a falha de uma fala não contamina a próxima (falhou volta a false)', async () => {
    const sintetizar = vi.fn()
      .mockRejectedValueOnce(new Error('503')).mockRejectedValueOnce(new Error('503')).mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue(blobDeAudio());
    const falante = criarFalante({ sintetizar, tentativas: 3, pausaEntreTentativasMs: 0 });

    await falante.falar('Primeira.');
    expect(falante.falhou).toBe(true);

    const segunda = falante.falar('Segunda.');
    await esperarAudio();
    AudioFalso.instancias[0].terminar();
    await segunda;
    expect(falante.falhou).toBe(false);
    expect(falante.motor).toBe('elevenlabs');
  });

  it('se o áudio não puder tocar (erro/autoplay), descarta, busca de novo e não usa a voz do navegador', async () => {
    const sintetizar = vi.fn(async () => blobDeAudio());
    const falante = criarFalante({ sintetizar, pausaEntreTentativasMs: 0 });
    vi.spyOn(AudioFalso.prototype, 'play').mockRejectedValueOnce(new Error('NotAllowedError'));

    const fala = falante.falar('Olá.');
    await vi.waitFor(() => expect(AudioFalso.instancias).toHaveLength(2));
    AudioFalso.instancias[1].terminar();
    await fala;

    expect(sintetizar).toHaveBeenCalledTimes(2);
    expect(falante.motor).toBe('elevenlabs');
    expect(faladasNoNavegador).toEqual([]);
  });

  it('uma nova fala CANCELA a anterior: nunca há duas vozes ao mesmo tempo', async () => {
    const falante = criarFalante({ sintetizar: async () => blobDeAudio() });

    const primeira = falante.falar('Frase um.');
    await esperarAudio();
    const segunda = falante.falar('Frase dois.');

    await primeira; // a primeira resolve na hora (cancelada)
    expect(AudioFalso.instancias[0]!.pausado).toBe(true);
    await vi.waitFor(() => expect(AudioFalso.instancias).toHaveLength(2));
    AudioFalso.instancias[1]!.terminar();
    await segunda;
  });

  it('cancelar() corta o áudio e resolve a Promise', async () => {
    const falante = criarFalante({ sintetizar: async () => blobDeAudio() });
    const fala = falante.falar('Texto longo.');
    await esperarAudio();

    falante.cancelar();

    await fala;
    expect(AudioFalso.instancias[0]!.pausado).toBe(true);
  });

  it('cancelar() durante o download aborta a requisição e não toca nada', async () => {
    let sinalRecebido: AbortSignal | undefined;
    const falante = criarFalante({
      sintetizar: (_texto, sinal) => new Promise<Blob>((_, rejeitar) => { sinalRecebido = sinal; sinal.addEventListener('abort', () => rejeitar(new Error('abortado'))); }),
    });
    const fala = falante.falar('Demorada.');
    await vi.waitFor(() => expect(sinalRecebido).toBeDefined());

    falante.cancelar();

    await fala;
    expect(sinalRecebido!.aborted).toBe(true);
    expect(AudioFalso.instancias).toHaveLength(0);
    expect(faladasNoNavegador).toHaveLength(0);
  });
});

describe('falante só com a voz do navegador (modo demonstração)', () => {
  it('sem backend nunca marca falha (a voz do navegador é o único motor)', async () => {
    const falante = criarFalante();
    await falante.falar('Olá.');
    expect(falante.falhou).toBe(false);
    expect(falante.motor).toBe('navegador');
  });

  it('fala pelo navegador em pt-BR e resolve ao terminar', async () => {
    const falante = criarFalante();

    await falante.falar('  Bisturi,   1 unidade. ');

    expect(faladasNoNavegador[0]!.text).toBe('Bisturi, 1 unidade.');
    expect(faladasNoNavegador[0]!.lang).toBe('pt-BR');
    expect(falante.motor).toBe('navegador');
  });

  it('resolve mesmo se o navegador nunca disparar "end" (vigia contra travamento)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn(), speak: vi.fn() }); // nunca termina
    const falante = criarFalante();
    let terminou = false;

    void falante.falar('Oi.').then(() => { terminou = true; });
    await vi.advanceTimersByTimeAsync(5000);
    expect(terminou).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(terminou).toBe(true);
  });

  it('sem síntese de voz no navegador resolve na hora, sem erro', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    await expect(criarFalante().falar('Oi.')).resolves.toBeUndefined();
  });

  it('texto vazio não fala nada', async () => {
    await criarFalante().falar('   ');
    expect(faladasNoNavegador).toHaveLength(0);
  });
});
