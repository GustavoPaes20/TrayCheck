import { Router } from 'express';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { consultar, emTransacao } from '../db/pool.js';
import { divergenciasDe, listarResumos, obterChecagem, type StatusChecagem } from '../dominio/checagens.js';
import { obterRelatorio } from '../dominio/relatorios.js';
import { ErroApi, erros } from '../http/erros.js';
import { aparar, idDaRota } from '../http/parametros.js';
import { obterProcedimentoOu404 } from './procedimentos.js';

// RF05 a RF08 e RF11 — execução da checagem (contrato: /checks).
//
// O banco já garante as regras de fundo (RN01, RN03, RN04, RN07) com gatilhos; a API valida a entrada,
// confere permissões (x-roles), escolhe a resposta HTTP certa e monta o JSON do contrato.
//  - RF05: o gatilho copia os itens do checklist como "pendente" ao inserir a checagem.
//  - RF06: o gatilho converte "confirmado com quantidade diferente" em "divergente" e cria a divergência.
//  - RF08/RF09: ao finalizar, o gatilho gera o relatório de conferência.
//  - RN03: checagem finalizada ou cancelada não aceita mais alteração (409).

type TipoDivergencia = 'faltante' | 'excedente' | 'outro';
type EntradaInicio = { surgeryId: string; room?: string; notes?: string };
type EntradaItem = {
  status: 'confirmado' | 'pulado' | 'divergente' | 'pendente';
  foundQuantity?: number;
  method?: 'voz' | 'toque';
  transcript?: string;
  notes?: string;
};
type EntradaDivergencia = {
  type: TipoDivergencia;
  instrumentId?: string;
  description?: string;
  expectedQuantity?: number;
  foundQuantity?: number;
  notes?: string;
};

const textoOuNulo = (valor: string | undefined): string | null => (valor === undefined ? null : aparar(valor) || null);

/** Trava a linha da checagem durante a transação e confere que ainda está em andamento (RN03). */
async function travarEmAndamento(conexao: PoolConnection, checagemId: number): Promise<void> {
  const [linhas] = await conexao.execute<RowDataPacket[]>('SELECT status FROM checagem WHERE id = ? FOR UPDATE', [checagemId]);
  const checagem = linhas[0] as { status: StatusChecagem } | undefined;
  if (!checagem) throw erros.naoEncontrado('Checagem não encontrada.');
  if (checagem.status !== 'em_andamento') throw erros.checagemEncerradaPor(checagem.status);
}

export const rotasChecagens = Router();

// GET /checks?status=&surgeryId=&operatorId=&from=&to= — histórico (RF10)
rotasChecagens.get('/checks', async (req, res) => {
  let operadorId: number | undefined;
  if (typeof req.query.operatorId === 'string') {
    if (!/^\d{1,10}$/.test(req.query.operatorId)) throw erros.validacao({ operatorId: 'Operador inválido.' });
    operadorId = Number(req.query.operatorId);
  }
  res.json(
    await listarResumos({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      codigoProcedimento: typeof req.query.surgeryId === 'string' ? req.query.surgeryId : undefined,
      operadorId,
      de: typeof req.query.from === 'string' ? req.query.from : undefined,
      ate: typeof req.query.to === 'string' ? req.query.to : undefined,
    }),
  );
});

// POST /checks — RF05: inicia a checagem a partir do checklist ATIVO do procedimento
rotasChecagens.post('/checks', async (req, res) => {
  const entrada = req.body as EntradaInicio;
  const procedimento = await obterProcedimentoOu404(entrada.surgeryId);
  if (!procedimento.ativo) {
    throw erros.conflito('PROCEDIMENTO_INATIVO', 'Procedimento inativo: não é possível iniciar uma checagem.');
  }

  const [checklist] = await consultar<RowDataPacket & { id: number }>(
    'SELECT id FROM checklist_padrao WHERE procedimento_id = ? AND ativo = TRUE',
    [procedimento.id],
  );
  if (!checklist) throw erros.naoEncontrado('Este procedimento ainda não tem checklist padrão ativo.');

  // Ao inserir, o gatilho trg_checagem_ai cria um item "pendente" para cada item do checklist.
  const resultado = await emTransacao(async (conexao) => {
    const [inserido] = await conexao.execute<ResultSetHeader>(
      'INSERT INTO checagem (checklist_padrao_id, usuario_id, sala, observacao) VALUES (?, ?, ?, ?)',
      [checklist.id, req.usuario!.id, textoOuNulo(entrada.room), textoOuNulo(entrada.notes)],
    );
    return inserido;
  });

  res.status(201).location(`/api/v1/checks/${resultado.insertId}`).json(await obterChecagem(resultado.insertId));
});

