// Voz do assistente: ElevenLabs (via backend) com a voz do navegador como alternativa.
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
};

export type OpcoesDoFalante = {
  /** Busca o áudio no backend. Sem ela (modo demonstração) usa só a voz do navegador. */
  sintetizar?: (texto: string, sinal: AbortSignal) => Promise<Blob>;
  /** Depois de uma falha do servidor, fica este tempo sem tentar de novo (evita chamadas inúteis). */
  pausaAposFalhaMs?: number;
  limiteDoCache?: number;
};

type Fala = { id: number; encerrar: () => void };

const PAUSA_APOS_FALHA_PADRAO = 120_000;
const LIMITE_PADRAO_DO_CACHE = 80;

/** Prefere uma voz pt-BR masculina conhecida; senão qualquer pt-BR; senão deixa o navegador decidir. */
function escolherVozDoNavegador(): SpeechSynthesisVoice | undefined {
  const vozes = window.speechSynthesis?.getVoices?.() ?? [];
  const ptBr = vozes.filter((v) => v.lang?.toLowerCase().replace('_', '-') === 'pt-br');
  const masculinas = /daniel|felipe|antonio|ant[oô]nio|ricardo|luciano|jorge|microsoft (?:antonio|daniel)/i;
  return ptBr.find((v) => masculinas.test(v.name)) ?? ptBr[0];
}

export function criarFalante(opcoes: OpcoesDoFalante = {}): Falante {
  const pausaAposFalha = opcoes.pausaAposFalhaMs ?? PAUSA_APOS_FALHA_PADRAO;
  const limiteDoCache = opcoes.limiteDoCache ?? LIMITE_PADRAO_DO_CACHE;
  const cacheDeAudio = new Map<string, string>(); // texto -> URL do áudio já baixado
  let servidorIndisponivelAte = 0;
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

  async function falar(textoBruto: string): Promise<void> {
    const texto = textoBruto.replace(/\s+/g, ' ').trim();
    cancelar();
    if (!texto) return;

    const id = ++sequencia;
    let encerrar!: () => void;
    const terminou = new Promise<void>((resolver) => { encerrar = resolver; });
    const fala: Fala = { id, encerrar };
    atual = fala;
    const vigente = () => atual === fala;

    void (async () => {
      try {
        let url = cacheDeAudio.get(texto);
        const podeUsarServidor = Boolean(opcoes.sintetizar) && Date.now() >= servidorIndisponivelAte;
        if (!url && podeUsarServidor) {
          const controle = new AbortController();
          controleDaBusca = controle;
          try {
            guardarNoCache(texto, await opcoes.sintetizar!(texto, controle.signal));
            url = cacheDeAudio.get(texto);
          } catch {
            if (!vigente()) return;
            servidorIndisponivelAte = Date.now() + pausaAposFalha; // 503, rede, timeout...
          } finally {
            if (controleDaBusca === controle) controleDaBusca = null;
          }
        }
        if (!vigente()) return;

        if (url && await tocarAudio(url)) {
          motor = 'elevenlabs';
        } else {
          if (!vigente()) return;
          motor = 'navegador';
          await falarComNavegador(texto);
        }
      } finally {
        if (vigente()) atual = null;
        encerrar();
      }
    })();

    return terminou;
  }

  return { falar, cancelar, get motor() { return motor; } };
}
