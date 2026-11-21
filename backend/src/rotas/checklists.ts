import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { consultar, emTransacao } from '../db/pool.js';
import { erros } from '../http/erros.js';
import { aparar, paraIso } from '../http/parametros.js';
import type { Categoria } from './instrumentais.js';
import { obterProcedimentoOu404 } from './procedimentos.js';

// RF05 — Vincular checklist padrão versionado ao procedimento (UC05).
//
// Regras:
//  - Cada POST cria uma NOVA versão e a torna a ativa; a anterior continua guardada, inativa
//    (RN06: as checagens já feitas continuam apontando para a versão que usaram).
//  - Versões nunca são editadas: não existe PUT. Para mudar itens, cria-se nova versão.
//    (O banco também recusa alterar itens de checklist já usado em checagem.)
//  - Só o administrador vincula (RN02/RN05): vem do x-roles do contrato e do gatilho do banco.
//  - Item repetido na lista é recusado (UC05-A1); itens vindos de um kit que já estão na lista
//    têm a quantidade somada (UC05-A4).

type ItemEntrada = { instrumentId: string; expectedQuantity: number; order?: number };
type EntradaChecklist = { version: string; kitId?: string; items?: ItemEntrada[] };
type ItemMontado = { instrumentalId: number; quantidade: number; ordem: number };

type LinhaChecklist = RowDataPacket & {
  id: number;
  procedimento_codigo: string;
  versao: string;
  ativo: number;
  criado_em: Date;
  criado_por_nome: string;
};

type LinhaItem = RowDataPacket & {
  id: number;
  checklist_padrao_id: number;
  instrumental_id: number;
  nome: string;
  categoria: Categoria;
  unidade: string;
  critico: number;
  quantidade_esperada: number;
  ordem: number;
};

/** Carrega checklists (com seus itens) de um procedimento, do mais novo para o mais antigo. */
async function carregarChecklists(procedimentoId: number, apenasAtivo = false) {
  const checklists = await consultar<LinhaChecklist>(
    `SELECT cp.id, p.codigo AS procedimento_codigo, cp.versao, cp.ativo, cp.criado_em, u.nome AS criado_por_nome
       FROM checklist_padrao cp
       JOIN procedimento p ON p.id = cp.procedimento_id
       JOIN usuario u ON u.id = cp.criado_por
      WHERE cp.procedimento_id = ? ${apenasAtivo ? 'AND cp.ativo = TRUE' : ''}
      ORDER BY cp.id DESC`,
    [procedimentoId],
  );
  if (checklists.length === 0) return [];

  // Uma consulta só traz os itens de todas as versões.
  const itens = await consultar<LinhaItem>(
    `SELECT ic.id, ic.checklist_padrao_id, ic.instrumental_id, i.nome, i.categoria, i.unidade, i.critico,
            ic.quantidade_esperada, ic.ordem
       FROM item_checklist ic
       JOIN instrumental i ON i.id = ic.instrumental_id
      WHERE ic.checklist_padrao_id IN (${checklists.map(() => '?').join(',')})
      ORDER BY ic.ordem, i.nome`,
    checklists.map((checklist) => checklist.id),
  );

  return checklists.map((checklist) => ({
    id: String(checklist.id),
    surgeryId: checklist.procedimento_codigo,
    version: checklist.versao,
    active: Boolean(checklist.ativo),
    createdBy: checklist.criado_por_nome,
    createdAt: paraIso(checklist.criado_em),
    items: itens
      .filter((item) => item.checklist_padrao_id === checklist.id)
      .map((item) => ({
        id: String(item.id),
        instrumentId: String(item.instrumental_id),
        instrumentName: item.nome,
        category: item.categoria,
        unit: item.unidade,
        critical: Boolean(item.critico),
        expectedQuantity: item.quantidade_esperada,
        order: item.ordem,
      })),
  }));
}

const ehIdNumerico = (valor: string) => /^\d{1,10}$/.test(valor);

/**
 * Monta a lista final de itens do checklist a partir de `items` + `kitId`, aplicando UC05-A1 e A4.
 * Reúne TODOS os problemas e responde 400 de uma vez, apontando o campo de cada um.
 */
