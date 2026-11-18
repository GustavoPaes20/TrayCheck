import type { RequestHandler } from 'express';
import { config } from '../config.js';
import { validarSessao, type UsuarioAutenticado } from '../dominio/sessoes.js';
import { rotaPublica } from './perfis.js';

// Identifica QUEM está chamando a API, a partir do token da sessão (RF02):
//   1) cabeçalho  Authorization: Bearer <token>   (o frontend guarda o token em memória), ou
//   2) cookie HttpOnly `traycheck_session`        (sobrevive a recarregar a página).
//
// Este middleware só identifica e preenche `req.usuario`. Quem decide permissão (401/403)
// é `autorizarPeloContrato`, em perfis.ts, lendo o `x-roles` de cada rota do openapi.yaml.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Preenchido quando há uma sessão válida. */
      usuario?: UsuarioAutenticado;
    }
  }
}

function tokenDoCabecalho(cabecalho: string | undefined): string | undefined {
  const [esquema, token] = (cabecalho ?? '').split(' ');
  return esquema?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/** Lê o cookie da sessão do cabeçalho `Cookie` (sem biblioteca extra). */
export function tokenDoCookie(cabecalho: string | undefined): string | undefined {
  for (const parte of (cabecalho ?? '').split(';')) {
    const [nome, ...resto] = parte.trim().split('=');
    if (nome === config.nomeDoCookie) return decodeURIComponent(resto.join('='));
  }
  return undefined;
}

export const autenticar: RequestHandler = async (req, _res, next) => {
  if (rotaPublica(req)) return next();

  const token = tokenDoCabecalho(req.headers.authorization) ?? tokenDoCookie(req.headers.cookie);
  if (!token) return next(); // sem token: a autorização responde 401

  req.usuario = await validarSessao(token); // token inválido/expirado => 401
  next();
};
