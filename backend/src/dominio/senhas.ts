import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

// Senhas (RNF01): só existem como hash bcrypt. O texto puro nunca é gravado nem registrado em log.

/** Custo do bcrypt: o mesmo das senhas do seed (~60 ms por hash). */
const CUSTO_BCRYPT = 10;

/** O bcrypt só considera os primeiros 72 bytes da senha; mais que isso seria ignorado em silêncio. */
export const LIMITE_BYTES_SENHA = 72;

export const senhaCabeNoBcrypt = (senha: string): boolean => Buffer.byteLength(senha, 'utf8') <= LIMITE_BYTES_SENHA;

export const gerarHash = (senha: string): Promise<string> => bcrypt.hash(senha, CUSTO_BCRYPT);

// Sem caracteres que se confundem ao ler ou digitar (0/O, 1/l/I).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Senha aleatória de 12 caracteres (~69 bits), sorteada com o gerador criptográfico do Node. */
export function gerarSenhaInicial(): string {
  return Array.from({ length: 12 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
}
