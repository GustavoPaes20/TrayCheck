import { parseArgs } from 'node:util';
import { config } from '../config.js';
import { encerrarPool, verificarBanco } from '../db/pool.js';
import { contarAdministradoresAtivos, criarPrimeiroAdmin, ErroPrimeiroAdmin, validarDados } from '../dominio/primeiroAdmin.js';

// Cria o primeiro administrador na implantação (RF01, ERS 2.5).
//
//   npm run criar-admin -- --nome "Ana Souza" --email ana@hospital.br
//   npm run criar-admin -- --nome "Ana Souza" --email ana@hospital.br --gerar-senha
//
// Sem --gerar-senha, a senha é digitada duas vezes no terminal; cada caractere aparece como *.
// Com --gerar-senha, o script sorteia uma senha e a mostra uma única vez.
// Se já houver administrador ativo, nada é alterado (saída com código 0) e a senha nem é pedida.
// Códigos de saída: 0 = criado ou nada a fazer; 1 = dados inválidos ou erro de banco.

const AJUDA = `Uso: npm run criar-admin -- --nome "Nome Completo" --email email@hospital.br [--gerar-senha]

  --nome         Nome do administrador
  --email        E-mail de login
  --gerar-senha  Gera uma senha aleatória (mostrada uma única vez) em vez de pedir no terminal
  --ajuda        Mostra esta mensagem`;

/** Lê uma linha do terminal mostrando * no lugar de cada caractere (funciona no PowerShell, no cmd e no bash). */
function lerSenhaOculta(pergunta: string): Promise<string> {
  const entrada = process.stdin;
  if (!entrada.isTTY) {
    return Promise.reject(new ErroPrimeiroAdmin('Sem terminal interativo para digitar a senha: use --gerar-senha.'));
  }
  process.stdout.write(pergunta);
  return new Promise((resolver, rejeitar) => {
    let senha = '';
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const aoDigitar = (teclas: string) => {
      for (const tecla of teclas) {
        if (tecla === '\r' || tecla === '\n') {
          parar();
          process.stdout.write('\n');
          resolver(senha);
          return;
        }
        if (tecla === '\u0003') { // Ctrl+C
          parar();
          process.stdout.write('\n');
          rejeitar(new ErroPrimeiroAdmin('Cancelado.'));
          return;
        }
        if (tecla === '\u007f' || tecla === '\b') {
          if (senha.length > 0) {
            senha = senha.slice(0, -1);
            process.stdout.write('\b \b'); // apaga o último *
          }
        } else if (tecla >= ' ') {
          senha += tecla;
          process.stdout.write('*');
        }
      }
    };
    const parar = () => {
      entrada.off('data', aoDigitar);
      entrada.setRawMode(false);
      entrada.pause();
    };
    entrada.on('data', aoDigitar);
  });
}

function avisarQueJaExiste(total: number): void {
  console.log(`Nada a fazer: o banco ${config.banco.nome} já tem ${total} administrador(es) ativo(s).`);
  console.log('Os demais usuários são cadastrados por um administrador, pela tela de usuários ou por POST /users.');
}

async function principal(): Promise<number> {
  const { values: opcoes } = parseArgs({
    options: {
      nome: { type: 'string' },
      email: { type: 'string' },
      'gerar-senha': { type: 'boolean', default: false },
      ajuda: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (opcoes.ajuda) {
    console.log(AJUDA);
    return 0;
  }
  if (!opcoes.nome || !opcoes.email) {
    console.error(AJUDA);
    return 1;
  }

  // Valida nome e e-mail antes de pedir a senha, para não fazer a pessoa digitar à toa.
  validarDados({ nome: opcoes.nome, email: opcoes.email });
  await verificarBanco();

  // Confere antes de pedir a senha: se já há administrador, não faz a pessoa digitar à toa.
  const jaExistentes = await contarAdministradoresAtivos();
  if (jaExistentes > 0) {
    avisarQueJaExiste(jaExistentes);
    return 0;
  }

  let senha: string | undefined;
  if (!opcoes['gerar-senha']) {
    senha = await lerSenhaOculta('Senha do administrador (mín. 8 caracteres): ');
    validarDados({ nome: opcoes.nome, email: opcoes.email, senha });
    const confirmacao = await lerSenhaOculta('Repita a senha: ');
    if (confirmacao !== senha) throw new ErroPrimeiroAdmin('As senhas não conferem.');
  }

  const resultado = await criarPrimeiroAdmin({ nome: opcoes.nome, email: opcoes.email, ...(senha ? { senha } : {}) });
  if (resultado.situacao === 'ja_existe') {
    // Outro administrador foi criado enquanto a senha era digitada; a transação impediu o segundo.
    avisarQueJaExiste(resultado.administradoresAtivos);
    return 0;
  }
  console.log(`Administrador criado no banco ${config.banco.nome}: ${resultado.email} (id ${resultado.id}).`);
  if (resultado.senhaGerada) {
    console.log(`Senha inicial: ${resultado.senhaGerada}`);
    console.log('Anote agora: ela não será mostrada de novo. Troque-a depois do primeiro acesso.');
  }
  return 0;
}

principal()
  .then((codigo) => (process.exitCode = codigo))
  .catch((erro: unknown) => {
    if (erro instanceof ErroPrimeiroAdmin) console.error(`Erro: ${erro.message}`);
    else {
      console.error(`Erro ao acessar o banco ${config.banco.host}:${config.banco.porta}/${config.banco.nome}.`);
      console.error('Confira o .env e se as migrações foram aplicadas (db/aplicar.sh).');
      console.error(`Causa: ${(erro as Error).message}`);
    }
    process.exitCode = 1;
  })
  .finally(() => encerrarPool());
