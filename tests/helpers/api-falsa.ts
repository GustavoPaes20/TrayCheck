import { vi } from 'vitest';
import { registrarFalaSintetizada } from './voz';

export const URL_BASE_DE_TESTE = 'http://api.test/api/v1';

export type ChamadaRegistrada = {
  url: string;
  caminho: string;
  metodo: string;
  cabecalhos: Headers;
  corpo: unknown;
  credenciais: RequestCredentials | undefined;
};

export type RespostaFalsa = { status?: number; corpo?: unknown };
export type RotaFalsa = RespostaFalsa | ((chamada: ChamadaRegistrada) => RespostaFalsa);

function criarResposta({ status = 200, corpo }: RespostaFalsa): Response {
  if (status === 204 || corpo === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Substitui `fetch` por um roteador em memória. As chaves das rotas têm o formato `"MÉTODO /caminho"`
 * (sem o prefixo `/api/v1`). Rotas não declaradas respondem 404, o que faz o teste falhar de forma explícita.
 */
export function instalarApiFalsa(rotas: Record<string, RotaFalsa>, prefixo = '/api/v1') {
  const chamadas: ChamadaRegistrada[] = [];

  const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, configuracao?: RequestInit) => {
    const url = new URL(String(entrada));
    const caminho = url.pathname.startsWith(prefixo) ? url.pathname.slice(prefixo.length) : url.pathname;
    const metodo = (configuracao?.method ?? 'GET').toUpperCase();
    const corpoTexto = typeof configuracao?.body === 'string' ? configuracao.body : undefined;
    const chamada: ChamadaRegistrada = {
      url: url.toString(),
      caminho,
      metodo,
      cabecalhos: new Headers(configuracao?.headers),
      corpo: corpoTexto ? JSON.parse(corpoTexto) : undefined,
      credenciais: configuracao?.credentials,
    };
    chamadas.push(chamada);

    const rota = rotas[`${metodo} ${caminho}`];
    if (!rota && metodo === 'POST' && caminho === '/voice/speech') {
      // Como o backend real: devolve o áudio da ElevenLabs (aqui, bytes de mentira) e o teste registra o que foi falado.
      registrarFalaSintetizada(String((chamada.corpo as { text?: string } | undefined)?.text ?? ''));
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
    }
    if (!rota) return criarResposta({ status: 404, corpo: { message: `Rota não simulada: ${metodo} ${caminho}` } });
    return criarResposta(typeof rota === 'function' ? rota(chamada) : rota);
  });

  vi.stubGlobal('fetch', fetchFalso);

  return {
    chamadas,
    fetchFalso,
    chamadasPara: (metodo: string, caminho: string) => chamadas.filter((chamada) => chamada.metodo === metodo && chamada.caminho === caminho),
  };
}

/** Carrega os módulos do app com a API habilitada (`VITE_API_BASE_URL` definida) e com estado limpo. */
export async function carregarModulosConectados() {
  vi.stubEnv('VITE_API_BASE_URL', URL_BASE_DE_TESTE);
  vi.resetModules();
  const api = await import('@/services/api');
  return { api };
}
