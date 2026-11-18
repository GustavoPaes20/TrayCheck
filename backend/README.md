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

## Conectar o frontend (src/)

O frontend roda em `http://localhost:8443` (Vite) e o backend em `http://localhost:3000`. O backend só aceita
chamadas dessa origem (`CORS_ORIGIN` no `.env`; o padrão já é a 8443).

```bash
# Terminal 1 — backend (banco traycheck, com os dados de demonstração)
cd backend && npm run dev

# Terminal 2 — frontend apontando para o backend
cd src
echo "VITE_API_BASE_URL=http://localhost:3000/api/v1" > .env.local   # arquivo ignorado pelo Git
corepack pnpm@10.34.3 install --frozen-lockfile
corepack pnpm@10.34.3 dev                                            # abre em http://localhost:8443
```

Para voltar ao modo demonstração (sem backend), apague `src/.env.local`.

**Limitações conhecidas** (o frontend ainda usa o contrato antigo; ajustes ficam no `src/`):

- Ao concluir uma conferência por voz, o frontend envia o relatório montado no navegador para `POST /reports`
  (rota obsoleta). O backend exige um `checkId` de checagem finalizada, então a tela mostra "Relatório não salvo".
  O caminho definitivo é `POST /checks` → `PATCH /checks/{id}/items/{itemId}` → `POST /checks/{id}/finalize`.
- O frontend ainda usa o item `missing` nos relatórios; o contrato atual usa `divergent` e `skipped`.
- Sala e horário da programação do dia vêm das checagens do dia (não há agenda de cirurgias).
- O cadastro de usuário não envia senha: o backend gera uma e a devolve em `initialPassword`, que a tela ainda não exibe.

## Documentação relacionada

- [`docs/api/openapi.yaml`](../docs/api/openapi.yaml) — contrato oficial (1.2.0).
- [`docs/api/GUIA_FRONTEND.md`](../docs/api/GUIA_FRONTEND.md) — guia de integração do frontend (fluxo `/checks`, `initialPassword`, ajustes de estoque, status `divergent`/`skipped`).
- [`docs/adr/`](../docs/adr/README.md) — decisões arquiteturais (sessões, painel derivado, saldo de estoque).

## Estrutura

```
src/
  server.ts            Entrada: confere o banco e sobe o HTTP
  app.ts               Monta a app: CORS, JSON, validador do contrato, auth, rotas, erros
  config.ts            Variáveis de ambiente tipadas
  db/pool.ts           Pool MySQL + helpers (consultar, executar, emTransacao)
  http/erros.ts        ErroApi e tradução de erros (validador, MySQL) para o schema Error
  http/autenticacao.ts Identifica o usuário pelo token (Bearer ou cookie) e preenche req.usuario
  http/perfis.ts       admin/nurse/technician <-> perfis do banco; aplica o x-roles do contrato
  http/parametros.ts   Leitura de :id, ?active=, ?q= e formatação de datas
  dominio/             Regras e consultas reutilizadas (sessões, usuários, senhas, checagens, relatórios)
  rotas/               Um arquivo por área do contrato (autenticacao.ts, instrumentais.ts, ...)
```

## Andamento (ordem do professor)

| Fase | Requisito | Rotas | Situação |
| --- | --- | --- | --- |
| 1 | Fundação | — | Concluída |
| 2 | RF01 | `/instruments`, `/kits` | Concluída |
| 3 | RF03 | `/surgeries` | Concluída |
| 4 | RF04 | `/surgeries/{id}/checklists`, `/surgeries/{id}/checklists/active` | Concluída |
| 5 | RF05 a RF08, RF09, RF10, RF11 | `/checks`, `/reports` | Concluída |
| 6 | RF02 | `/auth/login`, `/auth/logout`, `/auth/me` | Concluída |
| 7 | RF12 | `/users`, `/users/{id}`, `/users/{id}/status` | Concluída |
| 8 | Apoio | `/profile`, `/dashboard`, `/stock` | Concluída |

Rota do contrato ainda sem implementação responde 501.

## Como uma requisição é tratada

1. **Validador do contrato** — caminho, método, parâmetros e corpo fora do `openapi.yaml`
   são recusados antes de chegar ao código (400 `VALIDACAO`, 404, 405 ou 415).
2. **autenticar** — lê o token da sessão (Bearer ou cookie) e identifica o usuário (`req.usuario`); token inválido ou expirado => 401.
3. **autorizarPeloContrato** — aplica o `x-roles` da operação: 401 sem usuário, 403 perfil não permitido (RN05).
4. **Rota** — operação do contrato ainda sem implementação responde 501 `NAO_IMPLEMENTADO`.
5. **tratadorDeErros** — todo erro sai no formato `{ message, code, details }`; erros dos gatilhos
   do banco (`SIGNAL 45000`) viram 403/409 com a mensagem da regra.

## Autenticação (RF02)

Login por e-mail e senha em `POST /auth/login`. A resposta traz o usuário e o `accessToken`, e também
define o cookie HttpOnly `traycheck_session` (`SameSite=Strict`). Nas demais rotas envie
`Authorization: Bearer <accessToken>` ou deixe o navegador mandar o cookie.

```bash
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json"   -d email:admin@hospitalcentral.br
curl -H "Authorization: Bearer <accessToken>" http://localhost:3000/api/v1/auth/me
```

- Senhas ficam só como hash bcrypt. Credenciais erradas, e-mail inexistente e usuário inativo dão a mesma resposta.
- As sessões ficam na tabela `sessao` (migração **V006**): só o hash SHA-256 do token é gravado.
- A sessão expira após **8 horas sem atividade** (`SESSAO_OCIOSA_HORAS`) e cada uso a renova.
- O logout encerra a sessão. Usuário inativo perde o acesso na hora.

### Rotas de apoio

- **Perfil** (`/profile`): cada usuário só altera os próprios dados (nome e telefone). A troca de senha confere a atual e encerra as OUTRAS sessões. As preferências de notificação ficam em `preferencia_notificacao` (migração **V007**).
- **Dashboard** (`/dashboard`): sem tabela de agenda, é derivado das checagens reais do dia (programação, tendência hoje x ontem, kits prontos) e das situações do estoque.
- **Estoque** (`/stock`): leitura para todos; o resto só do administrador. O saldo muda apenas por movimentação (histórico imutável) e nunca fica negativo.

### Gestão de usuários (RF12)

Só o administrador acessa `/users`. Ao cadastrar, informe `password` (mínimo de 8 caracteres) ou omita para o
backend gerar uma senha aleatória, devolvida **uma única vez** em `initialPassword`. Inativar (`PATCH /users/{id}/status`)
ou redefinir a senha (`PUT` com `password`) encerra as sessões abertas do usuário. O último administrador ativo não
pode ser inativado nem perder o perfil.

Usuários do seed: `admin@hospitalcentral.br` / `admin123` (admin), `ana.silva@hospitalcentral.br` / `senha123`
(enfermeira), `rafael.lima@hospitalcentral.br` / `circ123` (circulante); os demais usam `traycheck123`.
