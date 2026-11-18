import { Router } from 'express';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { consultar, consultarUm, emTransacao, executar } from '../db/pool.js';
import { ErroApi, erros } from '../http/erros.js';
import { aparar, dataHoraBr, idDaRota, padraoDeBusca } from '../http/parametros.js';
import type { Categoria } from './instrumentais.js';

// Estoque (contrato: /stock). Leitura para todos; cadastro, edição, exclusão e ajustes só do Administrador.
//
// Modelo do banco: cada INSTRUMENTAL tem no máximo UM saldo (`estoque_item`). Nome, unidade e categoria
// ficam no instrumental. Todo ajuste de quantidade vira uma MOVIMENTAÇÃO imutável (`estoque_movimentacao`);
// um gatilho do banco aplica a movimentação no saldo e impede saldo negativo.

type EntradaEstoque = {
  name: string;
  available: number;
  minimum: number;
  unit: string;
  category: Categoria;
  instrumentId?: string;
};

type LinhaEstoque = RowDataPacket & {
  id: number;
  instrumental_id: number;
  nome: string;
  quantidade_disponivel: number;
  quantidade_minima: number;
  unidade: string;
  categoria: Categoria;
  situacao: 'ok' | 'low' | 'critical';
  atualizado_em: Date;
  atualizado_por_nome: string | null;
};

/** Limite de segurança: o saldo é INT UNSIGNED e o delta INT; valores absurdos viram 400 em vez de erro 500. */
const QUANTIDADE_MAXIMA = 1_000_000_000;

const SQL_ESTOQUE = `
  SELECT e.id, e.instrumental_id, i.nome, e.quantidade_disponivel, e.quantidade_minima, i.unidade, i.categoria,
         e.situacao, e.atualizado_em, u.nome AS atualizado_por_nome
    FROM estoque_item e
    JOIN instrumental i ON i.id = e.instrumental_id
    LEFT JOIN usuario u ON u.id = e.atualizado_por`;

function paraContrato(linha: LinhaEstoque) {
  return {
    id: String(linha.id),
    instrumentId: String(linha.instrumental_id),
    name: linha.nome,
    available: linha.quantidade_disponivel,
    minimum: linha.quantidade_minima,
    unit: linha.unidade,
    category: linha.categoria,
    status: linha.situacao,
    lastUpdated: dataHoraBr(linha.atualizado_em),
    updatedBy: linha.atualizado_por_nome ?? '—',
  };
}

async function obterOu404(id: number): Promise<LinhaEstoque> {
  const linha = await consultarUm<LinhaEstoque>(`${SQL_ESTOQUE} WHERE e.id = ?`, [id]);
  if (!linha) throw erros.naoEncontrado('Item de estoque não encontrado.');
  return linha;
}

function validarEntrada(entrada: EntradaEstoque) {
  const campos: Record<string, string> = {};
  const nome = aparar(entrada.name);
  const unidade = aparar(entrada.unit);
  if (!nome) campos.name = 'Informe o nome.';
  if (!unidade) campos.unit = 'Informe a unidade.';
  if (entrada.available > QUANTIDADE_MAXIMA) campos.available = 'Quantidade acima do limite permitido.';
  if (entrada.minimum > QUANTIDADE_MAXIMA) campos.minimum = 'Quantidade acima do limite permitido.';
  if (entrada.instrumentId !== undefined && !/^\d{1,10}$/.test(entrada.instrumentId)) campos.instrumentId = 'Instrumental inválido.';
  if (Object.keys(campos).length) throw erros.validacao(campos);
  return { nome, unidade };
}

/** "Luvas Estéreis (7,5)" -> "luvas-estereis-7-5", o mesmo estilo dos códigos do seed. */
function codigoDoNome(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34);
  return base || 'item';
}

