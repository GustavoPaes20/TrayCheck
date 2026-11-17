# Backend — TrayCheck

API REST que implementa o contrato [`docs/api/openapi.yaml`](../docs/api/openapi.yaml) (v1.1.0)
sobre o banco MySQL das migrações [`db/migrations`](../db/migrations).

**Stack:** Node.js 22+ · TypeScript · Express 5 · mysql2 · express-openapi-validator · bcryptjs

## Como rodar

```bash
# 1. Banco (uma vez): cria e popula traycheck com dados de demonstração
DB_NAME=traycheck ./db/aplicar.sh --seed          # na raiz do repositório

# 2. Backend
cd backend
cp .env.example .env    # preencha DB_PASSWORD
npm install
npm run dev             # http://localhost:3000/api/v1  (recarrega ao salvar)
```

| Script | O que faz |
| --- | --- |
| `npm run dev` | Sobe com `tsx watch`, lendo o `.env` |
| `npm run typecheck` | Confere os tipos sem gerar arquivos |
| `npm run build` | Compila `src/` para `dist/` |
| `npm start` | Roda a versão compilada |

`GET /health` (fora do contrato) mostra se o banco responde e quais migrações estão aplicadas.

## Estrutura

```
src/
  server.ts            Entrada: confere o banco e sobe o HTTP
  app.ts               Monta a app: CORS, JSON, validador do contrato, auth, rotas, erros
  config.ts            Variáveis de ambiente tipadas
  db/pool.ts           Pool MySQL + helpers (consultar, executar, emTransacao)
  http/erros.ts        ErroApi e tradução de erros (validador, MySQL) para o schema Error
  http/autenticacao.ts Autenticação PROVISÓRIA (até o RF02)
  http/perfis.ts       admin/nurse/technician <-> perfis do banco; aplica o x-roles do contrato
```

## Como uma requisição é tratada

1. **Validador do contrato** — caminho, método, parâmetros e corpo fora do `openapi.yaml`
   são recusados antes de chegar ao código (400 `VALIDACAO`, 404, 405 ou 415).
2. **autenticar** — identifica o usuário (`req.usuario`).
3. **autorizarPeloContrato** — aplica o `x-roles` da operação: 401 sem usuário, 403 perfil não permitido (RN05).
4. **Rota** — operação do contrato ainda sem implementação responde 501 `NAO_IMPLEMENTADO`.
5. **tratadorDeErros** — todo erro sai no formato `{ message, code, details }`; erros dos gatilhos
   do banco (`SIGNAL 45000`) viram 403/409 com a mensagem da regra.

## Autenticação provisória

Enquanto o RF02 (login) não é implementado, com `AUTH_PROVISORIA=true` (proibido em produção):

```bash
curl -H "Authorization: Bearer dev-2" http://localhost:3000/api/v1/instruments   # 2 = admin do seed
```

IDs do seed: `1` Ana Silva (enfermeiro) · `2` Administrador · `4` Rafael Lima (circulante).

O ID precisa ser de um usuário ativo no banco; o perfil dele vale normalmente.
