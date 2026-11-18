# ADR 0003 — Saldo de estoque alterado apenas por movimentação

- **Status:** Aceita (18/11/2026)
- **Requisitos:** rota de apoio `/stock` (a migração V005 está pendente de RFC para a ERS)
- **Origem:** PR #16 (rotas de apoio); migração `V005__estoque.sql`

## Contexto

O contrato expõe `/stock` e `POST /stock/{id}/adjustments`. A migração V005 modela o estoque assim:

- `estoque_item` guarda **um saldo por instrumental** (`instrumental_id` único), com `quantidade_disponivel`, `quantidade_minima` e a `situacao` calculada pelo banco (`ok`, `low` ou `critical`);
- `estoque_movimentacao` guarda cada entrada ou saída (`delta`, `motivo`, `usuario_id`). Gatilhos aplicam o `delta` no saldo, **recusam saldo negativo** e tornam a movimentação **imutável** (sem `UPDATE` nem `DELETE`).

O frontend de referência permitia editar a quantidade diretamente e "travava em zero" nas saídas.

## Decisão

**O saldo só muda por uma movimentação.** A API nunca altera `quantidade_disponivel` por conta própria depois do cadastro:

- **Cadastro (`POST /stock`):** o saldo inicial entra direto no registro (não é movimentação). Sem `instrumentId`, o instrumental é criado na mesma transação (código gerado do nome, sem colisão); com `instrumentId`, usa-se o existente.
- **Ajuste (`POST /stock/{id}/adjustments`):** insere uma movimentação. O saldo é travado (`SELECT ... FOR UPDATE`) e conferido antes; saída maior que o saldo retorna `400 ESTOQUE_INSUFICIENTE`. O gatilho do banco continua como segunda barreira.
- **Edição (`PUT /stock/{id}`):** se `available` mudar, a diferença vira uma movimentação ("Ajuste pela edição do item"). Nome, unidade e categoria são atualizados **no instrumental**, a fonte única desses dados.
- **Exclusão (`DELETE /stock/{id}`):** só enquanto **não houver movimentações**; senão `409 ITEM_COM_MOVIMENTACOES`. O instrumental permanece no catálogo.
- Quantidades acima de 1 bilhão são recusadas com `400`, em vez de estourar o tipo do banco.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
| --- | --- |
| **Editar `quantidade_disponivel` diretamente** | Perde a rastreabilidade (quem, quando e por quê) e contorna os gatilhos |
| **Travar o saldo em zero** (como o servidor de referência) | Esconde o erro: o usuário acha que retirou mais do que existia. O contrato manda `400` |
| **Registrar o saldo inicial como movimentação** | Todo item novo ficaria impossível de excluir, mesmo cadastrado por engano |

## Consequências

- Todo saldo é explicável pelo histórico de movimentações imutáveis; a concorrência é segura (duas saídas simultâneas nunca passam de zero, testado).
- Um item que já teve movimentação não pode ser excluído, apenas ter o saldo ajustado.
- Editar o nome pela tela de estoque altera o instrumental do catálogo (RF01), e um nome repetido retorna `409`.
- O frontend precisa tratar `ESTOQUE_INSUFICIENTE` nos botões −5/+5 e exibir o `409` da exclusão.
- A V005 foi mantida como está (nunca alterada); sua entrada na ERS segue pendente de RFC.
