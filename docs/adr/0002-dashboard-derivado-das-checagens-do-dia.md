# ADR 0002 — Painel inicial derivado das checagens reais do dia

- **Status:** Aceita (18/11/2026)
- **Requisitos:** rota de apoio `GET /dashboard` (sem RF próprio)
- **Origem:** PR #16 (rotas de apoio)

## Contexto

O contrato define `DashboardSummary` com totais de cirurgias e de estoque, uma **programação do dia** (`schedule`) e uma **tendência** (`surgeryTrend`). O banco **não tem tabela de agenda de cirurgias** (V001–V007). O texto original do contrato mandava responder, para `schedule` e `surgeryTrend`, "dados de demonstração".

O frontend mostra esses números nos cartões "Cirurgias Hoje", "Kits Prontos" e "Itens em Estoque", e abre a conferência pelo botão "Conferir" de cada linha da programação.

## Decisão

Derivar o painel das **checagens reais** e do estoque, sem inventar dados:

| Campo | Definição |
| --- | --- |
| `totalSurgeries` | checagens **iniciadas hoje**, sem as canceladas |
| `readyKits` | checagens de hoje **concluídas sem divergência** (relatório com status `ok`) |
| `schedule` | essas mesmas checagens: horário de início, sala (`—` se vazia), situação `em-andamento` ou `concluida` |
| `schedule[].surgeon` | o **operador** da checagem (não há cadastro de cirurgião) |
| `surgeryTrend` | hoje comparado a ontem: `+N em relação a ontem`, `Igual a ontem` ou `-N em relação a ontem` |
| `criticalStockItems`, `lowStockItems`, `stockItemCount` | contagens por situação de `estoque_item` (calculada pelo banco) |

A situação `aguardando` **nunca** é devolvida, pois não existe agenda futura. "Hoje" é a data do banco (`CURDATE()`), no fuso do servidor.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
| --- | --- |
| **Dados de demonstração fixos** (o texto original do contrato) | Mostraria cirurgias e cirurgiões fictícios num sistema hospitalar real, o que pode enganar quem usa |
| **Lista vazia e sem tendência** | Honesto, mas o painel ficaria sem programação |
| **Nova tabela de agenda** (`V008`) | Exigiria rotas de cadastro de agenda que não existem no contrato; escopo maior que o do projeto |

## Consequências

- O painel reflete a operação real e muda sozinho conforme as checagens acontecem.
- **Limitação semântica:** `surgeon` traz o operador da checagem, e `aguardando` não existe. O frontend deve ajustar os rótulos.
- `GET /surgeries` devolve `scheduledToday = 0` e omite `room` e `time` (opcionais no contrato); as telas que usam esses campos precisam tolerar a ausência.
- Se um dia houver agenda de cirurgias, esta decisão será **substituída** por um novo ADR e por uma migração de agenda.
- O texto do contrato foi atualizado (versão 1.2.0) e a mudança consta da RFC-01.
