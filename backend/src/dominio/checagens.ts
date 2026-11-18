import type { RowDataPacket } from 'mysql2/promise';
import { consultar } from '../db/pool.js';
import { paraIso } from '../http/parametros.js';
import type { Categoria } from '../rotas/instrumentais.js';

// Leitura de checagens, itens e divergências no formato do contrato (Check, CheckSummary,
// CheckItem, Divergence). Usado pelas rotas de /checks e pelos relatórios.

export type StatusChecagem = 'em_andamento' | 'finalizada' | 'cancelada';

export type FiltrosChecagem = {
  id?: number;
  status?: string;
  codigoProcedimento?: string;
  operadorId?: number;
  de?: string; // YYYY-MM-DD, inclusive
  ate?: string; // YYYY-MM-DD, inclusive
};

type LinhaChecagem = RowDataPacket & {
  id: number;
  procedimento_codigo: string;
  procedimento_nome: string;
  versao: string;
  usuario_id: number;
  operador: string;
  status: StatusChecagem;
  sala: string | null;
  observacao: string | null;
  iniciada_em: Date;
  finalizada_em: Date | null;
  relatorio_id: number | null;
  total: number;
  pendentes: number;
  confirmados: number;
  pulados: number;
  divergentes: number;
};

type LinhaItem = RowDataPacket & {
  id: number;
  checagem_id: number;
  item_checklist_id: number;
  instrumental_id: number;
  nome: string;
  unidade: string;
  categoria: Categoria;
  critico: number;
  ordem: number;
  quantidade_esperada: number;
  quantidade_encontrada: number | null;
  status: 'pendente' | 'confirmado' | 'pulado' | 'divergente';
  metodo_confirmacao: 'voz' | 'toque' | null;
  transcricao: string | null;
  registrado_em: Date | null;
  registrado_por_nome: string | null;
};

type LinhaDivergencia = RowDataPacket & {
  id: number;
  checagem_id: number;
  item_checagem_id: number | null;
  instrumental_id: number | null;
  descricao: string | null;
  tipo: 'faltante' | 'excedente' | 'outro';
  quantidade_esperada: number | null;
  quantidade_encontrada: number | null;
  observacao: string | null;
  gerada_automaticamente: number;
  registrada_em: Date;
  registrada_por_nome: string | null;
};

export type ItemChecagem = ReturnType<typeof paraItem>;
export type Divergencia = ReturnType<typeof paraDivergencia>;

const texto = (valor: number | null): string | null => (valor === null ? null : String(valor));

function paraItem(linha: LinhaItem) {
  return {
    id: String(linha.id),
    checklistItemId: String(linha.item_checklist_id),
    instrumentId: String(linha.instrumental_id),
    name: linha.nome,
    unit: linha.unidade,
    category: linha.categoria,
    critical: Boolean(linha.critico),
    order: linha.ordem,
    expectedQuantity: linha.quantidade_esperada,
    foundQuantity: linha.quantidade_encontrada,
    status: linha.status,
    method: linha.metodo_confirmacao,
    transcript: linha.transcricao,
    recordedAt: linha.registrado_em ? paraIso(linha.registrado_em) : null,
    recordedBy: linha.registrado_por_nome,
  };
}

function paraDivergencia(linha: LinhaDivergencia) {
  return {
    id: String(linha.id),
    checkId: String(linha.checagem_id),
    checkItemId: texto(linha.item_checagem_id),
    instrumentId: texto(linha.instrumental_id),
    description: linha.descricao,
    type: linha.tipo,
    expectedQuantity: linha.quantidade_esperada,
    foundQuantity: linha.quantidade_encontrada,
    notes: linha.observacao,
    automatic: Boolean(linha.gerada_automaticamente),
    recordedAt: paraIso(linha.registrada_em),
    recordedBy: linha.registrada_por_nome,
  };
}

const marcadores = (ids: number[]): string => ids.map(() => '?').join(',');

/** Itens de várias checagens de uma vez (uma consulta só), agrupados por ID da checagem. */
export async function itensDe(checagemIds: number[]): Promise<Map<number, ItemChecagem[]>> {
  const porChecagem = new Map<number, ItemChecagem[]>();
  if (checagemIds.length === 0) return porChecagem;
  const linhas = await consultar<LinhaItem>(
    `SELECT ich.id, ich.checagem_id, ich.item_checklist_id, ic.instrumental_id, i.nome, i.unidade, i.categoria,
            i.critico, ic.ordem, ich.quantidade_esperada, ich.quantidade_encontrada, ich.status,
            ich.metodo_confirmacao, ich.transcricao, ich.registrado_em, ur.nome AS registrado_por_nome
       FROM item_checagem ich
       JOIN item_checklist ic ON ic.id = ich.item_checklist_id
       JOIN instrumental i ON i.id = ic.instrumental_id
       LEFT JOIN usuario ur ON ur.id = ich.registrado_por
      WHERE ich.checagem_id IN (${marcadores(checagemIds)})
      ORDER BY ic.ordem, i.nome`,
    checagemIds,
  );
  for (const linha of linhas) {
    const lista = porChecagem.get(linha.checagem_id) ?? [];
    lista.push(paraItem(linha));
    porChecagem.set(linha.checagem_id, lista);
  }
  return porChecagem;
}

/**
 * Divergências de várias checagens, agrupadas por ID da checagem.
 * Nas automáticas (que nascem de um item), o instrumental e o nome vêm do item do checklist.
 */
