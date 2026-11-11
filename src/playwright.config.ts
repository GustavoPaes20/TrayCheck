import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const raizDaAplicacao = path.dirname(fileURLToPath(import.meta.url));

const PORTA_DA_API = 3101;
const PORTA_DEMO = 4173;
const PORTA_CONECTADO = 4174;
const URL_DA_API = `http://127.0.0.1:${PORTA_DA_API}/api/v1`;

/** Usa o Chromium baixado por `playwright install`; defina PW_CHROMIUM_PATH apenas em ambientes com navegador próprio. */
const executavelDoNavegador = process.env.PW_CHROMIUM_PATH || undefined;

const vite = (porta: number, ambiente: Record<string, string>) => ({
  command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${porta} --strictPort`,
  cwd: raizDaAplicacao,
  url: `http://127.0.0.1:${porta}/`,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  env: { PORT: String(porta), ...ambiente },
});

export default defineConfig({
  testDir: '../tests/e2e',
  outputDir: '../tests/e2e/results/artefatos',
  // O servidor de referência é compartilhado e guarda estado em memória; os testes o reiniciam, então rodam em série.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: '../tests/e2e/results/relatorio' }], ['junit', { outputFile: '../tests/e2e/results/junit.xml' }]]
    : [['list']],
  use: {
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: executavelDoNavegador },
  },
  projects: [
    {
      name: 'demonstracao',
      testMatch: /demonstracao\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PORTA_DEMO}` },
    },
    {
      name: 'conectado',
      testMatch: /conectado\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PORTA_CONECTADO}` },
    },
    {
      name: 'movel',
      testMatch: /movel\..*\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: `http://127.0.0.1:${PORTA_DEMO}` },
    },
  ],
  webServer: [
    // Modo demonstração: VITE_API_BASE_URL vazia mesmo que exista um src/.env.local.
    vite(PORTA_DEMO, { VITE_API_BASE_URL: '' }),
    vite(PORTA_CONECTADO, { VITE_API_BASE_URL: URL_DA_API }),
    {
      command: 'node ../tests/api/servidor-de-referencia.mjs',
      cwd: raizDaAplicacao,
      // Sem sessão a rota responde 401, o que o Playwright aceita como "servidor no ar".
      url: `${URL_DA_API}/auth/me`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { API_PORT: String(PORTA_DA_API) },
    },
  ],
});
