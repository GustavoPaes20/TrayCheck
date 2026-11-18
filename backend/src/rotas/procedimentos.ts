import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { consultar, consultarUm, executar } from '../db/pool.js';
import { erros } from '../http/erros.js';
import { aparar, booleanoDaConsulta, padraoDeBusca } from '../http/parametros.js';
import type { Categoria } from './instrumentais.js';

// RF03 — Cadastrar procedimentos (contrato: /surgeries).
// Só o administrador cadastra, edita e inativa (RN02): o x-roles do contrato barra os outros
// perfis com 403, e o gatilho do banco é a segunda barreira.

type EntradaProcedimento = {
  code: string;
  name: string;
  specialty: string;
  description?: string;
  duration?: string;
  active?: boolean;
};

type LinhaProcedimento = RowDataPacket & {
  id: number;
  codigo: string;
  nome: string;
  especialidade: string;
  descricao: string | null;
  duracao_estimada: string | null;
  ativo: number;
  versao_checklist: string | null;
};

// Cores da tela de seleção de cirurgia. Não há coluna no banco: o backend define por especialidade
// (as mesmas do frontend em modo demonstração). Especialidade nova usa a cor neutra.
const CORES_POR_ESPECIALIDADE: Record<string, { color: string; bgColor: string }> = {
  ortopedia: { color: '#2563EB', bgColor: '#DBEAFE' },
  cardiologia: { color: '#DC2626', bgColor: '#FEE2E2' },
  neurocirurgia: { color: '#7C3AED', bgColor: '#EDE9FE' },
  'cirurgia geral': { color: '#059669', bgColor: '#D1FAE5' },
  'obstetrícia': { color: '#DB2777', bgColor: '#FCE7F3' },
};
const COR_NEUTRA = { color: '#475569', bgColor: '#F1F5F9' };

const SELECT_PROCEDIMENTO = `
  SELECT p.id, p.codigo, p.nome, p.especialidade, p.descricao, p.duracao_estimada, p.ativo,
         cp.versao AS versao_checklist
    FROM procedimento p
    LEFT JOIN checklist_padrao cp ON cp.procedimento_id = p.id AND cp.ativo = TRUE`;

/** Linha do banco -> objeto `Surgery` do contrato. O `id` do contrato é o código legível (ex.: "joelho"). */
function paraContrato(linha: LinhaProcedimento) {
  const cores = CORES_POR_ESPECIALIDADE[linha.especialidade.toLowerCase()] ?? COR_NEUTRA;
  return {
    id: linha.codigo,
    code: linha.codigo,
    name: linha.nome,
    specialty: linha.especialidade,
    ...(linha.descricao ? { description: linha.descricao } : {}),
    duration: linha.duracao_estimada ?? 'Não informada',
    active: Boolean(linha.ativo),
    activeChecklistVersion: linha.versao_checklist,
    ...cores,
    // Ainda não existe tabela de agenda (sala, horário e cirurgias do dia): fica sem sala/horário.
    scheduledToday: 0,
  };
}

/** A URL aceita o código legível (`joelho`) ou o ID numérico. O código tem prioridade. */
async function buscarPorIdOuCodigo(idOuCodigo: string): Promise<LinhaProcedimento | undefined> {
  const porCodigo = await consultarUm<LinhaProcedimento>(`${SELECT_PROCEDIMENTO} WHERE p.codigo = ?`, [idOuCodigo]);
  if (porCodigo || !/^\d{1,10}$/.test(idOuCodigo)) return porCodigo;
  return consultarUm<LinhaProcedimento>(`${SELECT_PROCEDIMENTO} WHERE p.id = ?`, [Number(idOuCodigo)]);
}

async function obterOu404(idOuCodigo: string | undefined): Promise<LinhaProcedimento> {
  const linha = idOuCodigo ? await buscarPorIdOuCodigo(idOuCodigo) : undefined;
  if (!linha) throw erros.naoEncontrado('Procedimento não encontrado.');
  return linha;
}

function validarTextos(entrada: EntradaProcedimento) {
  const campos: Record<string, string> = {};
  const code = aparar(entrada.code);
  const name = aparar(entrada.name);
  const specialty = aparar(entrada.specialty);
  if (!code) campos.code = 'Informe o código.';
  if (!name) campos.name = 'Informe o nome.';
  if (!specialty) campos.specialty = 'Informe a especialidade.';
  if (Object.keys(campos).length) throw erros.validacao(campos);
  return {
    code,
    name,
    specialty,
    description: entrada.description === undefined ? null : aparar(entrada.description) || null,
    duration: entrada.duration === undefined ? null : aparar(entrada.duration) || null,
    active: entrada.active ?? true,
  };
}