// GET /checks/:id
rotasChecagens.get('/checks/:id', async (req, res) => {
  const checagem = await obterChecagem(idDaRota(req.params.id));
  if (!checagem) throw erros.naoEncontrado('Checagem não encontrada.');
  res.json(checagem);
});

// PATCH /checks/:id/items/:itemId — RF06: confirmar, pular, marcar divergente ou voltar para pendente
rotasChecagens.patch('/checks/:id/items/:itemId', async (req, res) => {
  const checagemId = idDaRota(req.params.id);
  const itemId = idDaRota(req.params.itemId);
  const entrada = req.body as EntradaItem;

  if (entrada.status === 'divergente' && entrada.foundQuantity === undefined) {
    throw erros.validacao({ foundQuantity: 'Informe a quantidade encontrada para marcar o item como divergente.' });
  }

  await emTransacao(async (conexao) => {
    await travarEmAndamento(conexao, checagemId);

    const [linhas] = await conexao.execute<RowDataPacket[]>(
      'SELECT quantidade_esperada FROM item_checagem WHERE id = ? AND checagem_id = ?',
      [itemId, checagemId],
    );
    const item = linhas[0] as { quantidade_esperada: number } | undefined;
    if (!item) throw erros.naoEncontrado('Item não encontrado nesta checagem.');

    if (entrada.status === 'divergente' && entrada.foundQuantity === item.quantidade_esperada) {
      throw erros.validacao({ foundQuantity: 'A quantidade encontrada é igual à esperada; confirme o item em vez de marcá-lo como divergente.' });
    }

    if (entrada.status === 'pendente') {
      // O gatilho limpa quantidade, método, horário e responsável, e remove a divergência automática.
      await conexao.execute("UPDATE item_checagem SET status = 'pendente' WHERE id = ?", [itemId]);
    } else {
      // "confirmado" sem quantidade => o gatilho assume a esperada. Com quantidade diferente (RN07),
      // o gatilho grava o item como "divergente" e cria a divergência (faltante ou excedente).
      const encontrada = entrada.status === 'pulado' ? null : (entrada.foundQuantity ?? null);
      await conexao.execute(
        `UPDATE item_checagem
            SET status = ?, quantidade_encontrada = ?, metodo_confirmacao = ?, transcricao = ?,
                registrado_por = ?, registrado_em = NOW()
          WHERE id = ?`,
        [entrada.status, encontrada, entrada.method ?? null, textoOuNulo(entrada.transcript), req.usuario!.id, itemId],
      );
      // A observação é da divergência (o item não tem coluna de observação).
      const observacao = textoOuNulo(entrada.notes);
      if (observacao) {
        await conexao.execute('UPDATE divergencia SET observacao = ? WHERE item_checagem_id = ?', [observacao, itemId]);
      }
    }
  });

  // Devolve a checagem completa, já com o progresso recalculado (e o status final do item, se virou divergente).
  res.json(await obterChecagem(checagemId));
});

// GET /checks/:id/divergences — RF07
rotasChecagens.get('/checks/:id/divergences', async (req, res) => {
  const checagemId = idDaRota(req.params.id);
  const existe = await consultar<RowDataPacket>('SELECT id FROM checagem WHERE id = ?', [checagemId]);
  if (existe.length === 0) throw erros.naoEncontrado('Checagem não encontrada.');
  res.json((await divergenciasDe([checagemId])).get(checagemId) ?? []);
});

