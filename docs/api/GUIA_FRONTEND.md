# Guia de integração do frontend com a API (contrato 1.2.0)

Guia para a equipe de frontend ligar o `src/` ao backend real (`backend/`). Complementa, e não substitui:

- [`docs/api/openapi.yaml`](openapi.yaml) — o contrato oficial (IC-16, versão **1.2.0**). Em caso de dúvida, ele manda.
- [`src/docs/frontend-api-contract.md`](../../src/docs/frontend-api-contract.md) — o que o frontend **espera hoje** (22 rotas, formato antigo).
- [`src/docs/guia-do-frontend.md`](../../src/docs/guia-do-frontend.md) — comportamento das telas.

> O `src/` não foi alterado por este guia. Os itens da seção 7 são os ajustes que cabem à equipe de frontend.

## 1. Como conectar

```bash
cd backend && npm run dev                      # API em http://localhost:3000/api/v1
cd src
echo "VITE_API_BASE_URL=http://localhost:3000/api/v1" > .env.local   # ignorado pelo Git
corepack pnpm@10.34.3 dev                      # frontend em http://localhost:8443
```

- O backend só aceita chamadas da origem `http://localhost:8443` (`CORS_ORIGIN` em `backend/.env`).
- O frontend já envia `credentials: 'include'`, o que é necessário para o cookie de sessão.
- Sem `VITE_API_BASE_URL` (ou apagando o `.env.local`), a aplicação volta ao modo demonstração.

## 2. Autenticação e sessão

| Item | Comportamento |
| --- | --- |
| Login | `POST /auth/login` devolve `{ user, accessToken }` **e** define o cookie `traycheck_session` (HttpOnly, SameSite=Strict) |
| Chamadas seguintes | `Authorization: Bearer <accessToken>` **ou** o cookie. O cookie mantém a sessão após recarregar a página (`GET /auth/me`) |
| Expiração | 8 horas **sem atividade** (cada uso renova). Depois disso, `401` |
| Logout | `POST /auth/logout` (204) encerra a sessão no servidor |
| Usuário inativado | A sessão dele cai na hora (`401`) |
| Credenciais erradas | `401` com `code: CREDENCIAIS_INVALIDAS` e a mensagem "E-mail ou senha incorretos." (igual para e-mail inexistente e usuário inativo) |

Todo erro tem o formato `{ "message": "...", "code": "...", "details": { ... } }`. Exiba o `message`; use o `code` para decisões da tela. Erros de validação trazem `details.fields` (campo → mensagem).

Tratamento sugerido: `401` → voltar ao login; `403` → mensagem "sem permissão" (não é erro de sessão).

## 3. Fluxo de checagem: `/checks` no lugar de `POST /reports`

**O problema hoje:** a conferência por voz é montada inteira no navegador e, no fim, o frontend envia o relatório pronto para `POST /reports`. Essa rota é **obsoleta**: ela só aceita `{ "checkId": "..." }` de uma checagem **já finalizada** e devolve o relatório existente. Enviar o relatório completo resulta em `400` e na mensagem "Relatório não salvo".

**O caminho definitivo:** a checagem passa a existir no servidor desde o início, e cada marcação é gravada na hora.

```
POST /checks                          1. inicia (cria os itens como "pendente")
PATCH /checks/{id}/items/{itemId}     2. para cada item: confirmar, pular ou divergente
POST /checks/{id}/divergences         3. (opcional) excedente fora do checklist
POST /checks/{id}/finalize            4. finaliza e recebe o relatório
POST /checks/{id}/cancel              *. cancelar com motivo (alternativa ao passo 4)
```

### Passo 1 — iniciar

`POST /checks` — perfis: **admin** e **nurse**. O **technician (circulante) não inicia** (`403`): ele participa de uma checagem já iniciada (`GET /checks?status=em_andamento`).

```json
// corpo
{ "surgeryId": "joelho", "room": "Sala 3", "notes": "opcional" }
```

