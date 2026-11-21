# Entrega do Backend — Pacote de repasse para a Gerência de Configuração

**Projeto:** TrayCheck (Projeto Integrador, FAMETRO) · **Data:** 18/11/2026 · **Responsável pelo backend:** Henrique Augusto de Souza Barros

> **Nota (21/11/2026):** este pacote usa a numeração de requisitos e casos de uso da ERS v2.3/v2.4. A partir da ERS v2.5 a numeração mudou (o cadastro de usuários passou a ser o RF01); a equivalência está em `db/README.md`. As seções da ERS também mudaram: a 4.5 (modelo de dados) passou a 4.3, e a 4.4 (casos de uso) passou a 3.3. O texto abaixo foi mantido como registrado em 18/11/2026.

Este arquivo reúne tudo o que o Gerente de Configuração precisa para atualizar os documentos oficiais (Word) e a planilha `Controle_ICs`. **Os textos abaixo estão prontos para copiar e colar.** Os números de versão são sugestões e podem ser ajustados.

---

## 1. O que foi entregue

| Item | Situação |
| --- | --- |
| Backend (`backend/`): 49 operações do contrato, RF01 a RF12 | Implementado, PRs #8 e #10 a #17 mesclados na `main` |
| Banco: migrações V001–V007 (V006 `sessao` e V007 `preferencia_notificacao` são novas) | V001–V005 nunca alteradas |
| Contrato `docs/api/openapi.yaml` | Versão **1.2.0** |
| Guia de integração do frontend (`docs/api/GUIA_FRONTEND.md`) | **Novo** |
| Decisões arquiteturais (`docs/adr/`, ADR 0001 a 0003) | **Novo** |

### Evidências de validação

| Verificação | Resultado |
| --- | --- |
| Contrato × código | 49/49 operações implementadas; nenhuma fora do contrato; todas com `x-roles` |
| Coleção oficial Postman (IC-17) contra o backend real | **55 requisições, 102 asserções, 0 falhas** (3 execuções seguidas); 0 avisos de resposta fora do contrato |
| Testes do banco (`tests/db`) | 70/70 (MySQL 8.4.9) |
| Unitários + integração (frontend) | 216 passaram, 3 falhas esperadas documentadas; cobertura 85,0% das linhas |
| Newman do CI (servidor de referência) | 72 requisições, 165 asserções, 0 falhas |
| E2E (Playwright) | 22/22 |
| Teste de navegador no stack real (frontend + backend + MySQL) | 14/14 verificações; o único ponto que falha é o salvamento do relatório (limitação do frontend, ver 3.6) |

### Documentos novos no repositório (sugestão de registro)
- `docs/api/GUIA_FRONTEND.md` — complemento do IC-16 (ou novo IC); versão 1.0.
- `docs/adr/` — ADR 0001 (sessões), 0002 (painel derivado) e 0003 (saldo de estoque); versão 1.0.
- `docs/ENTREGA_BACKEND_GC.md` — este pacote (não precisa virar IC).

---

## 2. Checklist do Gerente de Configuração

- [ ] **ERS** (IC-03): nova versão 2.4 (texto em 3.1).
- [ ] **RTM** (IC-14): nova versão 1.3 (texto em 3.2).
- [ ] **Inventário de ICs** (IC-13): nova versão 1.3 e a planilha `Controle_ICs` (texto em 3.3).
- [ ] **Registro de Baselines** (IC-23): nova versão 1.2 (texto em 3.4).
- [ ] **RFC-01, RFC-02 e RFC-03**: preencher os formulários do IC-22 (texto em 3.5).
- [ ] **Status Accounting** (IC-15): nova linha no histórico, igual à do Inventário.
- [ ] **DER** (IC-05): regerar (ver seção 4, item 1).
- [ ] Anexar a nota sobre os bugs do frontend (texto em 3.6).

---

## 3. Textos por documento

### 3.1 ERS (IC-03), nova versão 2.4

**Histórico de revisões (nova linha):**

