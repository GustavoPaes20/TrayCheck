import type { RequestHandler } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { config, emProducao } from '../config.js';
import { consultarUm } from '../db/pool.js';
import { erros } from './erros.js';
import { paraPapel, rotaPublica, type Papel, type PerfilBanco } from './perfis.js';

// ─────────────────────────────────────────────────────────────────────────────
// AUTENTICAÇÃO PROVISÓRIA — será substituída na fase do RF02 (login com bcrypt + token).
//
// Pela ordem de implementação (RF01 -> RF03 -> RF04 -> RF05..RF11 -> RF02/RF12), as rotas de
// cadastro e checagem vêm antes do login de verdade. Para já testá-las com perfis reais,
// esta versão aceita, SÓ em desenvolvimento e com AUTH_PROVISORIA=true:
//
//     Authorization: Bearer dev-<id do usuário>      (seed: dev-2 = admin, dev-1 = enfermeira, dev-4 = circulante)
//
// O usuário é buscado no banco (precisa existir e estar ativo), então perfis e RN05 já valem.
// ─────────────────────────────────────────────────────────────────────────────

export type UsuarioAutenticado = {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilBanco;
  papel: Papel;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Preenchido pelo middleware `autenticar` quando há uma sessão válida. */
      usuario?: UsuarioAutenticado;
    }
  }
}

if (config.autenticacaoProvisoria && emProducao) {
  throw new Error('AUTH_PROVISORIA=true não é permitido com NODE_ENV=production.');
}

const PREFIXO_TOKEN_PROVISORIO = 'dev-';

type LinhaUsuario = RowDataPacket & { id: number; nome: string; email: string; perfil: PerfilBanco };

async function buscarUsuarioAtivo(id: number): Promise<UsuarioAutenticado | undefined> {
  const linha = await consultarUm<LinhaUsuario>(
    `SELECT u.id, u.nome, u.email, p.codigo AS perfil
       FROM usuario u
       JOIN perfil p ON p.id = u.perfil_id
      WHERE u.id = ? AND u.ativo = TRUE`,
    [id],
  );
  return linha && { id: linha.id, nome: linha.nome, email: linha.email, perfil: linha.perfil, papel: paraPapel(linha.perfil) };
}

function tokenBearer(cabecalho: string | undefined): string | undefined {
  const [esquema, token] = (cabecalho ?? '').split(' ');
  return esquema?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Identifica o usuário da requisição e preenche `req.usuario`.
 * Não decide permissão: quem bloqueia (401/403) é `autorizarPeloContrato`, em perfis.ts.
 */
export const autenticar: RequestHandler = async (req, _res, next) => {
  if (rotaPublica(req)) return next();

  const token = tokenBearer(req.headers.authorization);
  if (!token) return next();

  if (config.autenticacaoProvisoria && token.startsWith(PREFIXO_TOKEN_PROVISORIO)) {
    const id = Number(token.slice(PREFIXO_TOKEN_PROVISORIO.length));
    if (!Number.isInteger(id) || id <= 0) return next(erros.naoAutenticado('Token provisório inválido.'));
    const usuario = await buscarUsuarioAtivo(id);
    if (!usuario) return next(erros.naoAutenticado('Usuário não encontrado ou inativo.'));
    req.usuario = usuario;
    return next();
  }

  // Token em formato desconhecido: na fase RF02 aqui entra a verificação do token real.
  next(erros.naoAutenticado());
};
