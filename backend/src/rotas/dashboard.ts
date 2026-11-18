import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { consultar, consultarUm } from '../db/pool.js';
import { horaMinuto } from '../http/parametros.js';

// Resumo da tela inicial (contrato: /dashboard). Qualquer usuário autenticado.
//
// Não existe tabela de agenda de cirurgias. Em vez de inventar dados de demonstração, o painel é
// derivado das CHECAGENS reais do dia:
//   - "Cirurgias hoje"  = checagens iniciadas hoje (as canceladas não contam);
//   - programação       = essas mesmas checagens (horário, sala, situação);
//   - tendência         = hoje comparado a ontem;
//   - "Kits prontos"    = checagens de hoje concluídas sem nenhuma divergência;
//   - estoque           = contagem por situação (ok / baixo / crítico).
// Como não há agenda futura, nunca existe a situação "aguardando".

type LinhaEstoque = RowDataPacket & { total: number; criticos: number; baixos: number };
type LinhaDeHoje = RowDataPacket & {
  id: number;
  procedimento_codigo: string;
  procedimento_nome: string;
  sala: string | null;
  operador: string;
  status: 'em_andamento' | 'finalizada';
  iniciada_em: Date;
  relatorio_status: 'ok' | 'divergencia' | null;
};

const SITUACAO_NA_PROGRAMACAO = { em_andamento: 'em-andamento', finalizada: 'concluida' } as const;

function textoDaTendencia(hoje: number, ontem: number) {
  const diferenca = hoje - ontem;
  if (diferenca === 0) return { text: 'Igual a ontem', positive: true };
  return { text: `${diferenca > 0 ? '+' : '-'}${Math.abs(diferenca)} em relação a ontem`, positive: diferenca > 0 };
}

export const rotasDashboard = Router();

rotasDashboard.get('/dashboard', async (_req, res) => {
  const [estoque, deHoje, ontem] = await Promise.all([
    consultarUm<LinhaEstoque>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(situacao = 'critical'), 0) AS criticos,
              COALESCE(SUM(situacao = 'low'), 0) AS baixos
         FROM estoque_item`,
    ),
    consultar<LinhaDeHoje>(
      `SELECT c.id, p.codigo AS procedimento_codigo, p.nome AS procedimento_nome, c.sala, u.nome AS operador,
              c.status, c.iniciada_em, r.status AS relatorio_status
         FROM checagem c
         JOIN checklist_padrao cp ON cp.id = c.checklist_padrao_id
         JOIN procedimento p ON p.id = cp.procedimento_id
         JOIN usuario u ON u.id = c.usuario_id
         LEFT JOIN relatorio_conferencia r ON r.checagem_id = c.id
        WHERE DATE(c.iniciada_em) = CURDATE() AND c.status <> 'cancelada'
        ORDER BY c.iniciada_em, c.id`,
    ),
    consultarUm<RowDataPacket & { total: number }>(
      `SELECT COUNT(*) AS total FROM checagem
        WHERE DATE(iniciada_em) = CURDATE() - INTERVAL 1 DAY AND status <> 'cancelada'`,
    ),
  ]);

  res.json({
    totalSurgeries: deHoje.length,
    readyKits: deHoje.filter((checagem) => checagem.relatorio_status === 'ok').length,
    criticalStockItems: Number(estoque?.criticos ?? 0),
    lowStockItems: Number(estoque?.baixos ?? 0),
    stockItemCount: Number(estoque?.total ?? 0),
    surgeryTrend: textoDaTendencia(deHoje.length, Number(ontem?.total ?? 0)),
    schedule: deHoje.map((checagem) => ({
      id: String(checagem.id),
      surgeryId: checagem.procedimento_codigo,
      time: horaMinuto(checagem.iniciada_em),
      surgery: checagem.procedimento_nome,
      room: checagem.sala ?? '—',
      // Não há cadastro de cirurgião: mostra quem conduz a checagem.
      surgeon: checagem.operador,
      status: SITUACAO_NA_PROGRAMACAO[checagem.status],
    })),
  });
});
