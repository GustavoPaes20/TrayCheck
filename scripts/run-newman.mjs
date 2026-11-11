#!/usr/bin/env node
/**
 * Executa a coleção Newman de tests/api contra a API.
 *
 *  - Sem argumentos: sobe o servidor de referência (tests/api/servidor-de-referencia.mjs) em uma porta livre.
 *  - Com API_BASE_URL (ex.: http://localhost:3000/api/v1): testa essa API, sem subir nada.
 *
 * Saídas: console + tests/api/results/newman-junit.xml e newman-report.json (ignorados pelo git).
 * Código de saída diferente de zero se qualquer asserção ou requisição falhar.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pastaDaApi = path.join(raiz, 'tests', 'api');
const pastaDeResultados = path.join(pastaDaApi, 'results');

// O newman é dependência de desenvolvimento do pacote em src/ (único package.json do repositório).
const exigir = createRequire(path.join(raiz, 'src', 'package.json'));
const newman = exigir('newman');

const urlExterna = process.env.API_BASE_URL?.replace(/\/$/, '');
let servidorLocal;
let urlBase = urlExterna;

if (!urlBase) {
  const { iniciarServidor } = await import(pathToFileURL(path.join(pastaDaApi, 'servidor-de-referencia.mjs')).href);
  servidorLocal = await iniciarServidor(0);
  urlBase = `http://127.0.0.1:${servidorLocal.porta}/api/v1`;
  console.log(`Servidor de referência iniciado em ${urlBase}`);
} else {
  console.log(`Testando API externa em ${urlBase}`);
}

mkdirSync(pastaDeResultados, { recursive: true });

const resumo = await new Promise((resolver, rejeitar) => {
  newman.run(
    {
      collection: path.join(pastaDaApi, 'traycheck.postman_collection.json'),
      envVar: [{ key: 'baseUrl', value: urlBase }],
      reporters: ['cli', 'junit', 'json'],
      reporter: {
        junit: { export: path.join(pastaDeResultados, 'newman-junit.xml') },
        json: { export: path.join(pastaDeResultados, 'newman-report.json') },
      },
      timeoutRequest: 10_000,
    },
    (erro, resultado) => (erro ? rejeitar(erro) : resolver(resultado)),
  );
});

await servidorLocal?.fechar();

const falhas = resumo.run.failures.length;
const { assertions, requests } = resumo.run.stats;
console.log(`\nNewman: ${requests.total} requisições, ${assertions.total} asserções, ${falhas} falha(s).`);
process.exit(falhas === 0 && !resumo.run.error ? 0 : 1);
