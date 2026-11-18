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

const doisDigitos = (n: number): string => String(n).padStart(2, '0');

/** Duração em segundos -> "45s", "6min 32s" ou "1h 05min 10s". */
export function duracaoLegivel(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${h}h ${doisDigitos(m)}min ${doisDigitos(s)}s`;
  if (m > 0) return `${m}min ${doisDigitos(s)}s`;
  return `${s}s`;
}

/** Horário "HH:mm:ss" no fuso do servidor (os DATETIME do banco não têm fuso). */
export const horaCompleta = (data: Date): string =>
  `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}:${doisDigitos(data.getSeconds())}`;

/** "2026-11-10T07:42:10" (texto do JSON do relatório) -> { date: "10/11/2026", time: "07:42" }, sem converter fuso. */
export function dataEHoraBr(iso: string): { date: string; time: string } {
  const [data = '', hora = ''] = iso.split('T');
  const [ano, mes, dia] = data.split('-');
  return { date: `${dia}/${mes}/${ano}`, time: hora.slice(0, 5) };
}

/** Data "dd/MM/yyyy" no fuso do servidor. */
export const dataBr = (data: Date): string =>
  `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}`;

/** Último acesso para exibição (AppUser.lastActive): "dd/MM/yyyy" ou "Nunca". */
export const ultimoAcessoLegivel = (data: Date | null): string => (data ? dataBr(data) : 'Nunca');
