import type { RowDataPacket } from 'mysql2/promise';
import { consultar } from '../db/pool.js';
import { dataEHoraBr, duracaoLegivel, horaCompleta } from '../http/parametros.js';
import { paraPapel, type PerfilBanco } from '../http/perfis.js';
import { divergenciasDe, itensDe, type ItemChecagem } from './checagens.js';

// Relatório de conferência (RF10/RF11). Quem GERA é o banco: o gatilho trg_checagem_au grava a linha
// em `relatorio_conferencia` quando a checagem é finalizada. Aqui só LEMOS e convertemos para o contrato.

export type FiltrosRelatorio = {
  id?: number;
  checagemId?: number;
  status?: string;
  codigoProcedimento?: string;
  de?: string; // YYYY-MM-DD, inclusive
  ate?: string; // YYYY-MM-DD, inclusive
};

// Retrato gravado pelo gatilho em `conteudo` (JSON). Usamos os dados de cabeçalho dele (nome do
// procedimento, operador, versão, sala), que não mudam mesmo que o cadastro seja editado depois.
type Conteudo = {
  procedimento: { codigo: string; nome: string; especialidade: string };
  checklistVersao: string;
  operador: { id: number; nome: string; perfil: PerfilBanco };
  sala: string | null;
  iniciadaEm: string;
};

type LinhaRelatorio = RowDataPacket & {
  id: number;
  checagem_id: number;
  duracao_segundos: number;
  total_itens: number;
  confirmados: number;
  pulados: number;
  divergentes: number;
  divergencias: number;
  status: 'ok' | 'divergencia';
  conteudo: Conteudo | string;
};

const SITUACAO_NO_RELATORIO = { confirmado: 'confirmed', pulado: 'skipped', divergente: 'divergent' } as const;

function paraItemDoRelatorio(item: ItemChecagem) {
  return {
    id: item.instrumentId,
    name: item.name,
    quantity: item.expectedQuantity,
    unit: item.unit,
    category: item.category,
    critical: item.critical,
    // Relatório finalizado não tem item pendente (RN01); o filtro abaixo garante só os tratados.
    status: SITUACAO_NO_RELATORIO[item.status as keyof typeof SITUACAO_NO_RELATORIO],
    ...(item.recordedAt ? { confirmedAt: horaCompleta(new Date(item.recordedAt)) } : {}),
  };
}

export async function listarRelatorios(filtros: FiltrosRelatorio) {
  const onde: string[] = [];
  const parametros: unknown[] = [];
  if (filtros.id !== undefined) {
    onde.push('r.id = ?');
    parametros.push(filtros.id);
  }
  if (filtros.checagemId !== undefined) {
    onde.push('r.checagem_id = ?');
    parametros.push(filtros.checagemId);
  }
  if (filtros.status) {
    onde.push('r.status = ?');
    parametros.push(filtros.status);
  }
  if (filtros.codigoProcedimento) {
    onde.push('p.codigo = ?');
    parametros.push(filtros.codigoProcedimento);
  }
  if (filtros.de) {
    onde.push('DATE(r.gerado_em) >= ?');
    parametros.push(filtros.de);
  }
  if (filtros.ate) {
    onde.push('DATE(r.gerado_em) <= ?');
    parametros.push(filtros.ate);
  }

  const linhas = await consultar<LinhaRelatorio>(
    `SELECT r.id, r.checagem_id, r.duracao_segundos, r.total_itens, r.confirmados, r.pulados, r.divergentes,
            r.divergencias, r.status, r.conteudo
       FROM relatorio_conferencia r
       JOIN checagem c ON c.id = r.checagem_id
       JOIN checklist_padrao cp ON cp.id = c.checklist_padrao_id
       JOIN procedimento p ON p.id = cp.procedimento_id
      ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}
      ORDER BY r.id DESC`,
    parametros,
  );
  if (linhas.length === 0) return [];

  const checagemIds = linhas.map((linha) => linha.checagem_id);
  const [itens, divergencias] = await Promise.all([itensDe(checagemIds), divergenciasDe(checagemIds)]);

  return linhas.map((linha) => {
    // O mysql2 já devolve JSON como objeto; o JSON.parse cobre o caso de vir como texto.
    const conteudo: Conteudo = typeof linha.conteudo === 'string' ? JSON.parse(linha.conteudo) : linha.conteudo;
    const { date, time } = dataEHoraBr(conteudo.iniciadaEm);
    return {
      id: String(linha.id),
      checkId: String(linha.checagem_id),
      checklistVersion: conteudo.checklistVersao,
      room: conteudo.sala,
      surgeryId: conteudo.procedimento.codigo,
      surgeryName: conteudo.procedimento.nome,
      specialty: conteudo.procedimento.especialidade,
      operator: conteudo.operador.nome,
      operatorRole: paraPapel(conteudo.operador.perfil),
      date,
      time,
      duration: duracaoLegivel(linha.duracao_segundos),
      confirmed: linha.confirmados,
      skipped: linha.pulados,
      missing: linha.divergentes, // o contrato mantém o nome "missing" por compatibilidade
      total: linha.total_itens,
      divergences: linha.divergencias,
      status: linha.status,
      items: (itens.get(linha.checagem_id) ?? []).filter((item) => item.status !== 'pendente').map(paraItemDoRelatorio),
      divergenceDetails: divergencias.get(linha.checagem_id) ?? [],
    };
  });
}

export async function obterRelatorio(filtros: FiltrosRelatorio) {
  return (await listarRelatorios(filtros))[0];
}
