import { Router } from 'express';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { consultar, emTransacao } from '../db/pool.js';
import { gerarHash, gerarSenhaInicial, LIMITE_BYTES_SENHA, senhaCabeNoBcrypt } from '../dominio/senhas.js';
import { revogarSessoesDoUsuario } from '../dominio/sessoes.js';
import { buscarUsuarioPorId, COLUNAS_USUARIO, paraAppUser, type LinhaUsuario } from '../dominio/usuarios.js';
import { erros } from '../http/erros.js';
import { aparar, idDaRota, padraoDeBusca } from '../http/parametros.js';
import { ID_DO_PERFIL, paraPerfilBanco, type Papel } from '../http/perfis.js';

// RF12 — Gerenciar usuários (contrato: /users). Só o Administrador acessa (x-roles: [admin], RN05).
//
//  - Usuário nunca é excluído (RN03/LGPD): só se inativa. Não existe DELETE.
//  - Senha só como hash bcrypt (RNF01), com no mínimo 8 caracteres (ERS).
//  - Inativar, ou redefinir a senha, encerra as sessões abertas do usuário NA MESMA TRANSAÇÃO.
//    Assim reativar depois não faz sessão antiga voltar a valer.
//  - O último administrador ativo não pode ser inativado nem perder o perfil (evita trancar o sistema).

type EntradaUsuario = { name: string; email: string; role: Papel; shift: string; password?: string };

const SQL_USUARIO = `SELECT ${COLUNAS_USUARIO} FROM usuario u JOIN perfil p ON p.id = u.perfil_id`;

/** Normaliza e valida o que o validador do contrato não cobre (espaços, tamanho em bytes da senha). */
function validarEntrada(entrada: EntradaUsuario) {
  const campos: Record<string, string> = {};
  const nome = aparar(entrada.name);
  const email = aparar(entrada.email).toLowerCase();
  if (nome.length < 3) campos.name = 'Informe o nome (mínimo de 3 caracteres).';
  if (entrada.password !== undefined && !senhaCabeNoBcrypt(entrada.password)) {
    campos.password = `A senha deve ter no máximo ${LIMITE_BYTES_SENHA} bytes.`;
  }
  if (Object.keys(campos).length) throw erros.validacao(campos);
  return { nome, email, perfilId: ID_DO_PERFIL[paraPerfilBanco(entrada.role)], turno: aparar(entrada.shift) || null };
}

/**
 * Trava as linhas dos administradores ativos (em ordem de ID, para duas transações nunca se travarem
 * mutuamente) e diz quantos OUTROS administradores ativos existem além do usuário informado.
 * Como as linhas ficam travadas, duas alterações simultâneas não conseguem, juntas, tirar o último admin.
 */
async function outrosAdministradoresAtivos(conexao: PoolConnection, usuarioId: number): Promise<number> {
  const [admins] = await conexao.execute<RowDataPacket[]>(
    'SELECT id FROM usuario WHERE perfil_id = ? AND ativo = TRUE ORDER BY id FOR UPDATE',
    [ID_DO_PERFIL.admin],
  );
  return admins.filter((admin) => admin.id !== usuarioId).length;
}

async function travarUsuario(conexao: PoolConnection, id: number): Promise<LinhaUsuario> {
  const [linhas] = await conexao.execute<LinhaUsuario[]>(`${SQL_USUARIO} WHERE u.id = ? FOR UPDATE`, [id]);
  const usuario = linhas[0];
  if (!usuario) throw erros.naoEncontrado('Usuário não encontrado.');
  return usuario;
}

const ultimoAdministrador = (mensagem: string) => erros.conflito('ULTIMO_ADMINISTRADOR', mensagem);

async function obterOu404(id: number): Promise<LinhaUsuario> {
  const usuario = await buscarUsuarioPorId(id);
  if (!usuario) throw erros.naoEncontrado('Usuário não encontrado.');
  return usuario;
}

export const rotasUsuarios = Router();

