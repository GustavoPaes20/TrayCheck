import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

const raizDaAplicacao = path.dirname(fileURLToPath(import.meta.url));
/** O Vite entrega caminhos com "/" (inclusive no Windows); o Node usa "\\" lá. Normaliza para comparar sem erro. */
const normalizar = (caminho: string) => caminho.replace(/\\/g, '/');
const pastaDosTestes = normalizar(path.resolve(raizDaAplicacao, '../tests'));

/**
 * Os testes ficam em `tests/` (fora de `src/`), mas as dependências são instaladas em `src/node_modules`.
 * Este plugin resolve imports de pacotes feitos pelos arquivos de teste a partir de `src/`,
 * evitando duplicar o manifesto de dependências na raiz do repositório.
 */
function resolverDependenciasDosTestes(): Plugin {
  const modulosNativos = new Set([...builtinModules, ...builtinModules.map((nome) => `node:${nome}`)]);
  return {
    name: 'traycheck:resolver-dependencias-dos-testes',
    enforce: 'pre',
    async resolveId(origem, importador, opcoes) {
      if (!importador || !normalizar(importador).startsWith(`${pastaDosTestes}/`)) return null;
      if (origem.startsWith('.') || origem.startsWith('/') || origem.startsWith('@/') || origem.startsWith('\0')) return null;
      if (modulosNativos.has(origem) || origem.startsWith('node:')) return null;
      return this.resolve(origem, path.join(raizDaAplicacao, 'package.json'), { ...opcoes, skipSelf: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), resolverDependenciasDosTestes()],
  resolve: {
    alias: {
      '@': path.resolve(raizDaAplicacao, 'frontend'),
    },
  },
  server: {
    fs: { allow: [raizDaAplicacao, pastaDosTestes] },
  },
  test: {
    environment: 'jsdom',
    include: ['../tests/unit/**/*.test.{ts,tsx}', '../tests/integration/**/*.test.{ts,tsx}'],
    setupFiles: [path.resolve(pastaDosTestes, 'setup/vitest.setup.ts')],
    // Garante o modo demonstração por padrão, mesmo que exista um src/.env.local apontando para um backend.
    env: { VITE_API_BASE_URL: '' },
    css: false,
    restoreMocks: true,
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['frontend/**/*.{ts,tsx}'],
      exclude: ['frontend/main.tsx', 'frontend/vite-env.d.ts'],
      reporter: ['text-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // Piso de qualidade (cobertura medida na criação: ~85% linhas, ~83% ramos/funções). Só vale em `test:coverage`.
      thresholds: { statements: 80, lines: 80, functions: 78, branches: 75 },
    },
  },
});