// POST /checks/:id/divergences — RF07: divergência manual (ex.: item excedente fora do checklist)
rotasChecagens.post('/checks/:id/divergences', async (req, res) => {
  const checagemId = idDaRota(req.params.id);
  const entrada = req.body as EntradaDivergencia;

  const descricao = textoOuNulo(entrada.description);
  if (entrada.instrumentId === undefined && descricao === null) {
    throw erros.validacao({ instrumentId: 'Informe o instrumental ou a descrição do item.', description: 'Informe a descrição ou o instrumental.' });
  }
  let instrumentalId: number | null = null;
  if (entrada.instrumentId !== undefined) {
    if (!/^\d{1,10}$/.test(entrada.instrumentId)) throw erros.validacao({ instrumentId: 'Instrumental inválido.' });
    instrumentalId = Number(entrada.instrumentId);
  }

  const divergenciaId = await emTransacao(async (conexao) => {
    await travarEmAndamento(conexao, checagemId);
    if (instrumentalId !== null) {
      const [achados] = await conexao.execute<RowDataPacket[]>('SELECT id FROM instrumental WHERE id = ?', [instrumentalId]);
      if (achados.length === 0) throw erros.validacao({ instrumentId: 'Instrumental não encontrado.' });
    }
    const [inserida] = await conexao.execute<ResultSetHeader>(
      `INSERT INTO divergencia
         (checagem_id, instrumental_id, descricao_item, tipo, quantidade_esperada, quantidade_encontrada,
          observacao, gerada_automaticamente, registrada_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, ?)`,
      [
        checagemId,
        instrumentalId,
        descricao,
        entrada.type,
        entrada.expectedQuantity ?? null,
        entrada.foundQuantity ?? null,
        textoOuNulo(entrada.notes),
        req.usuario!.id,
      ],
    );
    return inserida.insertId;
  });

  const criada = (await divergenciasDe([checagemId])).get(checagemId)?.find((d) => d.id === String(divergenciaId));
  res.status(201).json(criada);
});

// POST /checks/:id/finalize — RF08/RF09: finaliza (RN01) e devolve o relatório gerado pelo banco
rotasChecagens.post('/checks/:id/finalize', async (req, res) => {
  const checagemId = idDaRota(req.params.id);
  const observacao = textoOuNulo((req.body as { notes?: string } | undefined)?.notes);

  await emTransacao(async (conexao) => {
    await travarEmAndamento(conexao, checagemId);

    // RN01: nenhum item pode ficar pendente.
    const [contagem] = await conexao.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS pendentes FROM item_checagem WHERE checagem_id = ? AND status = 'pendente'",
      [checagemId],
    );
    const pendentes = Number((contagem[0] as { pendentes: number }).pendentes);
    if (pendentes > 0) {
      throw new ErroApi(
        409,
        'ITENS_PENDENTES',
        `Ainda ${pendentes === 1 ? 'há 1 item pendente' : `há ${pendentes} itens pendentes`}. Confirme, pule ou marque como divergente antes de finalizar.`,
        { pendingItems: pendentes },
      );
    }

    // Os gatilhos preenchem a data de término (BEFORE UPDATE) e geram o relatório (AFTER UPDATE).
    await conexao.execute("UPDATE checagem SET status = 'finalizada', observacao = COALESCE(?, observacao) WHERE id = ?", [
      observacao,
      checagemId,
    ]);
  });

  res.json(await obterRelatorio({ checagemId }));
});

// POST /checks/:id/cancel — RF11: cancela uma checagem em andamento (motivo obrigatório; sem relatório)
rotasChecagens.post('/checks/:id/cancel', async (req, res) => {
  const checagemId = idDaRota(req.params.id);
  const motivo = aparar((req.body as { reason: string }).reason);
  if (motivo.length < 3) throw erros.validacao({ reason: 'Informe o motivo do cancelamento (mínimo de 3 caracteres).' });

  await emTransacao(async (conexao) => {
    await travarEmAndamento(conexao, checagemId);
    await conexao.execute("UPDATE checagem SET status = 'cancelada', observacao = ? WHERE id = ?", [motivo, checagemId]);
  });

  res.json(await obterChecagem(checagemId));
});
