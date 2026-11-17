import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { config } from '../config.js';

// Pool de conexões com o MySQL: abre algumas conexões e as reaproveita entre as requisições,
// em vez de conectar e desconectar a cada consulta.
export const pool = mysql.createPool({
  host: config.banco.host,
  port: config.banco.porta,
  user: config.banco.usuario,
  password: config.banco.senha,
  database: config.banco.nome,
  connectionLimit: config.banco.limiteConexoes,
  waitForConnections: true,
  charset: 'utf8mb4',
  // As colunas DATETIME do banco não têm fuso; tratamos tudo como horário local do servidor.
  timezone: 'local',
  // DECIMAL volta como número (ex.: quantidades), e não como string.
  decimalNumbers: true,
});

type Parametros = Record<string, unknown> | unknown[];

/** Executa um SELECT e devolve as linhas já tipadas. */
export async function consultar<T extends RowDataPacket>(sql: string, parametros: Parametros = []): Promise<T[]> {
  const [linhas] = await pool.execute<T[]>(sql, parametros as never);
  return linhas;
}

/** Executa um SELECT e devolve só a primeira linha (ou undefined). */
export async function consultarUm<T extends RowDataPacket>(sql: string, parametros: Parametros = []): Promise<T | undefined> {
  const linhas = await consultar<T>(sql, parametros);
  return linhas[0];
}

/** Executa INSERT/UPDATE/DELETE e devolve o resultado (insertId, affectedRows...). */
export async function executar(sql: string, parametros: Parametros = []): Promise<ResultSetHeader> {
  const [resultado] = await pool.execute<ResultSetHeader>(sql, parametros as never);
  return resultado;
}

/**
 * Roda várias operações numa transação: se qualquer uma falhar, todas são desfeitas (ROLLBACK).
 * Uso: await emTransacao(async (conexao) => { await conexao.execute(...); ... });
 */
export async function emTransacao<T>(operacao: (conexao: PoolConnection) => Promise<T>): Promise<T> {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    const resultado = await operacao(conexao);
    await conexao.commit();
    return resultado;
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
  }
}

/** Confere se o banco responde e se as migrações foram aplicadas. Usado na subida e no /health. */
export async function verificarBanco(): Promise<{ versoes: string[] }> {
  const linhas = await consultar<RowDataPacket & { versao: string }>(
    'SELECT versao FROM schema_versao ORDER BY versao',
  );
  return { versoes: linhas.map((linha) => linha.versao) };
}

export async function encerrarPool(): Promise<void> {
  await pool.end();
}