// GET /users?role=&status=&q=
rotasUsuarios.get('/users', async (req, res) => {
  const filtros: string[] = [];
  const parametros: unknown[] = [];
  if (typeof req.query.role === 'string') {
    filtros.push('p.codigo = ?');
    parametros.push(paraPerfilBanco(req.query.role as Papel));
  }
  if (req.query.status === 'active' || req.query.status === 'inactive') {
    filtros.push('u.ativo = ?');
    parametros.push(req.query.status === 'active');
  }
  const busca = padraoDeBusca(req.query.q);
  if (busca) {
    filtros.push('(u.nome LIKE ? OR u.email LIKE ?)');
    parametros.push(busca, busca);
  }
  const linhas = await consultar<LinhaUsuario>(
    `${SQL_USUARIO} ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''} ORDER BY u.nome`,
    parametros,
  );
  res.json(linhas.map(paraAppUser));
});

// GET /users/:id
rotasUsuarios.get('/users/:id', async (req, res) => {
  res.json(paraAppUser(await obterOu404(idDaRota(req.params.id))));
});

// POST /users — senha informada (mín. 8) ou gerada pelo backend e devolvida uma única vez
rotasUsuarios.post('/users', async (req, res) => {
  const entrada = req.body as EntradaUsuario;
  const dados = validarEntrada(entrada);

  const senhaGerada = entrada.password === undefined ? gerarSenhaInicial() : undefined;
  const hash = await gerarHash(entrada.password ?? senhaGerada!);

  const resultado = await emTransacao(async (conexao) => {
    const [inserido] = await conexao.execute<ResultSetHeader>(
      'INSERT INTO usuario (perfil_id, nome, email, senha_hash, turno) VALUES (?, ?, ?, ?, ?)',
      [dados.perfilId, dados.nome, dados.email, hash, dados.turno],
    ); // e-mail repetido => 409 EMAIL_DUPLICADO (tratador de erros)
    return inserido;
  });

  const criado = paraAppUser(await obterOu404(resultado.insertId));
  res.status(201).json(senhaGerada ? { ...criado, initialPassword: senhaGerada } : criado);
});

// PUT /users/:id — atualiza nome, e-mail, perfil e turno; com `password`, redefine a senha
rotasUsuarios.put('/users/:id', async (req, res) => {
  const id = idDaRota(req.params.id);
  const entrada = req.body as EntradaUsuario;
  const dados = validarEntrada(entrada);
  const novoHash = entrada.password === undefined ? undefined : await gerarHash(entrada.password);

  await emTransacao(async (conexao) => {
    const outrosAdmins = await outrosAdministradoresAtivos(conexao, id);
    const atual = await travarUsuario(conexao, id);

    // Tirar o perfil de administrador do último admin ativo trancaria o sistema.
    const deixariaDeSerAdmin = atual.perfil === 'admin' && Boolean(atual.ativo) && dados.perfilId !== ID_DO_PERFIL.admin;
    if (deixariaDeSerAdmin && outrosAdmins === 0) throw ultimoAdministrador('Não é possível remover o perfil de administrador do último administrador ativo do sistema.');

    await conexao.execute(
      `UPDATE usuario SET nome = ?, email = ?, perfil_id = ?, turno = ?${novoHash ? ', senha_hash = ?' : ''} WHERE id = ?`,
      novoHash ? [dados.nome, dados.email, dados.perfilId, dados.turno, novoHash, id] : [dados.nome, dados.email, dados.perfilId, dados.turno, id],
    );
    // Senha nova => as sessões abertas (com a senha antiga) deixam de valer.
    if (novoHash) await revogarSessoesDoUsuario(id, conexao);
  });

  res.json(paraAppUser(await obterOu404(id)));
});

// PATCH /users/:id/status — ativa ou inativa (nunca exclui)
rotasUsuarios.patch('/users/:id/status', async (req, res) => {
  const id = idDaRota(req.params.id);
  const ativar = (req.body as { status: 'active' | 'inactive' }).status === 'active';

  await emTransacao(async (conexao) => {
    const outrosAdmins = await outrosAdministradoresAtivos(conexao, id);
    const atual = await travarUsuario(conexao, id);

    if (!ativar && atual.perfil === 'admin' && Boolean(atual.ativo) && outrosAdmins === 0) {
      throw ultimoAdministrador('Não é possível inativar o último administrador ativo do sistema.');
    }

    await conexao.execute('UPDATE usuario SET ativo = ? WHERE id = ?', [ativar, id]);
    // Inativar derruba as sessões abertas e as ENCERRA (revoga), para a reativação não as ressuscitar.
    if (!ativar) await revogarSessoesDoUsuario(id, conexao);
  });

  res.json(paraAppUser(await obterOu404(id)));
});
