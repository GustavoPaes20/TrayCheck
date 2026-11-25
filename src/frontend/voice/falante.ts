// Voz do assistente.
//
// - Conectado ao backend: TODA fala sai da ElevenLabs. Não existe voz do navegador de reserva: se a ElevenLabs falhar,
//   tenta de novo e, esgotadas as tentativas, `falhou` fica true e o controlador PAUSA a conversa (nunca fala robótico).
// - Modo demonstração (sem backend): só existe a voz do navegador.
//
// Contrato importante para a conferência: `falar()` devolve uma Promise que só se resolve QUANDO O ÁUDIO
// TERMINA (ou é cancelado). É isso que permite abrir o microfone depois — e nunca durante — a fala.
// Nunca rejeita: qualquer falha cai para a voz do navegador e, no pior caso, resolve sem som.

export type MotorDeVoz = 'elevenlabs' | 'navegador';

export type Falante = {
  /** Fala o texto e resolve quando termina. Uma nova fala cancela a anterior (nunca há duas ao mesmo tempo). */
  falar(texto: string): Promise<void>;
  /** Interrompe a fala em andamento (a Promise dela resolve). */
  cancelar(): void;
  /** Motor usado na última fala (para diagnóstico na tela). */
  readonly motor: MotorDeVoz | null;
  /** True quando a última fala NÃO saiu (ElevenLabs indisponível após as tentativas). Sempre false no modo demonstração. */
  readonly falhou?: boolean;
};

export type OpcoesDoFalante = {
  /** Busca o áudio no backend. Sem ela (modo demonstração) usa só a voz do navegador. */
  sintetizar?: (texto: string, sinal: AbortSignal) => Promise<Blob>;
  /** Quantas vezes tenta obter/tocar o áudio da ElevenLabs antes de desistir da fala. */
  tentativas?: number;
  /** Espera entre uma tentativa e a seguinte. */
  pausaEntreTentativasMs?: number;
  limiteDoCache?: number;
};

type Fala = { id: number; encerrar: () => void };

const TENTATIVAS_PADRAO = 3;
const PAUSA_ENTRE_TENTATIVAS_PADRAO = 600;
const LIMITE_PADRAO_DO_CACHE = 80;

/** Prefere uma voz pt-BR masculina conhecida; senão qualquer pt-BR; senão deixa o navegador decidir. */
function escolherVozDoNavegador(): SpeechSynthesisVoice | undefined {
  const vozes = window.speechSynthesis?.getVoices?.() ?? [];
  const ptBr = vozes.filter((v) => v.lang?.toLowerCase().replace('_', '-') === 'pt-br');
  const masculinas = /daniel|felipe|antonio|ant[oô]nio|ricardo|luciano|jorge|microsoft (?:antonio|daniel)/i;
  return ptBr.find((v) => masculinas.test(v.name)) ?? ptBr[0];
}