`201` com `Location: /api/v1/checks/42` e o corpo `Check`: dados da checagem, `progress` e `items[]` (um por item do checklist **ativo**), todos com `status: "pendente"`. Guarde o `id` de cada item: é ele que vai na URL do passo 2.

Erros: `404` (procedimento inexistente ou sem checklist ativo) e `409 PROCEDIMENTO_INATIVO`.

### Passo 2 — marcar cada item

`PATCH /checks/{id}/items/{itemId}` — perfis: **nurse** e **technician** (o admin só consulta, `403`).

| Ação na tela | Corpo |
| --- | --- |
| Confirmar (voz) | `{ "status": "confirmado", "method": "voz", "transcript": "confirmar pinça kelly" }` |
| Confirmar (toque) | `{ "status": "confirmado", "method": "toque" }` |
| Pular | `{ "status": "pulado", "method": "toque" }` |
| Quantidade diferente | `{ "status": "confirmado", "foundQuantity": 5 }` ou `{ "status": "divergente", "foundQuantity": 1, "notes": "..." }` |
| Desfazer | `{ "status": "pendente" }` |

Regras que o servidor aplica (não reimplemente no cliente):

- `confirmado` sem `foundQuantity` assume a quantidade esperada.
- **RN07:** `confirmado` com quantidade **diferente** da esperada é gravado como `divergente`, e a divergência é criada sozinha (`faltante` se menor, `excedente` se maior). A resposta já traz o status final do item.
- `divergente` **exige** `foundQuantity` e ele não pode ser igual ao esperado (`400`).
- Um item já marcado pode ser corrigido enquanto a checagem estiver `em_andamento`.
- Checagem finalizada ou cancelada não aceita alterações: `409 CHECAGEM_ENCERRADA` (RN03).

A resposta é a **checagem completa** com `progress` recalculado: use-a para atualizar a tela.

### Passo 3 — excedente (opcional)

`POST /checks/{id}/divergences`, para o que está na bandeja mas **não está** no checklist:

```json
{ "type": "excedente", "instrumentId": "12", "foundQuantity": 1, "notes": "Tesoura extra." }
```

Informe `instrumentId` (item cadastrado) **ou** `description` (texto livre). `type`: `faltante`, `excedente` ou `outro`. `GET /checks/{id}/divergences` lista todas.

### Passo 4 — finalizar

`POST /checks/{id}/finalize` com `{ "notes": "opcional" }` → `200` com o `ChecklistReport` completo (já com `id`, `date`, `time`, `duration`, contadores e `items`). O cliente **não calcula nem envia** nenhum desses campos.

- Se restarem itens `pendente`: `409 ITENS_PENDENTES` com `details.pendingItems` (RN01). Peça ao usuário para tratar os pendentes.
- Chamar de novo: `409 CHECAGEM_ENCERRADA`.

### Cancelar

`POST /checks/{id}/cancel` com `{ "reason": "mín. 3 caracteres" }` — perfis **admin** e **nurse**. Não gera relatório.

### Equivalência com o formato antigo

| Hoje (`POST /reports`) | Agora |
| --- | --- |
| `surgeryId` | corpo do `POST /checks` |
| `items[].status = confirmed` | `PATCH` com `confirmado` |
| `items[].status = missing` ao **pular** | `PATCH` com `pulado` (pular **não** é divergência) |
| `items[].status = missing` por quantidade errada ou falta | `PATCH` com `divergente` + `foundQuantity` |
| `operator`, `operatorRole`, `date`, `time`, `duration` | calculados pelo servidor (operador = usuário da sessão) |
| `confirmed`, `missing`, `total`, `status` | calculados pelo servidor |

## 4. Status de item e de relatório: `divergent` e `skipped`

O contrato não usa mais `missing` nem `pending` nos itens de **relatório**.

