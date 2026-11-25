import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { ErroApi } from '../http/erros.js';

// Síntese de fala da ElevenLabs para o assistente da conferência.
//  - A chave fica só em variável de ambiente (config.voz) e nunca aparece em resposta, log ou erro.
//  - Frases iguais vêm de um cache em memória (a conferência repete as mesmas frases o tempo todo).
//  - Falha da ElevenLabs vira 503 VOZ_INDISPONIVEL: o frontend cai para a voz do navegador.

export type OpcoesDeVoz = typeof config.voz;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const indisponivel = () => new ErroApi(503, 'VOZ_INDISPONIVEL', 'A voz do assistente está indisponível no momento.');

export type AudioSintetizado = { audio: Buffer; doCache: boolean };

export function criarSintetizador(opcoes: OpcoesDeVoz = config.voz, buscar: FetchLike = fetch) {
  const cache = new Map<string, Buffer>();

  return async function sintetizar(textoBruto: string): Promise<AudioSintetizado> {
    const texto = textoBruto.replace(/\s+/g, ' ').trim();
    if (!texto) throw new ErroApi(400, 'VALIDACAO', 'Dados inválidos.', { fields: { text: 'Informe o texto.' } });
    if (!opcoes.chaveApi || !opcoes.idDaVoz) throw indisponivel();

    // A chave do cache inclui voz e modelo: trocar a voz no .env não serve áudio antigo.
    const chave = createHash('sha256').update(`${opcoes.idDaVoz}|${opcoes.idDoModelo}|${opcoes.velocidade}|${texto}`).digest('hex');
    const guardado = cache.get(chave);
    if (guardado) {
      cache.delete(chave);
      cache.set(chave, guardado); // reinsere: o mais recente fica por último (LRU)
      return { audio: guardado, doCache: true };
    }

    let resposta: Response;
    try {
      resposta = await buscar(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(opcoes.idDaVoz)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': opcoes.chaveApi, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text: texto,
            model_id: opcoes.idDoModelo,
            voice_settings: {
              stability: opcoes.estabilidade,
              similarity_boost: opcoes.similaridade,
              style: opcoes.estilo,
              use_speaker_boost: true,
              speed: opcoes.velocidade,
            },
          }),
          signal: AbortSignal.timeout(opcoes.tempoLimiteMs),
        },
      );
    } catch {
      throw indisponivel(); // rede fora, DNS, tempo esgotado
    }

    if (!resposta.ok) {
      // Só o status vai para o log — nunca o corpo nem os cabeçalhos (poderiam citar a chave).
      console.error(`[voz] ElevenLabs respondeu ${resposta.status}`);
      throw indisponivel();
    }

    const audio = Buffer.from(await resposta.arrayBuffer());
    if (audio.length === 0) throw indisponivel();

    cache.set(chave, audio);
    while (cache.size > opcoes.limiteCacheItens) cache.delete(cache.keys().next().value as string);
    return { audio, doCache: false };
  };
}

/** Limite simples de requisições por usuário numa janela de 1 minuto (protege o crédito da ElevenLabs). */
export function criarLimitador(limitePorMinuto: number, agora: () => number = Date.now) {
  const janelas = new Map<number, number[]>();
  return function permitir(usuarioId: number): boolean {
    const limite = agora() - 60_000;
    const recentes = (janelas.get(usuarioId) ?? []).filter((t) => t > limite);
    if (recentes.length >= limitePorMinuto) {
      janelas.set(usuarioId, recentes);
      return false;
    }
    recentes.push(agora());
    janelas.set(usuarioId, recentes);
    return true;
  };
}
