import bcrypt from 'bcryptjs';
import { Router, type CookieOptions } from 'express';
import { config, emProducao } from '../config.js';
import { executar } from '../db/pool.js';
import { criarSessao, revogarSessao } from '../dominio/sessoes.js';
import { buscarUsuarioPorEmail, buscarUsuarioPorId, paraAuthUser } from '../dominio/usuarios.js';
import { ErroApi, erros } from '../http/erros.js';
import { aparar } from '../http/parametros.js';

// RF02 — autenticação (contrato: /auth/login, /auth/logout, /auth/me).
//
//  - Senha comparada com o hash bcrypt do banco (nunca guardamos senha em texto, RNF01).
//  - Credenciais erradas, e-mail inexistente e usuário inativo dão a MESMA resposta, sem dizer
//    qual campo errou (ERS, RF02). Também gastam o mesmo tempo, para não revelar quais e-mails existem.
//  - O token vai no corpo (accessToken) e também em cookie HttpOnly. Strict = o navegador não envia
//    o cookie em requisições vindas de outros sites (protege contra CSRF).

type EntradaLogin = { email: string; password: string };

// Hash de uma senha qualquer: usado quando o e-mail não existe, só para gastar o mesmo tempo do bcrypt.
const HASH_FALSO = bcrypt.hashSync('senha-que-nao-pertence-a-ninguem', 10);

const opcoesDoCookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: emProducao,
  path: '/',
};

const credenciaisInvalidas = () =>
  new ErroApi(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.');

export const rotasAutenticacao = Router();

// POST /auth/login — rota pública (x-roles: [])
rotasAutenticacao.post('/auth/login', async (req, res) => {
  const { email, password } = req.body as EntradaLogin;

  const usuario = await buscarUsuarioPorEmail(aparar(email));
  const senhaConfere = await bcrypt.compare(password, usuario?.senha_hash ?? HASH_FALSO);
  if (!usuario || !senhaConfere || !usuario.ativo) throw credenciaisInvalidas();

  // UC01, passo 3: registra a data do último acesso.
  await executar('UPDATE usuario SET ultimo_acesso_em = NOW() WHERE id = ?', [usuario.id]);
  const token = await criarSessao(usuario.id);

  res.cookie(config.nomeDoCookie, token, opcoesDoCookie);
  res.json({ user: paraAuthUser(usuario), accessToken: token });
});

// POST /auth/logout — encerra de verdade a sessão em uso
rotasAutenticacao.post('/auth/logout', async (req, res) => {
  await revogarSessao(req.usuario!.sessaoId);
  res.clearCookie(config.nomeDoCookie, opcoesDoCookie);
  res.status(204).end();
});

// GET /auth/me — usuário da sessão atual
rotasAutenticacao.get('/auth/me', async (req, res) => {
  const usuario = await buscarUsuarioPorId(req.usuario!.id);
  if (!usuario) throw erros.naoAutenticado();
  res.json(paraAuthUser(usuario));
});