| Banco / API de checagem (`CheckItem.status`) | Item no relatório (`ReportItem.status`) | Significado |
| --- | --- | --- |
| `pendente` | — | não existe em relatório finalizado (RN01) |
| `confirmado` | `confirmed` | conferido |
| `pulado` | `skipped` | **não conferido**; não cria registro de divergência, mas deixa o relatório em `divergencia` |
| `divergente` | `divergent` | quantidade diferente; o tipo (faltante/excedente/outro) está em `divergenceDetails` |

Contadores do relatório: `confirmed`, `skipped` e `missing`. O campo **`missing` continua com esse nome por compatibilidade, mas conta os itens `divergent`**. Vale `total = confirmed + skipped + missing`.

- `divergences` = total de **registros** de divergência (inclui excedentes fora do checklist).
- `status`: `ok` se tudo foi confirmado sem divergência; `divergencia` se houver item pulado, divergente ou algum registro de divergência.
- `ReportItem.id` é o ID do **instrumental**.
- `faltante` em item `critical` deve ser destacado na tela (RN09): use `items[].critical` junto de `divergenceDetails`.

## 5. Cadastro de usuário e `initialPassword`

`POST /users` (somente **admin**):

```json
{ "name": "Maria Souza", "email": "maria@hospitalcentral.br", "role": "nurse", "shift": "Turno A" }
```

- `password` é **opcional** (mínimo 8 caracteres, máximo 72 bytes). O frontend atual **não envia** senha.
- Sem `password`, o backend gera uma senha aleatória de 12 caracteres e a devolve **uma única vez** na resposta `201`:

```json
{ "id": "9", "name": "Maria Souza", "email": "maria@hospitalcentral.br", "role": "nurse",
  "shift": "Turno A", "status": "active", "lastActive": "Nunca", "initials": "MS",
  "initialPassword": "Kq7mXw3RtN9p" }
```

**O que a tela precisa fazer:** exibir `initialPassword` imediatamente (com botão "copiar" e o aviso "esta senha não será mostrada novamente") para o administrador repassar ao usuário. Ela **não pode ser consultada depois**; se for perdida, use `PUT /users/{id}` com `password` para redefinir.

Outros comportamentos de `/users`:

- `PUT /users/{id}` com `password` redefine a senha e encerra as sessões abertas do usuário.
- `PATCH /users/{id}/status` com `inactive` encerra as sessões na hora; reativar **não** as restaura.
- `409 EMAIL_DUPLICADO`; `409 ULTIMO_ADMINISTRADOR` ao inativar ou rebaixar o último administrador ativo.
- O e-mail é gravado em minúsculas.

## 6. Estoque

### Ajustes — `POST /stock/{id}/adjustments`

```json
{ "delta": -2, "reason": "Separado para cirurgia de joelho." }
```

- `delta` inteiro, **diferente de zero**: positivo = entrada, negativo = saída. `reason` é opcional (até 200 caracteres).
- Responde `200` com o `StockItem` atualizado.
- **O saldo nunca fica negativo:** saída maior que o saldo retorna `400` com `code: ESTOQUE_INSUFICIENTE`. O servidor de referência dos testes "travava em zero"; o backend real **recusa**. Os botões −5/+5 precisam tratar esse erro (ou ficar desabilitados quando `available` for menor que 5).
- Cada ajuste grava uma **movimentação imutável**; o servidor aplica o saldo.
- Erros: `400` (`delta` zero ou fora do limite), `403` (só admin), `404`.

### O que mais muda

- `POST /stock` **sem** `instrumentId` cadastra o instrumental (nome, unidade e categoria) e o saldo juntos. Com `instrumentId`, usa o instrumental existente e ignora esses três campos. Cada instrumental tem **um** saldo (`409` se já existir).
- `PUT /stock/{id}` atualiza nome, unidade e categoria **do instrumental** (aparecem também no cadastro de instrumentais) e o mínimo. Se `available` mudar, o servidor registra a diferença como movimentação ("Ajuste pela edição do item").
- `DELETE /stock/{id}` só funciona **sem movimentações**; senão `409 ITEM_COM_MOVIMENTACOES`.
- `status`: `critical` quando `available × 2 < minimum`; `low` quando `available < minimum`; senão `ok`.
- Nome de instrumental repetido: `409`.