export async function divergenciasDe(checagemIds: number[]): Promise<Map<number, Divergencia[]>> {
  const porChecagem = new Map<number, Divergencia[]>();
  if (checagemIds.length === 0) return porChecagem;
  const linhas = await consultar<LinhaDivergencia>(
    `SELECT d.id, d.checagem_id, d.item_checagem_id,
            COALESCE(d.instrumental_id, ic.instrumental_id) AS instrumental_id,
            COALESCE(d.descricao_item, i.nome) AS descricao,
            d.tipo, d.quantidade_esperada, d.quantidade_encontrada, d.observacao, d.gerada_automaticamente,
            d.registrada_em, ur.nome AS registrada_por_nome
       FROM divergencia d
       LEFT JOIN item_checagem ich ON ich.id = d.item_checagem_id
       LEFT JOIN item_checklist ic ON ic.id = ich.item_checklist_id
       LEFT JOIN instrumental i ON i.id = COALESCE(d.instrumental_id, ic.instrumental_id)
       LEFT JOIN usuario ur ON ur.id = d.registrada_por
      WHERE d.checagem_id IN (${marcadores(checagemIds)})
      ORDER BY d.id`,
    checagemIds,
  );
  for (const linha of linhas) {
    const lista = porChecagem.get(linha.checagem_id) ?? [];
    lista.push(paraDivergencia(linha));
    porChecagem.set(linha.checagem_id, lista);
  }
  return porChecagem;
}

async function linhasDeChecagem(filtros: FiltrosChecagem): Promise<LinhaChecagem[]> {
  const onde: string[] = [];
  const parametros: unknown[] = [];
  if (filtros.id !== undefined) {
    onde.push('c.id = ?');
    parametros.push(filtros.id);
  }
  if (filtros.status) {
    onde.push('c.status = ?');
    parametros.push(filtros.status);
  }
  if (filtros.codigoProcedimento) {
    onde.push('p.codigo = ?');
    parametros.push(filtros.codigoProcedimento);
  }
  if (filtros.operadorId !== undefined) {
    onde.push('c.usuario_id = ?');
    parametros.push(filtros.operadorId);
  }
  if (filtros.de) {
    onde.push('DATE(c.iniciada_em) >= ?');
    parametros.push(filtros.de);
  }
  if (filtros.ate) {
    onde.push('DATE(c.iniciada_em) <= ?');
    parametros.push(filtros.ate);
  }

  return consultar<LinhaChecagem>(
    `SELECT c.id, p.codigo AS procedimento_codigo, p.nome AS procedimento_nome, cp.versao, c.usuario_id,
            u.nome AS operador, c.status, c.sala, c.observacao, c.iniciada_em, c.finalizada_em,
            r.id AS relatorio_id,
            COUNT(ich.id) AS total,
            COALESCE(SUM(ich.status = 'pendente'), 0)   AS pendentes,
            COALESCE(SUM(ich.status = 'confirmado'), 0) AS confirmados,
            COALESCE(SUM(ich.status = 'pulado'), 0)     AS pulados,
            COALESCE(SUM(ich.status = 'divergente'), 0) AS divergentes
       FROM checagem c
       JOIN checklist_padrao cp ON cp.id = c.checklist_padrao_id
       JOIN procedimento p ON p.id = cp.procedimento_id
       JOIN usuario u ON u.id = c.usuario_id
       LEFT JOIN relatorio_conferencia r ON r.checagem_id = c.id
       LEFT JOIN item_checagem ich ON ich.checagem_id = c.id
      ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}
      GROUP BY c.id, p.codigo, p.nome, cp.versao, c.usuario_id, u.nome, c.status, c.sala, c.observacao,
               c.iniciada_em, c.finalizada_em, r.id
      ORDER BY c.iniciada_em DESC, c.id DESC`,
    parametros,
  );
}

function paraResumo(linha: LinhaChecagem) {
  return {
    id: String(linha.id),
    surgeryId: linha.procedimento_codigo,
    surgeryName: linha.procedimento_nome,
    checklistVersion: linha.versao,
    operatorId: String(linha.usuario_id),
    operator: linha.operador,
    status: linha.status,
    room: linha.sala,
    startedAt: paraIso(linha.iniciada_em),
    finishedAt: linha.finalizada_em ? paraIso(linha.finalizada_em) : null,
    reportId: texto(linha.relatorio_id),
    progress: {
      total: Number(linha.total),
      pending: Number(linha.pendentes),
      confirmed: Number(linha.confirmados),
      skipped: Number(linha.pulados),
      divergent: Number(linha.divergentes),
    },
  };
}

/** Histórico (RF10): resumos das checagens, da mais recente para a mais antiga. */
export async function listarResumos(filtros: FiltrosChecagem) {
  return (await linhasDeChecagem(filtros)).map(paraResumo);
}

/** Checagem completa (`Check`): resumo + observação + itens + divergências. */
export async function obterChecagem(id: number) {
  const [linha] = await linhasDeChecagem({ id });
  if (!linha) return undefined;
  const [itens, divergencias] = await Promise.all([itensDe([id]), divergenciasDe([id])]);
  return {
    ...paraResumo(linha),
    notes: linha.observacao,
    items: itens.get(id) ?? [],
    divergences: divergencias.get(id) ?? [],
  };
}
