import express, { type Express, type RequestHandler } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import { config, emProducao } from './config.js';
import { verificarBanco } from './db/pool.js';
import { autenticar } from './http/autenticacao.js';
import { rotaNaoEncontrada, tratadorDeErros } from './http/erros.js';
import { autorizarPeloContrato } from './http/perfis.js';
import { rotasInstrumentais } from './rotas/instrumentais.js';
import { rotasKits } from './rotas/kits.js';

/** CORS simples para o frontend (Vite) chamar a API com cookies/credenciais. */
const cors: RequestHandler = (req, res, next) => {
  const origem = req.headers.origin;
  if (origem && config.origensCors.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
};

/**
 * Monta a aplicação Express. Fica separada do server.ts para que os testes
 * possam criar a app sem abrir uma porta.
 */
export function criarApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(cors);
  app.use(express.json({ limit: '1mb' }));

  // Verificação de saúde — fora do prefixo /api/v1 e, portanto, fora do contrato.
  app.get('/health', async (_req, res) => {
    try {
      const { versoes } = await verificarBanco();
      res.json({ status: 'ok', banco: config.banco.nome, migracoes: versoes });
    } catch (erro) {
      res.status(503).json({ status: 'erro', banco: config.banco.nome, message: String((erro as Error).message) });
    }
  });

  // ── Contrato: toda requisição em /api/v1 é validada contra o openapi.yaml ──
  // Caminho, método, parâmetros e corpo fora do contrato -> 400 (ou 404/405) antes de chegar no código.
  app.use(
    OpenApiValidator.middleware({
      apiSpec: config.caminhoOpenApi,
      validateApiSpec: true,
      validateRequests: {
        allowUnknownQueryParameters: false,
        allErrors: true, // devolve todos os campos inválidos de uma vez, não só o primeiro
      },
      // Em desenvolvimento, também confere se NOSSAS respostas seguem o contrato (pega bugs cedo).
      validateResponses: emProducao ? false : { onError: (erro, corpo, req) => {
        console.warn(`[contrato] resposta fora do openapi.yaml em ${req.method} ${req.originalUrl}: ${erro.message}`);
        void corpo;
      } },
      // A segurança é feita pelos nossos middlewares (autenticacao.ts e perfis.ts), que leem o mesmo contrato.
      validateSecurity: false,
      ignorePaths: /^\/health$/,
    }),
  );

  app.use(autenticar);
  app.use(autorizarPeloContrato);

  // Rotas da API (/api/v1). Cada fase registra aqui o seu roteador.
  const api = express.Router();
  api.use(rotasInstrumentais); // RF01
  api.use(rotasKits); // RF01
  app.use(config.prefixoApi, api);

  app.use(rotaNaoEncontrada);
  app.use(tratadorDeErros);
  return app;
}
