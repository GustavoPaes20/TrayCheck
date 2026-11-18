# Registros de Decisão de Arquitetura (ADR)

Decisões arquiteturais do backend do TrayCheck (`backend/`), com contexto, alternativas e consequências, para que a equipe e a banca entendam **por que** o sistema é assim.

| ADR | Decisão | Status | Requisitos |
| --- | --- | --- | --- |
| [0001](0001-sessoes-em-tabela-com-sha256.md) | Sessões em tabela, com o token guardado só como hash SHA-256 | Aceita | RF02, RNF01 |
| [0002](0002-dashboard-derivado-das-checagens-do-dia.md) | Painel inicial derivado das checagens reais do dia | Aceita | Rota de apoio `/dashboard` |
| [0003](0003-saldo-de-estoque-apenas-por-movimentacao.md) | Saldo de estoque alterado apenas por movimentação | Aceita | Rota de apoio `/stock`, V005 |

## Formato

Cada ADR tem: **Status**, **Contexto**, **Decisão**, **Alternativas consideradas**, **Consequências** e **Referências**. Uma decisão nunca é apagada: se mudar, cria-se um ADR novo que a **substitui**, e o antigo passa a "Substituída por ADR-NNNN".

## Como acrescentar

Copie o ADR mais recente, use o próximo número (`NNNN-titulo-curto.md`) e inclua a linha na tabela acima. Decisões que alterem o contrato (`docs/api/openapi.yaml`) ou o banco (`db/migrations/`) também seguem o processo de RFC do Controle de Configuração.