export function criarFalante(opcoes: OpcoesDoFalante = {}): Falante {
  const tentativas = Math.max(1, opcoes.tentativas ?? TENTATIVAS_PADRAO);
  const pausaEntreTentativas = opcoes.pausaEntreTentativasMs ?? PAUSA_ENTRE_TENTATIVAS_PADRAO;
  const limiteDoCache = opcoes.limiteDoCache ?? LIMITE_PADRAO_DO_CACHE;
  const cacheDeAudio = new Map<string, string>(); // texto -> URL do áudio já baixado
  let falhou = false;
  let sequencia = 0;
  let atual: Fala | null = null;
  let controleDaBusca: AbortController | null = null;
  let audioTocando: HTMLAudioElement | null = null;
  let liberarAudio: (() => void) | null = null;
  let motor: MotorDeVoz | null = null;

  function pararSons() {
    controleDaBusca?.abort();
    controleDaBusca = null;
    if (audioTocando) {
      audioTocando.onended = null;
      audioTocando.onerror = null;
      audioTocando.pause();
      audioTocando = null;
    }
    liberarAudio?.(); // a Promise do áudio cancelado resolve já (sem esperar o vigia)
    try { window.speechSynthesis?.cancel(); } catch { /* sem síntese de voz */ }
  }

  function cancelar() {
    const fala = atual;
    atual = null;
    pararSons();
    fala?.encerrar();
  }

  function guardarNoCache(texto: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    cacheDeAudio.set(texto, url);
    while (cacheDeAudio.size > limiteDoCache) {
      const maisAntigo = cacheDeAudio.keys().next().value as string;
      URL.revokeObjectURL(cacheDeAudio.get(maisAntigo)!);
      cacheDeAudio.delete(maisAntigo);
    }
  }

  function tocarAudio(url: string): Promise<boolean> {
    return new Promise<boolean>((resolver) => {
      const audio = new Audio(url);
      audioTocando = audio;
      const vigia = setTimeout(() => finalizar(true), 90_000); // rede de segurança contra áudio que nunca "termina"
      function finalizar(ok: boolean) {
        clearTimeout(vigia);
        if (audioTocando === audio) audioTocando = null;
        if (liberarAudio === liberar) liberarAudio = null;
        resolver(ok);
      }
      const liberar = () => finalizar(false);
      liberarAudio = liberar;
      audio.onended = () => finalizar(true);
      audio.onerror = () => finalizar(false);
      const inicio = audio.play();
      if (inicio && typeof inicio.catch === 'function') inicio.catch(() => finalizar(false)); // ex.: bloqueio de autoplay
    });
  }

  function falarComNavegador(texto: string): Promise<void> {
    return new Promise<void>((resolver) => {
      const sintese = window.speechSynthesis;
      if (!sintese || typeof SpeechSynthesisUtterance === 'undefined') return resolver();
      let encerrado = false;
      const encerrar = () => { if (!encerrado) { encerrado = true; clearTimeout(vigia); resolver(); } };
      // O Chrome às vezes nunca dispara `end`: o vigia garante que o fluxo não trava.
      const vigia = setTimeout(encerrar, Math.max(6000, texto.length * 140));
      const enunciado = new SpeechSynthesisUtterance(texto);
      enunciado.lang = 'pt-BR';
      enunciado.rate = 0.92;
      enunciado.pitch = 0.9;
      const voz = escolherVozDoNavegador();
      if (voz) enunciado.voice = voz;
      enunciado.onend = encerrar;
      enunciado.onerror = encerrar;
      try {
        sintese.cancel();
        sintese.speak(enunciado);
      } catch {
        encerrar();
      }
    });
  }

  /** Busca (ou reaproveita do cache) e toca o áudio da ElevenLabs. Tenta de novo se algo falhar. */
  async function falarComElevenLabs(texto: string, vigente: () => boolean): Promise<boolean> {
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      if (!vigente()) return false;
      let url = cacheDeAudio.get(texto);
      if (!url) {
        const controle = new AbortController();
        controleDaBusca = controle;
        try {
          guardarNoCache(texto, await opcoes.sintetizar!(texto, controle.signal));
          url = cacheDeAudio.get(texto);
        } catch {
          // 503, rede, tempo esgotado... tenta de novo abaixo
        } finally {
          if (controleDaBusca === controle) controleDaBusca = null;
        }
        if (!vigente()) return false;
      }
      if (url && await tocarAudio(url)) return true;
      if (!vigente()) return false;
      if (url) { // áudio que não tocou (corrompido, autoplay...): descarta e busca de novo na próxima tentativa
        URL.revokeObjectURL(url);
        cacheDeAudio.delete(texto);
      }
      if (tentativa < tentativas) await new Promise<void>((resolver) => setTimeout(resolver, pausaEntreTentativas));
    }
    return false;
  }

  async function falar(textoBruto: string): Promise<void> {
    const texto = textoBruto.replace(/\s+/g, ' ').trim();
    cancelar();
    falhou = false;
    if (!texto) return;

    const id = ++sequencia;
    let encerrar!: () => void;
    const terminou = new Promise<void>((resolver) => { encerrar = resolver; });
    const fala: Fala = { id, encerrar };
    atual = fala;
    const vigente = () => atual === fala;

    void (async () => {
      try {
        if (!opcoes.sintetizar) {
          // Modo demonstração (sem backend): só existe a voz do navegador.
          motor = 'navegador';
          await falarComNavegador(texto);
          return;
        }
        const saiu = await falarComElevenLabs(texto, vigente);
        if (!vigente()) return;
        if (saiu) {
          motor = 'elevenlabs';
        } else {
          motor = null;
          falhou = true; // o controlador pausa a conversa: nada de voz robótica no lugar
        }
      } finally {
        if (vigente()) atual = null;
        encerrar();
      }
    })();

    return terminou;
  }

  return { falar, cancelar, get motor() { return motor; }, get falhou() { return falhou; } };
}
