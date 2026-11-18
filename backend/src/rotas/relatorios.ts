import type { RowDataPacket } from 'mysql2/promise';
import { Router } from 'express';
import { consultarUm } from '../db/pool.js';
import { listarRelatorios, obterRelatorio } from '../dominio/relatorios.js';
import { erros } from '../http/erros.js';
import { idDaRota } from '../http/parametros.js';


// RF09/RF10 — relatórios de conferência (contrato: /reports).
// O relatório é GERADO PELO BANCO quando a checagem é finalizada e é imutável (RN03):
// aqui só consultamos. Não existe rota para criar, editar ou excluir relatórios.

export const rotasRelatorios = Router();

const lerTexto = (valor: unknown): string | undefined => (typeof valor === 'string' && valor ? valor : undefined);

// GET /reports?status=&surgeryId=&from=&to=
rotasRelatorios.get('/reports', async (req, res) => {
  res.json(
    await listarRelatorios({
      status: lerTexto(req.query.status),
      codigoProcedimento: lerTexto(req.query.surgeryId),
      de: lerTexto(req.query.from),
      ate: lerTexto(req.query.to),
    }),
  );
});

// POST /reports — OBSOLETO (compatibilidade com o frontend): devolve o relatório de uma checagem finalizada.
// Idempotente: não cria nada, só consulta o que o banco gerou na finalização.
rotasRelatorios.post('/reports', async (req, res) => {
  const checkId = (req.body as { checkId: string }).checkId;
  if (!/^\d{1,10}$/.test(checkId)) throw erros.validacao({ checkId: 'Checagem inválida.' });

  const checagem = await consultarUm<RowDataPacket & { status: string }>('SELECT status FROM checagem WHERE id = ?', [
    Number(checkId),
  ]);
  if (!checagem) throw erros.naoEncontrado('Checagem não encontrada.');
  if (checagem.status === 'cancelada') {
    throw erros.conflito('CHECAGEM_CANCELADA', 'Checagem cancelada não gera relatório de conferência.');
  }
  if (checagem.status !== 'finalizada') {
    throw erros.conflito('CHECAGEM_NAO_FINALIZADA', 'A checagem ainda não foi finalizada; não há relatório para exibir.');
  }
  res.json(await obterRelatorio({ checagemId: Number(checkId) }));
});

// GET /reports/:id
rotasRelatorios.get('/reports/:id', async (req, res) => {
  const relatorio = await obterRelatorio({ id: idDaRota(req.params.id) });
  if (!relatorio) throw erros.naoEncontrado('Relatório não encontrado.');
  res.json(relatorio);
});
