import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { emTransacao } from '../db/pool.js';
import { ID_DO_PERFIL } from '../http/perfis.js';
import { gerarHash, gerarSenhaInicial, LIMITE_BYTES_SENHA, senhaCabeNoBcrypt } from './senhas.js';

// RF01 — critério de aceite da ERS 2.5: o primeiro administrador é criado na implantação, por script,
// porque o cadastro de usuários exige um administrador autenticado. Usado por src/scripts/criar-admin.ts.
//
//  - Só cria se NÃO houver nenhum administrador ativo; depois disso, usuários são cadastrados pela API.
//  - A senha é informada (mín. 8 caracteres) ou gerada e devolvida UMA vez; no banco fica só o hash (RNF01).

export const SENHA_MINIMA = 8;

/** Mesmo formato que o contrato aceita (format: email), com os limites de tamanho das colunas. */
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ErroPrimeiroAdmin extends Error {}

export type DadosPrimeiroAdmin = { nome: string; email: string; senha?: string };

export type ResultadoPrimeiroAdmin =
  | { situacao: 'criado'; id: number; email: string; senhaGerada?: string }
  | { situacao: 'ja_existe'; administradoresAtivos: number };

/** Normaliza e valida os dados; lança ErroPrimeiroAdmin com uma mensagem para o terminal. */
export function validarDados(dados: DadosPrimeiroAdmin): Required<Omit<DadosPrimeiroAdmin, 'senha'>> & { senha?: string } {
  const nome = dados.nome.trim().replace(/\s+/g, ' ');
  const email = dados.email.trim().toLowerCase();
  if (!nome) throw new ErroPrimeiroAdmin('Informe o nome do administrador (--nome).');
  if (nome.length > 120) throw new ErroPrimeiroAdmin('O nome deve ter no máximo 120 caracteres.');
  if (!EMAIL_VALIDO.test(email) || email.length > 160) throw new ErroPrimeiroAdmin('Informe um e-mail válido (--email).');
  if (dados.senha !== undefined) {
    if (dados.senha.length < SENHA_MINIMA) throw new ErroPrimeiroAdmin(`A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`);
    if (!senhaCabeNoBcrypt(dados.senha)) throw new ErroPrimeiroAdmin(`A senha deve ter no máximo ${LIMITE_BYTES_SENHA} bytes.`);
  }
  return { nome, email, ...(dados.senha !== undefined ? { senha: dados.senha } : {}) };
}

export async function criarPrimeiroAdmin(entrada: DadosPrimeiroAdmin): Promise<ResultadoPrimeiroAdmin> {
  const dados = validarDados(entrada);
  const senhaGerada = dados.senha === undefined ? gerarSenhaInicial() : undefined;
  const hash = await gerarHash(dados.senha ?? senhaGerada!);

  return emTransacao(async (conexao) => {
    // Trava a linha do perfil admin: duas execuções simultâneas não criam dois "primeiros" administradores.
    await conexao.execute('SELECT id FROM perfil WHERE id = ? FOR UPDATE', [ID_DO_PERFIL.admin]);
    const [ativos] = await conexao.execute<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM usuario WHERE perfil_id = ? AND ativo = TRUE',
      [ID_DO_PERFIL.admin],
    );
    const total = Number(ativos[0]?.total ?? 0);
    if (total > 0) return { situacao: 'ja_existe', administradoresAtivos: total };

    const [mesmoEmail] = await conexao.execute<RowDataPacket[]>('SELECT id FROM usuario WHERE email = ?', [dados.email]);
    if (mesmoEmail.length > 0) {
      throw new ErroPrimeiroAdmin(`Já existe um usuário com o e-mail ${dados.email} (que não é administrador ativo).`);
    }

    const [resultado] = await conexao.execute<ResultSetHeader>(
      'INSERT INTO usuario (perfil_id, nome, email, senha_hash) VALUES (?, ?, ?, ?)',
      [ID_DO_PERFIL.admin, dados.nome, dados.email, hash],
    );
    return { situacao: 'criado', id: resultado.insertId, email: dados.email, ...(senhaGerada ? { senhaGerada } : {}) };
  });
}