export const rotasProcedimentos = Router();

// GET /surgeries?specialty=&active=&q=
rotasProcedimentos.get('/surgeries', async (req, res) => {
  const filtros: string[] = [];
  const parametros: unknown[] = [];

  if (typeof req.query.specialty === 'string' && req.query.specialty.trim()) {
    filtros.push('p.especialidade = ?');
    parametros.push(req.query.specialty.trim());
  }
  const ativo = booleanoDaConsulta(req.query.active);
  if (ativo !== undefined) {
    filtros.push('p.ativo = ?');
    parametros.push(ativo);
  }
  const busca = padraoDeBusca(req.query.q);
  if (busca) {
    filtros.push('(p.nome LIKE ? OR p.codigo LIKE ? OR p.especialidade LIKE ?)');
    parametros.push(busca, busca, busca);
  }

  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const linhas = await consultar<LinhaProcedimento>(`${SELECT_PROCEDIMENTO} ${onde} ORDER BY p.nome`, parametros);
  res.json(linhas.map(paraContrato));
});

// GET /surgeries/:id
rotasProcedimentos.get('/surgeries/:id', async (req, res) => {
  res.json(paraContrato(await obterOu404(req.params.id)));
});

// POST /surgeries — RN02: criado_por é o administrador logado (o gatilho do banco confere de novo)
rotasProcedimentos.post('/surgeries', async (req, res) => {
  const dados = validarTextos(req.body as EntradaProcedimento);
  await executar(
    `INSERT INTO procedimento (codigo, nome, especialidade, descricao, duracao_estimada, ativo, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [dados.code, dados.name, dados.specialty, dados.description, dados.duration, dados.active, req.usuario!.id],
  );
  res.status(201).json(paraContrato(await obterOu404(dados.code)));
});

// PUT /surgeries/:id
rotasProcedimentos.put('/surgeries/:id', async (req, res) => {
  const atual = await obterOu404(req.params.id);
  const dados = validarTextos(req.body as EntradaProcedimento);
  await executar(
    `UPDATE procedimento
        SET codigo = ?, nome = ?, especialidade = ?, descricao = ?, duracao_estimada = ?, ativo = ?
      WHERE id = ?`,
    [dados.code, dados.name, dados.specialty, dados.description, dados.duration, dados.active, atual.id],
  );
  res.json(paraContrato(await obterOu404(dados.code)));
});

// DELETE /surgeries/:id — inativa (o procedimento tem checklists e checagens no histórico)
rotasProcedimentos.delete('/surgeries/:id', async (req, res) => {
  const atual = await obterOu404(req.params.id);
  await executar('UPDATE procedimento SET ativo = FALSE WHERE id = ?', [atual.id]);
  res.status(204).end();
});

type LinhaItemDoKit = RowDataPacket & {
  instrumental_id: number;
  nome: string;
  quantidade_esperada: number;
  unidade: string;
  categoria: Categoria;
  critico: number;
};

// GET /surgeries/:id/kit — itens do checklist padrão ATIVO, no formato da tela de kits e da checagem por voz
rotasProcedimentos.get('/surgeries/:id/kit', async (req, res) => {
  const procedimento = await obterOu404(req.params.id);
  const itens = await consultar<LinhaItemDoKit>(
    `SELECT ic.instrumental_id, i.nome, ic.quantidade_esperada, i.unidade, i.categoria, i.critico
       FROM checklist_padrao cp
       JOIN item_checklist ic ON ic.checklist_padrao_id = cp.id
       JOIN instrumental i ON i.id = ic.instrumental_id
      WHERE cp.procedimento_id = ? AND cp.ativo = TRUE
      ORDER BY ic.ordem, i.nome`,
    [procedimento.id],
  );
  // Procedimento sem checklist ativo devolve lista vazia (ainda não há o que conferir).
  res.json(
    itens.map((item) => ({
      id: String(item.instrumental_id),
      name: item.nome,
      quantity: item.quantidade_esperada,
      unit: item.unidade,
      category: item.categoria,
      critical: Boolean(item.critico),
    })),
  );
});
