import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { consultar, consultarUm, executar } from '../db/pool.js';
import { erros } from '../http/erros.js';
import { aparar, booleanoDaConsulta, idDaRota, padraoDeBusca, paraIso } from '../http/parametros.js';

// RF03 — Cadastrar, editar e inativar instrumentais (contrato: /instruments).
// Quem pode o quê (RN05) vem do x-roles do openapi.yaml, aplicado em http/perfis.ts.

export type Categoria = 'EPI' | 'Instrumental' | 'Descartável' | 'Anestesia' | 'Implante';

type EntradaInstrumental = {
  code: string;
  name: string;
  category: Categoria;
  unit?: string;
  critical?: boolean;
  active?: boolean;
};

type LinhaInstrumental = RowDataPacket & {
  id: number;
  codigo: string;
  nome: string;
  categoria: Categoria;
  unidade: string;
  critico: number;
  ativo: number;
  criado_em: Date;
  atualizado_em: Date;
};

const COLUNAS = 'id, codigo, nome, categoria, unidade, critico, ativo, criado_em, atualizado_em';

/** Linha do banco (português) -> objeto `Instrument` do contrato (inglês). */
function paraContrato(linha: LinhaInstrumental) {
  return {
    id: String(linha.id),
    code: linha.codigo,
    name: linha.nome,
    category: linha.categoria,
    unit: linha.unidade,
    critical: Boolean(linha.critico),
    active: Boolean(linha.ativo),
    createdAt: paraIso(linha.criado_em),
    updatedAt: paraIso(linha.atualizado_em),
  };
}

/** Texto obrigatório não pode ser só espaços (o validador só checa o tipo). */
function validarTextos(entrada: EntradaInstrumental): EntradaInstrumental {
  const campos: Record<string, string> = {};
  const code = aparar(entrada.code);
  const name = aparar(entrada.name);
  const unit = entrada.unit === undefined ? 'unid' : aparar(entrada.unit);
  if (!code) campos.code = 'Informe o código.';
  if (!name) campos.name = 'Informe o nome.';
  if (!unit) campos.unit = 'Informe a unidade.';
  if (Object.keys(campos).length) throw erros.validacao(campos);
  return { ...entrada, code, name, unit };
}

async function buscarPorId(id: number): Promise<LinhaInstrumental | undefined> {
  return consultarUm<LinhaInstrumental>(`SELECT ${COLUNAS} FROM instrumental WHERE id = ?`, [id]);
}

async function obterOu404(id: number) {
  const linha = await buscarPorId(id);
  if (!linha) throw erros.naoEncontrado('Instrumental não encontrado.');
  return linha;
}

export const rotasInstrumentais = Router();

// GET /instruments?category=&active=&q=
rotasInstrumentais.get('/instruments', async (req, res) => {
  const filtros: string[] = [];
  const parametros: unknown[] = [];

  if (typeof req.query.category === 'string') {
    filtros.push('categoria = ?');
    parametros.push(req.query.category);
  }
  const ativo = booleanoDaConsulta(req.query.active);
  if (ativo !== undefined) {
    filtros.push('ativo = ?');
    parametros.push(ativo);
  }
  const busca = padraoDeBusca(req.query.q);
  if (busca) {
    filtros.push('(nome LIKE ? OR codigo LIKE ?)');
    parametros.push(busca, busca);
  }

  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const linhas = await consultar<LinhaInstrumental>(
    `SELECT ${COLUNAS} FROM instrumental ${onde} ORDER BY nome`,
    parametros,
  );
  res.json(linhas.map(paraContrato));
});

// GET /instruments/:id
rotasInstrumentais.get('/instruments/:id', async (req, res) => {
  res.json(paraContrato(await obterOu404(idDaRota(req.params.id))));
});

// POST /instruments
rotasInstrumentais.post('/instruments', async (req, res) => {
  const dados = validarTextos(req.body as EntradaInstrumental);
  const resultado = await executar(
    `INSERT INTO instrumental (codigo, nome, categoria, unidade, critico, ativo) VALUES (?, ?, ?, ?, ?, ?)`,
    [dados.code, dados.name, dados.category, dados.unit ?? 'unid', dados.critical ?? false, dados.active ?? true],
  );
  res.status(201).json(paraContrato(await obterOu404(resultado.insertId)));
});

// PUT /instruments/:id — substitui os dados (campos opcionais omitidos voltam ao padrão do contrato)
rotasInstrumentais.put('/instruments/:id', async (req, res) => {
  const id = idDaRota(req.params.id);
  await obterOu404(id);
  const dados = validarTextos(req.body as EntradaInstrumental);
  await executar(
    `UPDATE instrumental SET codigo = ?, nome = ?, categoria = ?, unidade = ?, critico = ?, ativo = ? WHERE id = ?`,
    [dados.code, dados.name, dados.category, dados.unit ?? 'unid', dados.critical ?? false, dados.active ?? true, id],
  );
  res.json(paraContrato(await obterOu404(id)));
});

// DELETE /instruments/:id — exclusão lógica: o instrumental pode estar em kits, checklists e checagens
rotasInstrumentais.delete('/instruments/:id', async (req, res) => {
  const id = idDaRota(req.params.id);
  await obterOu404(id);
  await executar('UPDATE instrumental SET ativo = FALSE WHERE id = ?', [id]);
  res.status(204).end();
});
