import { createHash, randomBytes } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { config } from '../config.js';
import { consultarUm, executar } from '../db/pool.js';
import { erros } from '../http/erros.js';
import { paraPapel, type Papel, type PerfilBanco } from '../http/perfis.js';

// Sessões de login (RF02), guardadas na tabela `sessao` (migração V006).
//
//  - O token é aleatório (256 bits). No banco fica só o hash SHA-256 dele (RNF01): quem lê o banco
//    não consegue usar uma sessão aberta.
//  - A sessão expira após 8 horas SEM atividade: cada uso renova `ultimo_uso_em`.
//  - Só vale sessão de usuário ATIVO. Inativar um usuário derruba as sessões dele na hora.
//  - Todas as contas de tempo usam o relógio do banco (NOW()), para não misturar fusos.

export type UsuarioAutenticado = {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilBanco;
  papel: Papel;
  /** Sessão em uso (para o logout). */
  sessaoId: number;
};

/** Renova a atividade no máximo uma vez por minuto, para não gravar no banco a cada requisição. */
const RENOVAR_APOS_SEGUNDOS = 60;

const hashDoToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Cria a sessão e devolve o token em texto (a única vez em que ele existe fora do cliente). */
export async function criarSessao(usuarioId: number): Promise<string> {
  // Limpeza oportuna: apaga as sessões já encerradas ou expiradas deste usuário.
  await executar(
    `DELETE FROM sessao
      WHERE usuario_id = ?
        AND (revogada_em IS NOT NULL OR TIMESTAMPDIFF(SECOND, ultimo_uso_em, NOW()) > ?)`,
    [usuarioId, config.sessaoOciosaSegundos],
  );
  const token = randomBytes(32).toString('base64url');
  await executar('INSERT INTO sessao (usuario_id, token_hash) VALUES (?, ?)', [usuarioId, hashDoToken(token)]);
  return token;
}

type LinhaSessao = RowDataPacket & {
  sessao_id: number;
  id: number;
  nome: string;
  email: string;
  perfil: PerfilBanco;
  ociosa: number;
};

/**
 * Confere o token e devolve o usuário da sessão, renovando a atividade.
 * Lança 401 se o token for desconhecido, estiver encerrado, tiver expirado por inatividade
 * ou pertencer a usuário inativo.
 */
export async function validarSessao(token: string): Promise<UsuarioAutenticado> {
  const linha = await consultarUm<LinhaSessao>(
    `SELECT s.id AS sessao_id, u.id, u.nome, u.email, p.codigo AS perfil,
            TIMESTAMPDIFF(SECOND, s.ultimo_uso_em, NOW()) > ? AS ociosa
       FROM sessao s
       JOIN usuario u ON u.id = s.usuario_id
       JOIN perfil p ON p.id = u.perfil_id
      WHERE s.token_hash = ? AND s.revogada_em IS NULL AND u.ativo = TRUE`,
    [config.sessaoOciosaSegundos, hashDoToken(token)],
  );
  if (!linha) throw erros.naoAutenticado();

  if (linha.ociosa) {
    await revogarSessao(linha.sessao_id);
    throw erros.naoAutenticado();
  }

  await executar(
    'UPDATE sessao SET ultimo_uso_em = NOW() WHERE id = ? AND TIMESTAMPDIFF(SECOND, ultimo_uso_em, NOW()) >= ?',
    [linha.sessao_id, RENOVAR_APOS_SEGUNDOS],
  );

  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    perfil: linha.perfil,
    papel: paraPapel(linha.perfil),
    sessaoId: linha.sessao_id,
  };
}

/** Logout: encerra uma sessão. */
export async function revogarSessao(sessaoId: number): Promise<void> {
  await executar('UPDATE sessao SET revogada_em = NOW() WHERE id = ? AND revogada_em IS NULL', [sessaoId]);
}

/**
 * Encerra TODAS as sessões de um usuário. Deve ser chamada ao inativá-lo (RF12): sem isso, uma
 * reativação logo depois faria as sessões antigas voltarem a valer.
 */
export async function revogarSessoesDoUsuario(usuarioId: number): Promise<void> {
  await executar('UPDATE sessao SET revogada_em = NOW() WHERE usuario_id = ? AND revogada_em IS NULL', [usuarioId]);
}
