import type { RowDataPacket } from 'mysql2/promise';
import { config } from '../config.js';
import { consultarUm } from '../db/pool.js';
import { dataBr, ultimoAcessoLegivel } from '../http/parametros.js';
import { paraPapel, type PerfilBanco } from '../http/perfis.js';

// Usuário no formato do contrato (`AuthUser`). Reaproveitado pelo login, /auth/me e,
// nas próximas fases, por /profile.

export type LinhaUsuario = RowDataPacket & {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  telefone: string | null;
  registro_profissional: string | null;
  turno: string | null;
  ativo: number;
  criado_em: Date;
  ultimo_acesso_em: Date | null;
  perfil: PerfilBanco;
};

export const COLUNAS_USUARIO = `u.id, u.nome, u.email, u.senha_hash, u.telefone, u.registro_profissional,
       u.turno, u.ativo, u.criado_em, u.ultimo_acesso_em, p.codigo AS perfil`;

/** "Ana Silva" -> "AS"; "Rafael" -> "RA". */
export function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return '?';
  const primeira = palavras[0]!;
  const ultima = palavras[palavras.length - 1]!;
  const letras = palavras.length === 1 ? primeira.slice(0, 2) : primeira[0]! + ultima[0]!;
  return letras.toLocaleUpperCase('pt-BR');
}

/** Campos que o contrato exige como texto saem como '' quando o banco guarda NULL. */
export function paraAuthUser(linha: LinhaUsuario) {
  return {
    id: String(linha.id),
    name: linha.nome,
    email: linha.email,
    role: paraPapel(linha.perfil),
    shift: linha.turno ?? '',
    initials: iniciais(linha.nome),
    hospital: config.hospital,
    phone: linha.telefone ?? '',
    ...(linha.registro_profissional ? { crm: linha.registro_profissional } : {}),
    joinedAt: dataBr(linha.criado_em),
  };
}

/** Usuário no formato de gestão (`AppUser`), usado pelas rotas /users. */
export function paraAppUser(linha: LinhaUsuario) {
  return {
    id: String(linha.id),
    name: linha.nome,
    email: linha.email,
    role: paraPapel(linha.perfil),
    shift: linha.turno ?? '',
    status: linha.ativo ? ('active' as const) : ('inactive' as const),
    lastActive: ultimoAcessoLegivel(linha.ultimo_acesso_em),
    initials: iniciais(linha.nome),
  };
}

export async function buscarUsuarioPorEmail(email: string): Promise<LinhaUsuario | undefined> {
  return consultarUm<LinhaUsuario>(
    `SELECT ${COLUNAS_USUARIO} FROM usuario u JOIN perfil p ON p.id = u.perfil_id WHERE u.email = ?`,
    [email],
  );
}

export async function buscarUsuarioPorId(id: number): Promise<LinhaUsuario | undefined> {
  return consultarUm<LinhaUsuario>(
    `SELECT ${COLUNAS_USUARIO} FROM usuario u JOIN perfil p ON p.id = u.perfil_id WHERE u.id = ?`,
    [id],
  );
}
