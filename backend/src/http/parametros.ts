import { erros } from './erros.js';

// Pequenos utilitários para ler parâmetros de rota/consulta e formatar valores de resposta.
// O validador do contrato já garantiu o formato geral; aqui só convertemos tipos.

/** ID numérico da URL (`/instruments/12`). Texto que não é número => 404, pois nenhum registro tem esse ID. */
export function idDaRota(valor: string | undefined): number {
  if (valor === undefined || !/^\d{1,10}$/.test(valor)) throw erros.naoEncontrado();
  return Number(valor);
}

/** `?active=true|false` -> boolean; ausente -> undefined (sem filtro). */
export function booleanoDaConsulta(valor: unknown): boolean | undefined {
  if (valor === undefined || valor === '') return undefined;
  if (valor === true || valor === 'true') return true;
  if (valor === false || valor === 'false') return false;
  return undefined;
}

/** `?q=texto` -> padrão para LIKE, escapando % e _ digitados pelo usuário. */
export function padraoDeBusca(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const texto = valor.trim();
  if (!texto) return undefined;
  return `%${texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%`;
}

/** DATETIME do banco -> ISO 8601, como o contrato (`format: date-time`). */
export const paraIso = (data: Date): string => data.toISOString();

/** Remove espaços das pontas de campos de texto de entrada. */
export const aparar = (texto: string): string => texto.trim();