> 18/11/2026 | 2.4 | Dicionário de dados (4.5) com as tabelas `sessao` (V006) e `preferencia_notificacao` (V007); registradas as regras implementadas no backend: sessão por tabela com expiração em 8 h sem atividade, senha inicial gerada pelo sistema, proteção do último administrador, painel inicial derivado das checagens do dia e saldo de estoque alterado apenas por movimentação (ADR 0001 a 0003). | Henrique Augusto de Souza Barros

**Seção 4.5, dicionário de dados (duas linhas novas):**

> **sessao** — Sessões de login. PK `id`; FK `usuario_id`; `token_hash` único (SHA-256 do token; o token nunca é gravado); `criada_em`, `ultimo_uso_em` (base da expiração por inatividade) e `revogada_em`. Atende RF02 e RNF01.
>
> **preferencia_notificacao** — Preferências de notificação por usuário. PK/FK `usuario_id`; indicadores `alerta_estoque`, `lembrete_cirurgia`, `checklist_por_voz` e `relatorio_semanal`. Sem linha, valem os padrões. Atende ao perfil do usuário (rota de apoio).

**Seção 4.5.3, acrescentar às diferenças em relação ao diagrama:**

> As tabelas `sessao` e `preferencia_notificacao` não constam do diagrama de classes v2.1. Pendentes de RFC (RFC-02 e RFC-03).

### 3.2 RTM (IC-14), nova versão 1.3

**Histórico (nova linha):**

> 18/11/2026 | 1.3 | Back-end implementado: 49 operações do contrato `openapi.yaml` v1.2.0 mapeadas aos RF01 a RF12; situação "pendente" substituída por "implementado (verificado)"; lacunas revisadas. | Henrique Augusto de Souza Barros

**Seção 2, substituir a linha "API":**

> API: endpoints do contrato docs/api/openapi.yaml (versão 1.2.0, IC-16). Todos existem no contrato e estão implementados no backend (IC-06). A situação "implementado" indica endpoint verificado pela coleção oficial (IC-17: 55 requisições, 102 asserções, 0 falhas).

**Mapeamento a registrar** (inclui os 24 endpoints que a RTM 1.2 não citava):

| Requisito | Endpoints | Origem |
| --- | --- | --- |
| RF01 | `GET/POST /instruments`, `GET/PUT/DELETE /instruments/{id}`; `GET/POST /kits`, `GET/PUT/DELETE /kits/{id}` | PR #10 |
| RF02 | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (V006) | PR #14 |
| RF03 | `GET/POST /surgeries`, `GET/PUT/DELETE /surgeries/{id}`, `GET /surgeries/{id}/kit` | PR #11 |
| RF04 | `GET/POST /surgeries/{id}/checklists`, `GET /surgeries/{id}/checklists/active` | PR #12 |
| RF05, RF06, RF07, RF08, RF11 | `POST /checks`, `GET /checks/{id}`, `PATCH /checks/{id}/items/{itemId}`, `GET/POST /checks/{id}/divergences`, `POST /checks/{id}/finalize`, `POST /checks/{id}/cancel` | PR #13 |
| RF09, RF10 | `GET /checks`, `GET /reports`, `GET /reports/{id}`, `POST /reports` (obsoleta) | PR #13 |
| RF12 | `GET/POST /users`, `GET/PUT /users/{id}`, `PATCH /users/{id}/status` | PR #15 |
| Apoio | `GET/PATCH /profile`, `GET/PUT /profile/notifications` (V007), `PUT /profile/password`, `GET /dashboard`, `GET/POST /stock`, `PUT/DELETE /stock/{id}`, `POST /stock/{id}/adjustments` | PR #16 |

**Seção 6, lacunas:**

- **Remover:** "Back-end inexistente".
- **Remover** "Testes de API (Newman) e E2E rodam contra servidor de referência" e **reescrever como:** "A CI ainda não executa o backend; a validação contra o backend real foi feita manualmente." Ação: incluir backend e MySQL na CI.
- **Acrescentar:**
  1. O frontend usa `POST /reports` legado: a conferência por voz não é salva (migrar para `POST /checks` → `PATCH` → `finalize`; ver `docs/api/GUIA_FRONTEND.md`).
  2. O frontend usa `missing` onde o contrato usa `divergent`/`skipped`.
  3. A tela de usuários não exibe a `initialPassword` gerada.
  4. O backend não tem testes automatizados próprios (só Newman e `tests/db`).
  5. O DER (IC-05) não inclui `sessao` e `preferencia_notificacao`.
  6. Não existe tabela de agenda de cirurgias (o painel usa as checagens do dia; ADR 0002).

