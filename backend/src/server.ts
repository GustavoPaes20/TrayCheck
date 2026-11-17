import { criarApp } from './app.js';
import { config } from './config.js';
import { encerrarPool, verificarBanco } from './db/pool.js';

// Ponto de entrada: confere o banco, sobe o HTTP na porta configurada e
// encerra com elegância (fecha conexões) ao receber Ctrl+C.

async function iniciar(): Promise<void> {
  try {
    const { versoes } = await verificarBanco();
    console.log(`[banco] conectado a ${config.banco.nome} (migrações: ${versoes.join(', ')})`);
  } catch (erro) {
    console.error(`[banco] não foi possível conectar a ${config.banco.host}:${config.banco.porta}/${config.banco.nome}.`);
    console.error('        Confira o .env e se as migrações foram aplicadas (db/aplicar.sh).');
    console.error(`        Causa: ${(erro as Error).message}`);
    process.exit(1);
  }

  const servidor = criarApp().listen(config.porta, () => {
    console.log(`[api] TrayCheck ouvindo em http://localhost:${config.porta}${config.prefixoApi}`);
    if (config.autenticacaoProvisoria) {
      console.warn('[api] AUTENTICAÇÃO PROVISÓRIA ativa: use "Authorization: Bearer dev-<id do usuário>".');
    }
  });

  const encerrar = (sinal: string) => {
    console.log(`[api] ${sinal} recebido, encerrando...`);
    servidor.close(async () => {
      await encerrarPool();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

void iniciar();
