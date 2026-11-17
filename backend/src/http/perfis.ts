import type { Request, RequestHandler } from 'express';
import { erros } from './erros.js';

// ── Equivalência de perfis ───────────────────────────────────────────────────
// O banco (tabela `perfil`) usa códigos em português; o contrato e o frontend usam `role` em inglês.
//   admin      <-> admin       (Administrador)
//   enfermeiro <-> nurse       (Enfermeiro(a) Instrumentador(a))
//   circulante <-> technician  (Circulante)

export const PAPEIS = ['admin', 'nurse', 'technician'] as const;
export type Papel = (typeof PAPEIS)[number];
export type PerfilBanco = 'admin' | 'enfermeiro' | 'circulante';

const PAPEL_POR_PERFIL: Record<PerfilBanco, Papel> = {
  admin: 'admin',
  enfermeiro: 'nurse',
  circulante: 'technician',
};

const PERFIL_POR_PAPEL: Record<Papel, PerfilBanco> = {
  admin: 'admin',
  nurse: 'enfermeiro',
  technician: 'circulante',
};

/** IDs fixos inseridos pela migração V001. */
export const ID_DO_PERFIL: Record<PerfilBanco, number> = { admin: 1, enfermeiro: 2, circulante: 3 };

export const paraPapel = (perfil: PerfilBanco): Papel => PAPEL_POR_PERFIL[perfil];
export const paraPerfilBanco = (papel: Papel): PerfilBanco => PERFIL_POR_PAPEL[papel];
export const ehPapel = (valor: unknown): valor is Papel => PAPEIS.includes(valor as Papel);

// ── Autorização (RN05: cada perfil executa só as ações do seu perfil) ────────

type OperacaoDoContrato = { security?: unknown[]; 'x-roles'?: string[] };

/** Operação do openapi.yaml que o validador associou a esta requisição. */
function operacaoDoContrato(req: Request): OperacaoDoContrato | undefined {
  return (req as Request & { openapi?: { schema: OperacaoDoContrato } }).openapi?.schema;
}

/** Rota pública: `security: []` ou `x-roles: []` no contrato (hoje só POST /auth/login). */
export function rotaPublica(req: Request): boolean {
  const operacao = operacaoDoContrato(req);
  if (!operacao) return false;
  return (Array.isArray(operacao.security) && operacao.security.length === 0)
    || (Array.isArray(operacao['x-roles']) && operacao['x-roles'].length === 0);
}

/**
 * Aplica, em TODAS as rotas, os perfis declarados em `x-roles` no openapi.yaml.
 * Assim o contrato é a fonte única de verdade: mudou o x-roles, mudou a permissão.
 *   - rota pública  -> segue
 *   - sem usuário   -> 401 NAO_AUTENTICADO
 *   - perfil fora   -> 403 SEM_PERMISSAO
 */
export const autorizarPeloContrato: RequestHandler = (req, _res, next) => {
  const operacao = operacaoDoContrato(req);
  if (!operacao || rotaPublica(req)) return next();

  if (!req.usuario) return next(erros.naoAutenticado());

  const permitidos = operacao['x-roles'];
  if (permitidos && !permitidos.includes(req.usuario.papel)) return next(erros.semPermissao());
  next();
};

/**
 * Restrição extra dentro de uma rota (quando a regra depende do caso, não só da operação).
 * Ex.: router.post('/x', exigirPerfis('admin'), handler)
 */
export function exigirPerfis(...papeis: Papel[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario) return next(erros.naoAutenticado());
    if (!papeis.includes(req.usuario.papel)) return next(erros.semPermissao());
    next();
  };
}