/** Primeiro código livre: base, base-2, base-3... */
async function codigoLivre(conexao: PoolConnection, nome: string): Promise<string> {
  const base = codigoDoNome(nome);
  for (let tentativa = 1; tentativa <= 50; tentativa += 1) {
    const candidato = tentativa === 1 ? base : `${base}-${tentativa}`;
    const [existe] = await conexao.execute<RowDataPacket[]>('SELECT id FROM instrumental WHERE codigo = ?', [candidato]);
    if (existe.length === 0) return candidato;
  }
  throw erros.conflito('DUPLICADO', 'Não foi possível gerar um código único para o instrumental.');
}

async function registrarMovimentacao(
  conexao: PoolConnection,
  estoqueItemId: number,
  delta: number,
  motivo: string | null,
  usuarioId: number,
): Promise<void> {
  // O gatilho do banco soma o delta ao saldo (e recusa saldo negativo).
  await conexao.execute('INSERT INTO estoque_movimentacao (estoque_item_id, delta, motivo, usuario_id) VALUES (?, ?, ?, ?)', [
    estoqueItemId,
    delta,
    motivo,
    usuarioId,
  ]);
}

export const rotasEstoque = Router();

// GET /stock?status=&category=&q=
rotasEstoque.get('/stock', async (req, res) => {
  const filtros: string[] = [];
  const parametros: unknown[] = [];
  if (typeof req.query.status === 'string') {
    filtros.push('e.situacao = ?');
    parametros.push(req.query.status);
  }
  if (typeof req.query.category === 'string' && req.query.category.trim()) {
    filtros.push('i.categoria = ?');
    parametros.push(req.query.category.trim());
  }
  const busca = padraoDeBusca(req.query.q);
  if (busca) {
    filtros.push('(i.nome LIKE ? OR i.codigo LIKE ?)');
    parametros.push(busca, busca);
  }
  const linhas = await consultar<LinhaEstoque>(
    `${SQL_ESTOQUE} ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''} ORDER BY i.nome`,
    parametros,
  );
  res.json(linhas.map(paraContrato));
});

// POST /stock — com instrumentId usa o instrumental existente; sem ele, cadastra o instrumental
rotasEstoque.post('/stock', async (req, res) => {
  const entrada = req.body as EntradaEstoque;
  const { nome, unidade } = validarEntrada(entrada);
  const usuarioId = req.usuario!.id;

  const novoId = await emTransacao(async (conexao) => {
    let instrumentalId: number;

    if (entrada.instrumentId !== undefined) {
      instrumentalId = Number(entrada.instrumentId);
      const [achados] = await conexao.execute<RowDataPacket[]>('SELECT id FROM instrumental WHERE id = ?', [instrumentalId]);
      if (achados.length === 0) throw erros.validacao({ instrumentId: 'Instrumental não encontrado.' });
      const [comSaldo] = await conexao.execute<RowDataPacket[]>('SELECT id FROM estoque_item WHERE instrumental_id = ?', [instrumentalId]);
      if (comSaldo.length > 0) {
        throw new ErroApi(409, 'DUPLICADO', 'Já existe um saldo de estoque para este instrumental.', {
          fields: { instrumentId: 'Já existe um saldo de estoque para este instrumental.' },
        });
      }
    } else {
      // Sem instrumentId: cadastra o instrumental (nome repetido => 409 pelo tratador de erros).
      const [instrumental] = await conexao.execute<ResultSetHeader>(
        'INSERT INTO instrumental (codigo, nome, categoria, unidade, critico) VALUES (?, ?, ?, ?, FALSE)',
        [await codigoLivre(conexao, nome), nome, entrada.category, unidade],
      );
      instrumentalId = instrumental.insertId;
    }

    // O saldo inicial entra direto no cadastro (não é "movimentação"); só os ajustes seguintes geram histórico.
    const [saldo] = await conexao.execute<ResultSetHeader>(
      'INSERT INTO estoque_item (instrumental_id, quantidade_disponivel, quantidade_minima, atualizado_por) VALUES (?, ?, ?, ?)',
      [instrumentalId, entrada.available, entrada.minimum, usuarioId],
    );
    return saldo.insertId;
  });

  res.status(201).json(paraContrato(await obterOu404(novoId)));
});

