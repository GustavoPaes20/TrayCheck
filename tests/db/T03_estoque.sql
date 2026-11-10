-- Estoque (contrato /stock e /stock/{id}/adjustments)
SET @arquivo = 'T03_estoque';

-- Bisturi nº 10: 8 disponíveis, mínimo 10 (seed)
SET @e = (SELECT e.id FROM estoque_item e JOIN instrumental i ON i.id = e.instrumental_id WHERE i.nome = 'Bisturi nº 10');
CALL assert_igual('Situação "low" abaixo do mínimo', (SELECT situacao FROM estoque_item WHERE id = @e), 'low');

INSERT INTO estoque_movimentacao (estoque_item_id, delta, motivo, usuario_id) VALUES (@e, -4, 'Uso em cirurgia', 4);
CALL assert_igual('Saída atualiza o saldo', (SELECT quantidade_disponivel FROM estoque_item WHERE id = @e), '4');
CALL assert_igual('Situação "critical" abaixo de 50% do mínimo', (SELECT situacao FROM estoque_item WHERE id = @e), 'critical');
CALL assert_igual('Movimentação registra quem alterou', (SELECT atualizado_por FROM estoque_item WHERE id = @e), '4');

CALL assert_erro('Saída maior que o saldo é rejeitada',
    CONCAT("INSERT INTO estoque_movimentacao (estoque_item_id, delta, usuario_id) VALUES (", @e, ", -5, 2)"),
    'Estoque insuficiente');
CALL assert_igual('Saldo continua igual após erro', (SELECT quantidade_disponivel FROM estoque_item WHERE id = @e), '4');

INSERT INTO estoque_movimentacao (estoque_item_id, delta, motivo, usuario_id) VALUES (@e, 20, 'Reposição', 2);
CALL assert_igual('Entrada volta a "ok"', (SELECT situacao FROM estoque_item WHERE id = @e), 'ok');

CALL assert_erro('Movimentação com delta zero é rejeitada',
    CONCAT("INSERT INTO estoque_movimentacao (estoque_item_id, delta, usuario_id) VALUES (", @e, ", 0, 2)"),
    'ck_estoque_mov_delta');
CALL assert_erro('Movimentação não pode ser apagada',
    "DELETE FROM estoque_movimentacao LIMIT 1", 'imutáveis');
CALL assert_erro('Instrumental só tem um registro de estoque',
    CONCAT("INSERT INTO estoque_item (instrumental_id) SELECT instrumental_id FROM estoque_item WHERE id = ", @e),
    'Duplicate entry');
