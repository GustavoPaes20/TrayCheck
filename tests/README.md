# Testes do TrayCheck

Estratégia em camadas, conforme o plano de QA do Documento de Requisitos (§ Estratégia de testes). Todos os comandos rodam a partir da raiz do repositório com `corepack pnpm@10.34.3 --dir src <script>` (ou, dentro de `src/`, `corepack pnpm <script>`).

| Camada | Pasta | Ferramenta | Script | O que verifica |
| --- | --- | --- | --- | --- |
| Unitários | `unit/` | Vitest + Testing Library (jsdom) | `test:unit` | Cliente da API, dados de demonstração, componentes isolados (login, conferência por voz, estoque, usuários, relatórios) |
| Integração | `integration/` | Vitest + Testing Library | `test:integration` | `App` completo em modo demonstração e em modo conectado, com a API simulada em memória (`helpers/api-falsa.ts`) |
| Contrato da API | `api/` | Newman (coleção Postman) | `test:api` | Os 22 endpoints de `src/docs/frontend-api-contract.md` (o que o frontend usa hoje): autenticação, permissões por perfil, validações, formato de erro, CORS |
| E2E | `e2e/` | Playwright (Chromium) | `test:e2e` | Fluxos reais no navegador: demonstração (desktop), conectado à API e navegação móvel |

`test` roda unitários + integração; `test:coverage` também mede cobertura (piso em `src/vitest.config.ts`); `typecheck` verifica tipos do app **e** dos testes. O workflow `.github/workflows/ci.yml` executa tudo: build + tipos, testes com cobertura, Newman e E2E.

## O servidor de referência da API

O repositório não tem backend. `api/servidor-de-referencia.mjs` implementa o contrato em memória (Node puro, sem dependências) para que o Newman e o E2E em modo conectado tenham um alvo determinístico. **Não é o backend de produção.** Quando o backend existir, aponte a coleção para ele:

```sh
API_BASE_URL=http://localhost:3000/api/v1 corepack pnpm@10.34.3 --dir src test:api
```

A coleção é repetível contra APIs persistentes (usa um e-mail único por execução e restaura a senha que altera).

**Relação com `docs/api/openapi.yaml` e `docs/api/postman_collection.json`.** Estes são o contrato e a coleção do backend real e cobrem muito mais rotas (checagens, checklists, kits...). A coleção de `tests/api/` é outra: verifica só as 22 rotas que o frontend usa hoje, do jeito que ele as usa (`src/docs/frontend-api-contract.md`), e roda no CI sem banco. Os códigos de status foram alinhados ao OpenAPI (login de inativo `401`, senha atual incorreta `400`, RN01 `409`). **Divergência conhecida:** `POST /reports` é rota de compatibilidade (obsoleta no OpenAPI, onde recebe um `checkId`); aqui ela segue o que o frontend envia hoje (relatório completo, `201`). Quando o frontend migrar para `POST /checks/{id}/finalize`, esta parte da coleção deve ser atualizada.

**Premissas** do servidor de referência, a confirmar com quem implementar o backend: somente `admin` altera estoque (`POST/PUT/DELETE /stock`, ajustes) e gerencia usuários; qualquer perfil autenticado lê estoque, cirurgias e relatórios e cria relatórios; senha nova tem no mínimo 8 caracteres; relatório com item `pending` é recusado com `409` (RN01).

## Voz nos testes

O microfone real não é automatizável. Os testes usam uma Web Speech API falsa (`helpers/voz.ts` nos unitários/integração; `e2e/apoio.ts` no navegador). A taxa de reconhecimento (RNF03, meta ≥ 80%) continua sendo **roteiro manual** da equipe de QA, em condições de ruído simuladas.

## Defeitos conhecidos documentados nos testes

Os testes abaixo estão marcados como falha esperada (`it.fails` no Vitest, `test.fail()` no Playwright): o CI fica verde enquanto o defeito existe e **acusa quando for corrigido** (aí basta trocar por `it`/`test`). Nenhum foi corrigido nesta mudança.

| Defeito | Onde | Requisito |
| --- | --- | --- |
| "Finalizar" encerra a conferência mesmo com itens pendentes | `VoiceChecklist.tsx` (`finalizarConferencia`) | RN01 |
| Só por toque a conferência nunca inicia/conclui (depende de ativar microfone ou modo demo) | `VoiceChecklist.tsx` | RNF02 |
| Editar um usuário inativo (modo demo) o reativa: o formulário grava `status: 'active'` fixo | `UserManager.tsx` (`enviarFormulario`) | RF01 |

Observação de comportamento (não é falha de teste): o reconhecimento ignora palavras com 3 letras ou menos; dizer só "CO2" não confirma o item "CO2 Medicinal" (é preciso dizer "medicinal").

## Rastreabilidade (resumo)

| Requisito | Cobertura |
| --- | --- |
| RF01, RN05 (login e perfis) | unit `login`, integração demo/conectado, Newman 00/02/06, E2E autenticação e permissões |
| RF02, RN02 (cadastro/estoque, só admin) | unit `stock-manager`, integração conectado, Newman 04, E2E estoque |
| RF05–RF07, RNF07 (conferência, confirmar/pular/finalizar, retorno sonoro) | unit `voice-checklist`, integração, E2E conferência por voz (mock) |
| RF08–RF10, RN01, RN04, RNF06 (histórico, divergências, relatórios) | unit `reports`, integração conectado, Newman 05, E2E conectado (persistência) |
| RNF01 (LGPD: proteção de credenciais) | unit `api-client` (token não vai ao armazenamento local), Newman 02/07 (nunca devolve senha/hash; troca de senha) |
| RNF02 (fallback por toque) | E2E móvel; defeito documentado acima |
| RNF03 (taxa de voz ≥ 80%) | **manual** |

## Executar localmente

```sh
corepack pnpm@10.34.3 --dir src install --frozen-lockfile
corepack pnpm@10.34.3 --dir src typecheck
corepack pnpm@10.34.3 --dir src test:coverage
corepack pnpm@10.34.3 --dir src test:api
corepack pnpm@10.34.3 --dir src exec playwright install chromium   # uma vez
corepack pnpm@10.34.3 --dir src test:e2e
```

O Playwright sobe sozinho os dois servidores do Vite (demonstração em `4173`, conectado em `4174`) e a API de referência (`3101`); fora do CI ele reaproveita servidores já em execução. Resultados ficam em `tests/api/results/` e `tests/e2e/results/` (ignorados pelo git).
