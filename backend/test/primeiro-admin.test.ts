import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { criarApp } from '../src/app.js';
import { config } from '../src/config.js';
import { consultar, consultarUm, encerrarPool, executar } from '../src/db/pool.js';
import { criarPrimeiroAdmin, ErroPrimeiroAdmin, validarDados } from '../src/dominio/primeiroAdmin.js';

// RF01 (ERS 2.5) — criação do primeiro administrador na implantação.
//
// Precisa de um banco MySQL com as migrações aplicadas e SEM administrador, cujo nome contenha "teste"
// (proteção contra rodar no banco de verdade). Exemplo, na raiz do repositório:
//   DB_NAME=traycheck_teste ./db/aplicar.sh --recriar
//   cd backend && DB_NAME=traycheck_teste npm test

const bancoDeTeste = config.banco.nome.includes('teste');
const criados: number[] = [];
let semAdministrador = false;

type Linha = RowDataPacket & { id: number; senha_hash: string; perfil_id: number; ativo: number };
const buscar = (email: string) => consultarUm<Linha>('SELECT id, senha_hash, perfil_id, ativo FROM usuario WHERE email = ?', [email]);

after(async () => {
  for (const id of criados) {
    await executar('DELETE FROM sessao WHERE usuario_id = ?', [id]);
    await executar('DELETE FROM usuario WHERE id = ?', [id]);
  }
  await encerrarPool();
});

describe('validação dos dados', () => {
  test('rejeita nome vazio, e-mail inválido e senha curta', () => {
    assert.throws(() => validarDados({ nome: '  ', email: 'a@h.br' }), ErroPrimeiroAdmin);
    assert.throws(() => validarDados({ nome: 'Ana', email: 'sem-arroba' }), ErroPrimeiroAdmin);
    assert.throws(() => validarDados({ nome: 'Ana', email: 'a@h.br', senha: '1234567' }), ErroPrimeiroAdmin);
    assert.throws(() => validarDados({ nome: 'Ana', email: 'a@h.br', senha: 'á'.repeat(37) }), ErroPrimeiroAdmin);
  });

  test('normaliza nome e e-mail', () => {
    assert.deepEqual(validarDados({ nome: '  Ana   Souza ', email: ' Ana@Hospital.BR ' }), {
      nome: 'Ana Souza',
      email: 'ana@hospital.br',
    });
  });
});

describe('criação no banco', { skip: !bancoDeTeste && `banco "${config.banco.nome}" não é de teste` }, () => {
  before(async () => {
    const admins = await consultar<RowDataPacket>('SELECT id FROM usuario WHERE perfil_id = 1 AND ativo = TRUE');
    semAdministrador = admins.length === 0;
  });

  test('cria o administrador com a senha só em hash bcrypt', async (t) => {
    if (!semAdministrador) return t.skip('o banco já tem administrador ativo');
    const r = await criarPrimeiroAdmin({ nome: 'Admin Implantação', email: 'Implantacao@Teste.br', senha: 'senha-forte-1' });
    assert.equal(r.situacao, 'criado');
    if (r.situacao !== 'criado') return;
    criados.push(r.id);
    assert.equal(r.senhaGerada, undefined);
    const linha = await buscar('implantacao@teste.br');
    assert.ok(linha);
    assert.equal(linha.perfil_id, 1);
    assert.equal(linha.ativo, 1);
    assert.notEqual(linha.senha_hash, 'senha-forte-1');
    assert.ok(await bcrypt.compare('senha-forte-1', linha.senha_hash));
  });

  test('o administrador criado consegue fazer login pela API', async (t) => {
    if (!semAdministrador) return t.skip('o banco já tem administrador ativo');
    const servidor = criarApp().listen(0);
    try {
      const { port } = servidor.address() as AddressInfo;
      const resposta = await fetch(`http://127.0.0.1:${port}${config.prefixoApi}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'implantacao@teste.br', password: 'senha-forte-1' }),
      });
      assert.equal(resposta.status, 200);
      const corpo = (await resposta.json()) as { user: { role: string }; accessToken: string };
      assert.equal(corpo.user.role, 'admin');
      assert.ok(corpo.accessToken);
    } finally {
      await new Promise((resolver) => servidor.close(resolver));
    }
  });

  test('segunda execução não cria outro administrador', async (t) => {
    if (!semAdministrador) return t.skip('o banco já tem administrador ativo');
    const r = await criarPrimeiroAdmin({ nome: 'Outro', email: 'outro@teste.br', senha: 'senha-forte-2' });
    assert.deepEqual(r, { situacao: 'ja_existe', administradoresAtivos: 1 });
    assert.equal(await buscar('outro@teste.br'), undefined);
  });

  test('administrador inativo não conta; sem senha, gera uma e a devolve uma vez', async (t) => {
    if (!semAdministrador) return t.skip('o banco já tem administrador ativo');
    await executar('UPDATE usuario SET ativo = FALSE WHERE email = ?', ['implantacao@teste.br']);
    const r = await criarPrimeiroAdmin({ nome: 'Admin Gerado', email: 'gerado@teste.br' });
    assert.equal(r.situacao, 'criado');
    if (r.situacao !== 'criado') return;
    criados.push(r.id);
    assert.equal(r.senhaGerada?.length, 12);
    const linha = await buscar('gerado@teste.br');
    assert.ok(linha && (await bcrypt.compare(r.senhaGerada!, linha.senha_hash)));
  });

  test('e-mail já usado por outro usuário é recusado', async (t) => {
    if (!semAdministrador) return t.skip('o banco já tem administrador ativo');
    await executar('UPDATE usuario SET ativo = FALSE WHERE email = ?', ['gerado@teste.br']);
    await assert.rejects(
      criarPrimeiroAdmin({ nome: 'Repetido', email: 'implantacao@teste.br', senha: 'senha-forte-3' }),
      ErroPrimeiroAdmin,
    );
  });
});
