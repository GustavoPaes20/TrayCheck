import { Router } from 'express';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { consultar, consultarUm, emTransacao, executar } from '../db/pool.js';
import { erros } from '../http/erros.js';
import { aparar, booleanoDaConsulta, idDaRota, padraoDeBusca } from '../http/parametros.js';

// RF01 — Cadastrar, editar e inativar kits (contrato: /kits).
// Um kit tem uma lista de itens (instrumental + quantidade); criar/editar o kit e seus itens
// acontece numa transação: ou grava tudo, ou nada.

type ItemEntrada = { instrumentId: string; quantity: number };
type EntradaKit = { code: string; name: string; description?: string; active?: boolean; items: ItemEntrada[] };

type LinhaKit = RowDataPacket & { id: number; codigo: string; nome: string; descricao: string | null; ativo: number };
type LinhaItem = RowDataPacket & { kit_id: number; instrumental_id: number; nome: string; quantidade: number };

async function carregarKits(filtroSql = '', parametros: unknown[] = []) {
  const kits = await consultar<LinhaKit>(
    `SELECT id, codigo, nome, descricao, ativo FROM kit ${filtroSql} ORDER BY nome`,
    parametros,
  );
  if (kits.length === 0) return [];

  // Uma única consulta traz os itens de todos os kits (evita uma consulta por kit).
  const marcadores = kits.map(() => '?').join(',');
  const itens = await consultar<LinhaItem>(
    `SELECT ki.kit_id, ki.instrumental_id, i.nome, ki.quantidade
       FROM kit_instrumental ki
       JOIN instrumental i ON i.id = ki.instrumental_id
      WHERE ki.kit_id IN (${marcadores})
      ORDER BY i.nome`,
    kits.map((kit) => kit.id),
  );

  return kits.map((kit) => ({
    id: String(kit.id),
    code: kit.codigo,
    name: kit.nome,
    // `description` é opcional no contrato: some quando está vazio, em vez de ir como null.
    ...(kit.descricao ? { description: kit.descricao } : {}),
    active: Boolean(kit.ativo),
    items: itens
      .filter((item) => item.kit_id === kit.id)
      .map((item) => ({
        instrumentId: String(item.instrumental_id),
        instrumentName: item.nome,
        quantity: item.quantidade,
      })),
  }));
}

async function obterKitOu404(id: number) {
  const [kit] = await carregarKits('WHERE id = ?', [id]);
  if (!kit) throw erros.naoEncontrado('Kit não encontrado.');
  return kit;
}

/**
 * Confere os itens do kit e devolve (ID numérico, quantidade) já validados:
 *  - sem instrumental repetido;
 *  - todo instrumental existe;
 *  - não entra instrumental inativo (exceto os que já estavam no kit, para ele continuar editável).
 */
async function validarItens(itens: ItemEntrada[], jaNoKit: Set<number> = new Set()) {
  const campos: Record<string, string> = {};
  const vistos = new Set<number>();
  const validos: Array<{ id: number; quantidade: number }> = [];

  itens.forEach((item, posicao) => {
    const campo = `items.${posicao}.instrumentId`;
    if (!/^\d{1,10}$/.test(item.instrumentId)) {
      campos[campo] = 'Instrumental inválido.';
      return;
    }
    const id = Number(item.instrumentId);
    if (vistos.has(id)) {
      campos[campo] = 'Instrumental repetido no kit.';
      return;
    }
    vistos.add(id);
    validos.push({ id, quantidade: item.quantity });
  });

  if (validos.length > 0 && Object.keys(campos).length === 0) {
    const encontrados = await consultar<RowDataPacket & { id: number; ativo: number }>(
      `SELECT id, ativo FROM instrumental WHERE id IN (${validos.map(() => '?').join(',')})`,
      validos.map((item) => item.id),
    );
    const porId = new Map(encontrados.map((linha) => [linha.id, Boolean(linha.ativo)]));
    itens.forEach((item, posicao) => {
      const ativo = porId.get(Number(item.instrumentId));
      const campo = `items.${posicao}.instrumentId`;
      if (ativo === undefined) campos[campo] = 'Instrumental não encontrado.';
      else if (!ativo && !jaNoKit.has(Number(item.instrumentId))) campos[campo] = 'Instrumental inativo.';
    });
  }

  if (Object.keys(campos).length) throw erros.validacao(campos);
  return validos;
}

function validarTextos(entrada: EntradaKit) {
  const campos: Record<string, string> = {};
  const code = aparar(entrada.code);
  const name = aparar(entrada.name);
  if (!code) campos.code = 'Informe o código.';
  if (!name) campos.name = 'Informe o nome.';
  if (Object.keys(campos).length) throw erros.validacao(campos);
  const description = entrada.description === undefined ? null : aparar(entrada.description) || null;
  return { code, name, description, active: entrada.active ?? true };
}

async function gravarItens(conexao: PoolConnection, kitId: number, itens: Array<{ id: number; quantidade: number }>) {
  await conexao.query('INSERT INTO kit_instrumental (kit_id, instrumental_id, quantidade) VALUES ?', [
    itens.map((item) => [kitId, item.id, item.quantidade]),
  ]);
}

export const rotasKits = Router();

// GET /kits?active=&q=
rotasKits.get('/kits', async (req, res) => {
  const filtros: string[] = [];
  const parametros: unknown[] = [];
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
  res.json(await carregarKits(filtros.length ? `WHERE ${filtros.join(' AND ')}` : '', parametros));
});

// GET /kits/:id
rotasKits.get('/kits/:id', async (req, res) => {
  res.json(await obterKitOu404(idDaRota(req.params.id)));
});

// POST /kits
rotasKits.post('/kits', async (req, res) => {
  const entrada = req.body as EntradaKit;
  const dados = validarTextos(entrada);
  const itens = await validarItens(entrada.items);

  const kitId = await emTransacao(async (conexao) => {
    const [resultado] = await conexao.execute<ResultSetHeader>(
      'INSERT INTO kit (codigo, nome, descricao, ativo) VALUES (?, ?, ?, ?)',
      [dados.code, dados.name, dados.description, dados.active],
    );
    await gravarItens(conexao, resultado.insertId, itens);
    return resultado.insertId;
  });

  res.status(201).json(await obterKitOu404(kitId));
});

// PUT /kits/:id — atualiza o kit e SUBSTITUI a lista de itens
rotasKits.put('/kits/:id', async (req, res) => {
  const id = idDaRota(req.params.id);
  const atual = await obterKitOu404(id);
  const entrada = req.body as EntradaKit;
  const dados = validarTextos(entrada);
  const itens = await validarItens(entrada.items, new Set(atual.items.map((item) => Number(item.instrumentId))));

  await emTransacao(async (conexao) => {
    await conexao.execute('UPDATE kit SET codigo = ?, nome = ?, descricao = ?, ativo = ? WHERE id = ?', [
      dados.code,
      dados.name,
      dados.description,
      dados.active,
      id,
    ]);
    await conexao.execute('DELETE FROM kit_instrumental WHERE kit_id = ?', [id]);
    await gravarItens(conexao, id, itens);
  });

  res.json(await obterKitOu404(id));
});

// DELETE /kits/:id — inativa (exclusão lógica)
rotasKits.delete('/kits/:id', async (req, res) => {
  const id = idDaRota(req.params.id);
  const existe = await consultarUm<RowDataPacket>('SELECT id FROM kit WHERE id = ?', [id]);
  if (!existe) throw erros.naoEncontrado('Kit não encontrado.');
  await executar('UPDATE kit SET ativo = FALSE WHERE id = ?', [id]);
  res.status(204).end();
});