async function montarItens(entrada: EntradaChecklist): Promise<ItemMontado[]> {
  const campos: Record<string, string> = {};
  const itensEntrada = entrada.items ?? [];

  if (itensEntrada.length === 0 && entrada.kitId === undefined) {
    throw erros.validacao({ items: 'Informe os itens do checklist ou um kit.' });
  }

  // 1) Itens informados diretamente. Repetido na lista => recusa (A1).
  const montados = new Map<number, ItemMontado>();
  itensEntrada.forEach((item, posicao) => {
    const campo = `items.${posicao}.instrumentId`;
    if (!ehIdNumerico(item.instrumentId)) {
      campos[campo] = 'Instrumental inválido.';
      return;
    }
    const instrumentalId = Number(item.instrumentId);
    if (montados.has(instrumentalId)) {
      campos[campo] = 'Instrumental repetido no checklist.';
      return;
    }
    montados.set(instrumentalId, {
      instrumentalId,
      quantidade: item.expectedQuantity,
      ordem: item.order ?? posicao + 1,
    });
  });

  // Todo instrumental informado precisa existir e estar ativo.
  if (montados.size > 0 && Object.keys(campos).length === 0) {
    const ids = [...montados.keys()];
    const encontrados = await consultar<RowDataPacket & { id: number; ativo: number }>(
      `SELECT id, ativo FROM instrumental WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    const ativoPorId = new Map(encontrados.map((linha) => [linha.id, Boolean(linha.ativo)]));
    itensEntrada.forEach((item, posicao) => {
      const ativo = ativoPorId.get(Number(item.instrumentId));
      if (ativo === undefined) campos[`items.${posicao}.instrumentId`] = 'Instrumental não encontrado.';
      else if (!ativo) campos[`items.${posicao}.instrumentId`] = 'Instrumental inativo.';
    });
  }

  // 2) Kit: copia os instrumentais; se o item já está na lista, SOMA a quantidade (A4).
  if (entrada.kitId !== undefined && Object.keys(campos).length === 0) {
    if (!ehIdNumerico(entrada.kitId)) {
      campos.kitId = 'Kit inválido.';
    } else {
      const [kit] = await consultar<RowDataPacket & { ativo: number }>('SELECT ativo FROM kit WHERE id = ?', [
        Number(entrada.kitId),
      ]);
      if (!kit) campos.kitId = 'Kit não encontrado.';
      else if (!kit.ativo) campos.kitId = 'Kit inativo.';
      else {
        const itensDoKit = await consultar<RowDataPacket & { instrumental_id: number; quantidade: number; nome: string; ativo: number }>(
          `SELECT ki.instrumental_id, ki.quantidade, i.nome, i.ativo
             FROM kit_instrumental ki JOIN instrumental i ON i.id = ki.instrumental_id
            WHERE ki.kit_id = ? ORDER BY i.nome`,
          [Number(entrada.kitId)],
        );
        const inativos = itensDoKit.filter((item) => !item.ativo).map((item) => item.nome);
        if (inativos.length > 0) {
          campos.kitId = `O kit contém instrumental inativo: ${inativos.join(', ')}.`;
        } else if (itensDoKit.length === 0) {
          campos.kitId = 'O kit não possui itens.';
        } else {
          let ultimaOrdem = Math.max(0, ...[...montados.values()].map((item) => item.ordem));
          for (const doKit of itensDoKit) {
            const existente = montados.get(doKit.instrumental_id);
            if (existente) existente.quantidade += doKit.quantidade; // A4
            else montados.set(doKit.instrumental_id, { instrumentalId: doKit.instrumental_id, quantidade: doKit.quantidade, ordem: ++ultimaOrdem });
          }
        }
      }
    }
  }

  if (Object.keys(campos).length) throw erros.validacao(campos);
  return [...montados.values()];
}

export const rotasChecklists = Router();

// GET /surgeries/:id/checklists — todas as versões, da mais recente para a mais antiga
rotasChecklists.get('/surgeries/:id/checklists', async (req, res) => {
  const procedimento = await obterProcedimentoOu404(req.params.id);
  res.json(await carregarChecklists(procedimento.id));
});

// GET /surgeries/:id/checklists/active — a versão ativa (404 se o procedimento não tem checklist)
rotasChecklists.get('/surgeries/:id/checklists/active', async (req, res) => {
  const procedimento = await obterProcedimentoOu404(req.params.id);
  const [ativo] = await carregarChecklists(procedimento.id, true);
  if (!ativo) throw erros.naoEncontrado('Este procedimento ainda não tem checklist padrão ativo.');
  res.json(ativo);
});

// POST /surgeries/:id/checklists — cria nova versão e a torna a ativa (a anterior fica inativa)
rotasChecklists.post('/surgeries/:id/checklists', async (req, res) => {
  const procedimento = await obterProcedimentoOu404(req.params.id);
  const entrada = req.body as EntradaChecklist;

  const versao = aparar(entrada.version);
  if (!versao) throw erros.validacao({ version: 'Informe a versão.' });
  if (!procedimento.ativo) {
    throw erros.conflito('PROCEDIMENTO_INATIVO', 'Procedimento inativo: reative-o antes de vincular um checklist.');
  }
  const itens = await montarItens(entrada);

  const novoId = await emTransacao(async (conexao) => {
    // Trava o procedimento: dois POST simultâneos esperam um pelo outro e nunca deixam duas versões ativas.
    await conexao.execute('SELECT id FROM procedimento WHERE id = ? FOR UPDATE', [procedimento.id]);
    // Desativa a versão atual ANTES de inserir a nova (o banco só admite uma ativa por procedimento).
    await conexao.execute('UPDATE checklist_padrao SET ativo = FALSE WHERE procedimento_id = ? AND ativo = TRUE', [
      procedimento.id,
    ]);
    const [resultado] = await conexao.execute<ResultSetHeader>(
      'INSERT INTO checklist_padrao (procedimento_id, versao, ativo, criado_por) VALUES (?, ?, TRUE, ?)',
      [procedimento.id, versao, req.usuario!.id],
    );
    await conexao.query(
      'INSERT INTO item_checklist (checklist_padrao_id, instrumental_id, quantidade_esperada, ordem) VALUES ?',
      [itens.map((item) => [resultado.insertId, item.instrumentalId, item.quantidade, item.ordem])],
    );
    return resultado.insertId;
  });

  const criado = (await carregarChecklists(procedimento.id)).find((checklist) => checklist.id === String(novoId));
  res.status(201).json(criado);
});