## 7. O que difere do que o frontend espera hoje

Comparação com `src/docs/frontend-api-contract.md`.

| Rota | Diferença | Ajuste no frontend |
| --- | --- | --- |
| `POST /reports` | Obsoleta: aceita só `checkId` | Migrar para o fluxo da seção 3 |
| `GET /reports`, relatórios | Itens com `confirmed`/`skipped`/`divergent`; sem `pending`/`missing` | Atualizar tipos e telas (seção 4) |
| `POST /users` | Pode devolver `initialPassword` | Exibir uma vez (seção 5) |
| `POST /stock/{id}/adjustments` | `400` em saldo insuficiente | Tratar o erro (seção 6) |
| `DELETE /stock/{id}` | `409` se houver movimentações | Mostrar a mensagem |
| `GET /surgeries` | O `id` é o **código** (`joelho`); `scheduledToday` vem `0`; `room` e `time` não vêm | Não depender de sala e horário da cirurgia |
| `GET /dashboard` | Derivado das checagens do dia: `schedule` traz horário de início, sala (`—` se vazia) e situação `em-andamento`/`concluida`; `surgeon` é o **operador** da checagem; nunca há `aguardando` | Ajustar rótulos (não é o cirurgião) |
| `GET /users` | `lastActive` é `dd/MM/yyyy` ou `Nunca` | — |
| Perfis (RN05) | Circulante não inicia nem cancela checagem; admin não marca itens | Esconder ou desabilitar as ações |

Quem pode o quê (resumo, vem do `x-roles` do contrato):

| Área | admin | nurse | technician |
| --- | --- | --- | --- |
| Usuários e estoque (escrita) | sim | não | não |
| Instrumentais e kits (escrita) | sim | sim | não |
| Procedimentos e checklists (escrita) | sim | não | não |
| Iniciar e cancelar checagem | sim | sim | não |
| Marcar itens, divergências e finalizar | não | sim | sim |
| Consultas (checagens, relatórios, estoque, painel) | sim | sim | sim |

## 8. Referência rápida de códigos de erro

| `code` | Status | Quando |
| --- | --- | --- |
| `VALIDACAO` | 400 | Corpo ou parâmetro fora do contrato (veja `details.fields`) |
| `CREDENCIAIS_INVALIDAS` | 401 | Login recusado |
| `NAO_AUTENTICADO` | 401 | Sem sessão, sessão expirada ou encerrada |
| `SEM_PERMISSAO` | 403 | Perfil sem acesso à ação (RN05) |
| `NAO_ENCONTRADO` | 404 | Registro ou rota inexistente |
| `DUPLICADO`, `EMAIL_DUPLICADO` | 409 | Código, nome ou e-mail já cadastrado |
| `ITENS_PENDENTES` | 409 | Finalizar com itens pendentes (`details.pendingItems`) |
| `CHECAGEM_ENCERRADA` | 409 | Alterar checagem finalizada ou cancelada |
| `ULTIMO_ADMINISTRADOR` | 409 | Inativar ou rebaixar o último admin ativo |
| `ITEM_COM_MOVIMENTACOES` | 409 | Excluir saldo com histórico |
| `ESTOQUE_INSUFICIENTE` | 400 | Saída maior que o saldo |
| `SENHA_ATUAL_INCORRETA` | 400 | Troca de senha com a senha atual errada |
| `NAO_IMPLEMENTADO` | 501 | Rota do contrato sem implementação (não deve ocorrer na 1.2.0) |

## 9. Validação

Antes de integrar uma tela, confira o comportamento esperado com a coleção oficial (`docs/api/postman_collection.json`, IC-17): 55 requisições e 102 asserções, sem falhas contra o backend real. Para rodar:

```bash
./src/node_modules/.bin/newman run docs/api/postman_collection.json
```
