import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { consultarUm, emTransacao, executar } from '../db/pool.js';
import { gerarHash, LIMITE_BYTES_SENHA, senhaCabeNoBcrypt } from '../dominio/senhas.js';
import { revogarOutrasSessoes } from '../dominio/sessoes.js';
import { buscarUsuarioPorId, paraAuthUser, type LinhaUsuario } from '../dominio/usuarios.js';
import { ErroApi, erros } from '../http/erros.js';
import { aparar } from '../http/parametros.js';

// Perfil do usuário logado (contrato: /profile). Qualquer perfil acessa, mas só os PRÓPRIOS dados:
// o usuário vem da sessão (req.usuario), nunca de um ID na URL.

type EntradaPerfil = { name: string; phone: string };
type EntradaSenha = { currentPassword: string; newPassword: string };
type Preferencias = { stockAlert: boolean; surgeryReminder: boolean; voiceChecklist: boolean; weeklyReport: boolean };

type LinhaPreferencias = RowDataPacket & {
  alerta_estoque: number;
  lembrete_cirurgia: number;
  checklist_por_voz: number;
  relatorio_semanal: number;
};

// Mesmos padrões da tabela (V007): valem para quem nunca salvou preferências.
const PREFERENCIAS_PADRAO: Preferencias = { stockAlert: true, surgeryReminder: true, voiceChecklist: true, weeklyReport: false };

async function usuarioDaSessao(id: number): Promise<LinhaUsuario> {
  const usuario = await buscarUsuarioPorId(id);
  if (!usuario) throw erros.naoAutenticado();
  return usuario;
}

async function lerPreferencias(usuarioId: number): Promise<Preferencias> {
  const linha = await consultarUm<LinhaPreferencias>(
    `SELECT alerta_estoque, lembrete_cirurgia, checklist_por_voz, relatorio_semanal
       FROM preferencia_notificacao WHERE usuario_id = ?`,
    [usuarioId],
  );
  if (!linha) return PREFERENCIAS_PADRAO;
  return {
    stockAlert: Boolean(linha.alerta_estoque),
    surgeryReminder: Boolean(linha.lembrete_cirurgia),
    voiceChecklist: Boolean(linha.checklist_por_voz),
    weeklyReport: Boolean(linha.relatorio_semanal),
  };
}

export const rotasPerfil = Router();

// GET /profile
rotasPerfil.get('/profile', async (req, res) => {
  res.json(paraAuthUser(await usuarioDaSessao(req.usuario!.id)));
});

// PATCH /profile — só nome e telefone (e-mail e perfil são do administrador, em /users)
rotasPerfil.patch('/profile', async (req, res) => {
  const entrada = req.body as EntradaPerfil;
  const nome = aparar(entrada.name);
  if (nome.length < 3) throw erros.validacao({ name: 'Informe o nome (mínimo de 3 caracteres).' });

  await executar('UPDATE usuario SET nome = ?, telefone = ? WHERE id = ?', [
    nome,
    aparar(entrada.phone) || null,
    req.usuario!.id,
  ]);
  res.json(paraAuthUser(await usuarioDaSessao(req.usuario!.id)));
});

// PUT /profile/password — confere a senha atual, grava o novo hash e derruba as OUTRAS sessões
rotasPerfil.put('/profile/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body as EntradaSenha;
  if (!senhaCabeNoBcrypt(newPassword)) {
    throw erros.validacao({ newPassword: `A senha deve ter no máximo ${LIMITE_BYTES_SENHA} bytes.` });
  }

  const usuario = await usuarioDaSessao(req.usuario!.id);
  if (!(await bcrypt.compare(currentPassword, usuario.senha_hash))) {
    throw new ErroApi(400, 'SENHA_ATUAL_INCORRETA', 'A senha atual está incorreta.');
  }
  if (currentPassword === newPassword) {
    throw erros.validacao({ newPassword: 'A nova senha deve ser diferente da atual.' }, 'A nova senha deve ser diferente da atual.');
  }

  const novoHash = await gerarHash(newPassword);
  await emTransacao(async (conexao) => {
    await conexao.execute('UPDATE usuario SET senha_hash = ? WHERE id = ?', [novoHash, usuario.id]);
    // Quem trocou a senha segue logado; qualquer outro dispositivo com a senha antiga é encerrado.
    await revogarOutrasSessoes(usuario.id, req.usuario!.sessaoId, conexao);
  });
  res.status(204).end();
});

// GET /profile/notifications
rotasPerfil.get('/profile/notifications', async (req, res) => {
  res.json(await lerPreferencias(req.usuario!.id));
});

// PUT /profile/notifications — cria a linha na primeira vez e atualiza nas seguintes
rotasPerfil.put('/profile/notifications', async (req, res) => {
  const p = req.body as Preferencias;
  await executar(
    `INSERT INTO preferencia_notificacao
       (usuario_id, alerta_estoque, lembrete_cirurgia, checklist_por_voz, relatorio_semanal)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE alerta_estoque = VALUES(alerta_estoque), lembrete_cirurgia = VALUES(lembrete_cirurgia),
       checklist_por_voz = VALUES(checklist_por_voz), relatorio_semanal = VALUES(relatorio_semanal)`,
    [req.usuario!.id, p.stockAlert, p.surgeryReminder, p.voiceChecklist, p.weeklyReport],
  );
  res.json(await lerPreferencias(req.usuario!.id));
});