// PUT /stock/:id — atualiza nome/unidade/categoria (do instrumental), mínimo e, se mudou, o saldo (via movimentação)
rotasEstoque.put('/stock/:id', async (req, res) => {
  const id = idDaRota(req.params.id);
  const entrada = req.body as EntradaEstoque;
  const { nome, unidade } = validarEntrada(entrada);
  const usuarioId = req.usuario!.id;

  await emTransacao(async (conexao) => {
    const [linhas] = await conexao.execute<RowDataPacket[]>(
      'SELECT instrumental_id, quantidade_disponivel FROM estoque_item WHERE id = ? FOR UPDATE',
      [id],
    );
    const atual = linhas[0] as { instrumental_id: number; quantidade_disponivel: number } | undefined;
    if (!atual) throw erros.naoEncontrado('Item de estoque não encontrado.');

    if (entrada.instrumentId !== undefined && Number(entrada.instrumentId) !== atual.instrumental_id) {
      throw erros.validacao({ instrumentId: 'Não é possível trocar o instrumental de um saldo existente.' });
    }

    await conexao.execute('UPDATE instrumental SET nome = ?, unidade = ?, categoria = ? WHERE id = ?', [
      nome,
      unidade,
      entrada.category,
      atual.instrumental_id,
    ]);
    await conexao.execute('UPDATE estoque_item SET quantidade_minima = ?, atualizado_por = ? WHERE id = ?', [
      entrada.minimum,
      usuarioId,
      id,
    ]);

    // Toda mudança de quantidade passa por uma movimentação (rastreabilidade).
    const diferenca = entrada.available - atual.quantidade_disponivel;
    if (diferenca !== 0) await registrarMovimentacao(conexao, id, diferenca, 'Ajuste pela edição do item', usuarioId);
  });

  res.json(paraContrato(await obterOu404(id)));
});

// DELETE /stock/:id — só enquanto não houver movimentações (o histórico é imutável)
rotasEstoque.delete('/stock/:id', async (req, res) => {
  const id = idDaRota(req.params.id);
  await obterOu404(id);

  const movimentacoes = await consultarUm<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM estoque_movimentacao WHERE estoque_item_id = ?',
    [id],
  );
  if (Number(movimentacoes?.total ?? 0) > 0) {
    throw erros.conflito('ITEM_COM_MOVIMENTACOES', 'Este item possui movimentações e não pode ser excluído.');
  }

  // Se uma movimentação surgir entre a conferência e o DELETE, a chave estrangeira recusa e o tratador responde 409.
  await executar('DELETE FROM estoque_item WHERE id = ?', [id]);
  res.status(204).end();
});

// POST /stock/:id/adjustments — entrada (delta > 0) ou saída (delta < 0)
rotasEstoque.post('/stock/:id/adjustments', async (req, res) => {
  const id = idDaRota(req.params.id);
  const { delta, reason } = req.body as { delta: number; reason?: string };

  if (delta === 0) throw erros.validacao({ delta: 'O ajuste deve ser diferente de zero.' }, 'O ajuste deve ser diferente de zero.');
  if (Math.abs(delta) > QUANTIDADE_MAXIMA) throw erros.validacao({ delta: 'Quantidade acima do limite permitido.' });

  await emTransacao(async (conexao) => {
    // Trava o saldo: duas saídas simultâneas não conseguem, juntas, passar de zero.
    const [linhas] = await conexao.execute<RowDataPacket[]>(
      'SELECT quantidade_disponivel FROM estoque_item WHERE id = ? FOR UPDATE',
      [id],
    );
    const saldo = linhas[0] as { quantidade_disponivel: number } | undefined;
    if (!saldo) throw erros.naoEncontrado('Item de estoque não encontrado.');
    if (saldo.quantidade_disponivel + delta < 0) {
      throw new ErroApi(400, 'ESTOQUE_INSUFICIENTE', 'Estoque insuficiente para esta movimentação.');
    }
    await registrarMovimentacao(conexao, id, delta, reason === undefined ? null : aparar(reason) || null, req.usuario!.id);
  });

  res.json(paraContrato(await obterOu404(id)));
});