### 3.3 Inventário de ICs (IC-13), versão 1.3, e planilha `Controle_ICs`

**Histórico (nova linha):**

> 18/11/2026 | 1.3 | Registrado o backend (IC-06) e as migrações V006 e V007 (IC-18); contrato 1.2.0 (IC-16); situação de IC-14, IC-17, IC-20 e IC-21. A planilha Controle_ICs foi atualizada igual. | Henrique Augusto de Souza Barros

| IC | Versão → | Situação | Observação a registrar |
| --- | --- | --- | --- |
| IC-06 Código-fonte – Backend/API | 0.1 → **1.0** | Em revisão | Arquivo: `backend/`. PRs #8, #10 a #17 |
| IC-16 Contrato de API | 1.1.0 → **1.2.0** | Em revisão | `kitId` (#12); `password` e `UserCreated` (#15); `CheckItem.method` com `null`, 409 em `PUT /stock/{id}` e textos (#16, #17) |
| IC-17 Coleção Postman | 1.1 (sem mudança) | Em revisão | Evidência: 55 requisições, 102 asserções, 0 falhas contra o backend real |
| IC-18 Migrações do Banco | 1.0 → **1.1** | Em revisão | "V001–V007"; V006 `sessao`; V007 `preferencia_notificacao`; 70/70 testes (MySQL 8.4.9) |
| IC-03 ERS | 2.3.1 → **2.4** | Em revisão | Ver 3.1 |
| IC-14 RTM | 1.2 → **1.3** | Em revisão | Ver 3.2 |
| IC-05 DER | 1.0 → 1.1 | **Pendente** | Regerar com `db/der/gerar_der.py` (seção 4) |
| IC-20 Testes Automatizados | 0.1 | Em desenvolvimento | O backend não tem testes automatizados próprios |
| IC-21 Pipeline de CI | — | Em desenvolvimento | PR #9 (Node 22.22.2); a CI não executa o backend |
| Novos (sugestão) | 1.0 | Em revisão | `docs/api/GUIA_FRONTEND.md` e `docs/adr/` (ADR 0001 a 0003), como complemento do IC-16 ou ICs próprios |

### 3.4 Registro de Baselines (IC-23), versão 1.2

**Histórico (nova linha):**

> 18/11/2026 | 1.2 | BL-IMPL-S2: backend implementado (IC-06 1.0), migrações V001–V007 (IC-18 1.1), contrato 1.2.0 (IC-16). Continua não congelada: pendentes IC-07/IC-08 (integração do frontend), IC-09 e CI com o backend. | Henrique Augusto de Souza Barros

**Seção 4.2, atualizar as condições da BL-IMPL-S2:**

> - IC-06: **atendida** (backend com RF01 a RF12).
> - IC-16: versão 1.2.0.
> - IC-18: versão 1.1 (V001–V007).
> - IC-07: **pendente** — migrar o frontend ao contrato 1.2.0 (BUG-FE-001 a BUG-FE-006; ver 3.6).
> - CI: **pendente** — incluir backend e Newman oficial.

### 3.5 RFCs (formulários do IC-22)

> **RFC-01 — Contrato de API 1.2.0 (IC-16)**
> **Solicitante:** Henrique Augusto de Souza Barros | **Data:** 18/11/2026 | **IC afetado:** `docs/api/openapi.yaml` (1.1.0 → 1.2.0)
> **Descrição:** (a) `kitId` opcional em `StandardChecklistInput` (cópia de kit, UC04 e fluxo A4); (b) `password` opcional em `UserInput` e `POST /users` responde `UserCreated` com `initialPassword`; `PUT /users/{id}` redefine a senha; (c) correções: `CheckItem.method` passa a listar `null` no enum, `PUT /stock/{id}` documenta o 409, textos de dashboard, agenda e notificações.
> **Justificativa:** permitir o UC04-A4 e o cadastro de usuário sem campo de senha no frontend; eliminar avisos de resposta fora do contrato.
> **Impacto:** compatível com o contrato anterior (campos opcionais). A coleção Postman (IC-17), a RTM (IC-14) e o guia `docs/api/GUIA_FRONTEND.md` citam a versão 1.2.0. **Origem:** PRs #12, #15, #16 e #17. **Aprovação CCB:** pendente.

> **RFC-02 — Migração V006__sessao.sql (IC-18)**
> **Solicitante:** Henrique Augusto de Souza Barros | **Data:** 18/11/2026 | **IC afetado:** `db/migrations/` (1.0 → 1.1)
> **Descrição:** tabela `sessao`: token (somente o hash SHA-256), `ultimo_uso_em` e `revogada_em`.
> **Justificativa:** o RF02 exige expiração em 8 h sem atividade, encerramento no logout e invalidação imediata ao inativar o usuário, e o banco não tinha onde guardar sessões. Atende RNF01 (o token não é gravado). Decisão registrada no ADR 0001.
> **Impacto:** nenhuma migração existente alterada; ERS 4.5 e DER precisam incluir a tabela. **Origem:** PR #14. **Aprovação CCB:** pendente.

> **RFC-03 — Migração V007__preferencia_notificacao.sql (IC-18)**
> **Solicitante:** Henrique Augusto de Souza Barros | **Data:** 18/11/2026 | **IC afetado:** `db/migrations/` (1.0 → 1.1)
> **Descrição:** tabela `preferencia_notificacao` (uma linha por usuário; sem linha valem os padrões).
> **Justificativa:** `/profile/notifications` do contrato e da tela de perfil não tinha onde persistir; a tabela persiste após reiniciar e funciona com mais de uma instância.
> **Impacto:** nenhuma migração existente alterada; ERS 4.5 e DER precisam incluir a tabela. **Origem:** PR #16. **Aprovação CCB:** pendente.

**Observação sobre o processo:** o Registro de Baselines só exige RFC depois do congelamento, e as mudanças anteriores foram feitas por Pull Request "porque nenhuma baseline estava congelada". Como nenhuma tag existe, as três RFCs acima funcionam como **registro formal retroativo**.

### 3.6 Nota sobre os bugs do frontend (anexar à RTM, seção 6, e ao Status Accounting)

> Os bugs de interface e de integração identificados nos testes manuais do navegador (BUG-FE-001 a BUG-FE-006) pertencem exclusivamente à camada `src/` (IC-07 e IC-08). O backend (IC-06) foi validado de forma independente: coleção oficial com 55 requisições e 102 asserções sem falhas, 49/49 operações do contrato implementadas e 70/70 testes do banco. As correções são de responsabilidade da equipe de frontend e condicionam o congelamento da BL-IMPL-S2. **Documentação dos bugs: Relatório de QA Frontend em PDF entregue à equipe em 18/11/2026.** O guia `docs/api/GUIA_FRONTEND.md` descreve os ajustes de integração com o contrato 1.2.0.

---

## 4. Pendências e riscos

1. **DER (IC-05) — não regerado.** O ambiente do desenvolvedor não tem **Python 3** nem **Graphviz** (`dot`). Quem for regerar precisa instalar os dois e ter o cliente `mysql` no PATH:
   ```powershell
   winget install Python.Python.3.12
   winget install Graphviz.Graphviz
   # abra um novo terminal, na raiz do repositório:
   $env:MYSQL_PWD = "<senha do root>"; $env:DB_NAME = "traycheck"
   python db/der/gerar_der.py
   ```
   O script lê o banco migrado e **desenha sozinho** as tabelas novas (`sessao` e `preferencia_notificacao` aparecem em cinza, fora dos grupos). Saída: `db/der/DER_TrayCheck.png`, `.svg` e `.dot`. Depois, versionar os três arquivos e registrar o IC-05 na versão 1.1.
2. **BL-IMPL-S2 ainda não pode ser congelada:** faltam IC-07/IC-08 (integração do frontend com o contrato 1.2.0), IC-09 e a CI executando o backend.
3. **Cobertura de testes do backend:** não há testes automatizados próprios; a validação é a coleção oficial (Newman) e `tests/db`. Recomenda-se incluí-los na CI.
4. **Aprovação das RFCs** pelo CCB continua pendente.
