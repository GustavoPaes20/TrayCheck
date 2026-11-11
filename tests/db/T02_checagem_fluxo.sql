-- RF05, RF06, RF07, RF08, RF09, RF10, RN01, RN03, RN04, RNF06
-- Checklist 1 = Artroscopia de Joelho (12 itens). Usuário 1 = Ana (enfermeiro).
SET @arquivo = 'T02_checagem_fluxo';

-- RF05: iniciar checagem ---------------------------------------------------------
INSERT INTO checagem (checklist_padrao_id, usuario_id, sala) VALUES (1, 1, 'Sala 2');
SET @c = LAST_INSERT_ID();
CALL assert_igual('RF05: itens do checklist são copiados como pendentes',
    (SELECT COUNT(*) FROM item_checagem WHERE checagem_id = @c AND status = 'pendente'), '12');
CALL assert_erro('RF05: não inicia checagem de checklist inativo',
    CONCAT("INSERT INTO checagem (checklist_padrao_id, usuario_id) SELECT id, 1 FROM checklist_padrao WHERE NOT ativo LIMIT 1"),
    'RF05');
CALL assert_erro('RF05: checagem não nasce finalizada',
    "INSERT INTO checagem (checklist_padrao_id, usuario_id, status, finalizada_em) VALUES (1, 1, 'finalizada', NOW())",
    'em_andamento');

-- Item da checagem por posição no checklist (ordem)
SET @i1  = (SELECT ich.id FROM item_checagem ich JOIN item_checklist ic ON ic.id = ich.item_checklist_id WHERE ich.checagem_id = @c AND ic.ordem = 1);  -- Luvas (4)
SET @i2  = (SELECT ich.id FROM item_checagem ich JOIN item_checklist ic ON ic.id = ich.item_checklist_id WHERE ich.checagem_id = @c AND ic.ordem = 2);  -- Bisturi (2)
SET @i3  = (SELECT ich.id FROM item_checagem ich JOIN item_checklist ic ON ic.id = ich.item_checklist_id WHERE ich.checagem_id = @c AND ic.ordem = 3);
SET @i4  = (SELECT ich.id FROM item_checagem ich JOIN item_checklist ic ON ic.id = ich.item_checklist_id WHERE ich.checagem_id = @c AND ic.ordem = 4);

-- RF06: confirmar e pular ---------------------------------------------------------
UPDATE item_checagem SET status = 'confirmado', metodo_confirmacao = 'voz', transcricao = 'luvas estéreis', registrado_por = 1 WHERE id = @i1;
CALL assert_igual('RF06: confirmado sem quantidade assume a esperada',
    (SELECT quantidade_encontrada FROM item_checagem WHERE id = @i1), '4');
CALL assert_igual('RF06: confirmação registra horário',
    (SELECT registrado_em IS NOT NULL FROM item_checagem WHERE id = @i1), '1');
UPDATE item_checagem SET status = 'pulado', metodo_confirmacao = 'toque', registrado_por = 1 WHERE id = @i4;
CALL assert_igual('RF06: item pulado é diferente de divergente',
    (SELECT status FROM item_checagem WHERE id = @i4), 'pulado');
CALL assert_igual('RF06: pular não cria divergência',
    (SELECT COUNT(*) FROM divergencia WHERE item_checagem_id = @i4), '0');
CALL assert_erro('RF06: método de confirmação inválido é rejeitado',
    CONCAT("UPDATE item_checagem SET status = 'confirmado', metodo_confirmacao = 'telepatia' WHERE id = ", @i3),
    'ck_item_checagem_metodo');

-- RN04 / RF09: divergências automáticas ------------------------------------------
UPDATE item_checagem SET status = 'confirmado', quantidade_encontrada = 1, metodo_confirmacao = 'toque' WHERE id = @i2;
CALL assert_igual('RN04: confirmar com quantidade menor vira divergente',
    (SELECT status FROM item_checagem WHERE id = @i2), 'divergente');
CALL assert_igual('RN04: divergência "faltante" criada automaticamente',
    (SELECT CONCAT(tipo, ':', quantidade_esperada, '->', quantidade_encontrada, ':', gerada_automaticamente) FROM divergencia WHERE item_checagem_id = @i2), 'faltante:2->1:1');

UPDATE item_checagem SET status = 'divergente', quantidade_encontrada = 3 WHERE id = @i3;
CALL assert_igual('RF09: quantidade maior gera divergência "excedente"',
    (SELECT tipo FROM divergencia WHERE item_checagem_id = @i3), 'excedente');
UPDATE item_checagem SET status = 'pendente' WHERE id = @i3;
CALL assert_igual('RN04: voltar para pendente remove a divergência automática',
    (SELECT COUNT(*) FROM divergencia WHERE item_checagem_id = @i3), '0');
CALL assert_igual('Voltar para pendente limpa quantidade e horário',
    (SELECT CONCAT(COALESCE(quantidade_encontrada, 'null'), '/', COALESCE(registrado_em, 'null')) FROM item_checagem WHERE id = @i3), 'null/null');

INSERT INTO divergencia (checagem_id, descricao_item, tipo, quantidade_encontrada, observacao, registrada_por)
VALUES (@c, 'Pinça Allis', 'excedente', 1, 'Item fora do checklist encontrado na bandeja', 1);
CALL assert_igual('RF09: excedente fora do checklist é registrado',
    (SELECT COUNT(*) FROM divergencia WHERE checagem_id = @c AND item_checagem_id IS NULL), '1');
CALL assert_erro('RF09: divergência sem item identificado é rejeitada',
    CONCAT("INSERT INTO divergencia (checagem_id, tipo) VALUES (", @c, ", 'outro')"),
    'ck_divergencia_alvo');

-- RN01: não finaliza com pendências ----------------------------------------------
CALL assert_erro('RN01: não finaliza com itens pendentes',
    CONCAT("UPDATE checagem SET status = 'finalizada' WHERE id = ", @c),
    'RN01');

-- Trata o restante e finaliza (RF07)
UPDATE item_checagem SET status = 'confirmado', metodo_confirmacao = 'voz', registrado_por = 1
 WHERE checagem_id = @c AND status = 'pendente';
CALL assert_ok('RF07: finaliza quando todos os itens foram tratados',
    CONCAT("UPDATE checagem SET status = 'finalizada' WHERE id = ", @c));
CALL assert_igual('RF07: horário de finalização preenchido automaticamente',
    (SELECT finalizada_em IS NOT NULL FROM checagem WHERE id = @c), '1');

-- RF10 / RN04: relatório ---------------------------------------------------------
CALL assert_igual('RF10: relatório gerado automaticamente ao finalizar',
    (SELECT COUNT(*) FROM relatorio_conferencia WHERE checagem_id = @c), '1');
CALL assert_igual('RF10: contagens do relatório (total/confirmados/pulados/divergentes/divergências)',
    (SELECT CONCAT_WS('/', total_itens, confirmados, pulados, divergentes, divergencias) FROM relatorio_conferencia WHERE checagem_id = @c),
    '12/10/1/1/2');
CALL assert_igual('RNF06: relatório sinaliza divergência',
    (SELECT status FROM relatorio_conferencia WHERE checagem_id = @c), 'divergencia');
CALL assert_igual('RN04: divergências entram no relatório (JSON)',
    (SELECT JSON_LENGTH(conteudo, '$.divergencias') FROM relatorio_conferencia WHERE checagem_id = @c), '2');
CALL assert_igual('RF10: relatório guarda o procedimento',
    (SELECT JSON_UNQUOTE(JSON_EXTRACT(conteudo, '$.procedimento.nome')) FROM relatorio_conferencia WHERE checagem_id = @c),
    'Artroscopia de Joelho');
CALL assert_igual('RF10: relatório guarda os 12 itens',
    (SELECT JSON_LENGTH(conteudo, '$.itens') FROM relatorio_conferencia WHERE checagem_id = @c), '12');

-- RN03: imutabilidade ------------------------------------------------------------
CALL assert_erro('RN03: checagem finalizada não pode ser reaberta',
    CONCAT("UPDATE checagem SET status = 'em_andamento', finalizada_em = NULL WHERE id = ", @c), 'RN03');
CALL assert_erro('RN03: observação de checagem finalizada não pode ser editada',
    CONCAT("UPDATE checagem SET observacao = 'x' WHERE id = ", @c), 'RN03');
CALL assert_erro('RN03: item de checagem finalizada não pode ser alterado',
    CONCAT("UPDATE item_checagem SET status = 'confirmado' WHERE id = ", @i2), 'RN03');
CALL assert_erro('RN03: não aceita nova divergência após finalizar',
    CONCAT("INSERT INTO divergencia (checagem_id, descricao_item, tipo) VALUES (", @c, ", 'X', 'outro')"), 'RN03');
CALL assert_erro('RN03: divergência de checagem finalizada não pode ser excluída',
    CONCAT("DELETE FROM divergencia WHERE checagem_id = ", @c), 'RN03');
CALL assert_erro('RN03: checagem não pode ser excluída',
    CONCAT("DELETE FROM checagem WHERE id = ", @c), 'RN03');
CALL assert_erro('RN03: relatório não pode ser alterado',
    CONCAT("UPDATE relatorio_conferencia SET status = 'ok' WHERE checagem_id = ", @c), 'RN03');
CALL assert_erro('RN03: relatório não pode ser excluído',
    CONCAT("DELETE FROM relatorio_conferencia WHERE checagem_id = ", @c), 'RN03');
CALL assert_erro('Histórico: itens de checklist já usado não podem mudar',
    "UPDATE item_checklist SET quantidade_esperada = 99 WHERE checklist_padrao_id = 1 LIMIT 1", 'nova versão');
CALL assert_erro('Histórico: não adiciona item a checklist já usado',
    "INSERT INTO item_checklist (checklist_padrao_id, instrumental_id, quantidade_esperada) VALUES (1, 33, 1)", 'nova versão');

-- Checagem perfeita -> relatório OK ----------------------------------------------
INSERT INTO checagem (checklist_padrao_id, usuario_id) VALUES (4, 4);  -- Hérnia, Rafael (circulante)
SET @c2 = LAST_INSERT_ID();
UPDATE item_checagem SET status = 'confirmado', metodo_confirmacao = 'voz', registrado_por = 4 WHERE checagem_id = @c2;
UPDATE checagem SET status = 'finalizada' WHERE id = @c2;
CALL assert_igual('RF10: checagem sem divergências gera relatório "ok"',
    (SELECT status FROM relatorio_conferencia WHERE checagem_id = @c2), 'ok');

-- Isolamento entre checagens ------------------------------------------------------
INSERT INTO checagem (checklist_padrao_id, usuario_id) VALUES (5, 1);
SET @c3 = LAST_INSERT_ID();
CALL assert_erro('RF09: divergência não pode apontar item de outra checagem',
    CONCAT("INSERT INTO divergencia (checagem_id, item_checagem_id, tipo) VALUES (", @c3, ", ", @i1, ", 'faltante')"),
    'não pertence');
CALL assert_ok('Checagem em andamento pode ser cancelada',
    CONCAT("UPDATE checagem SET status = 'cancelada' WHERE id = ", @c3));
CALL assert_igual('Cancelar não gera relatório',
    (SELECT COUNT(*) FROM relatorio_conferencia WHERE checagem_id = @c3), '0');
CALL assert_erro('RF08: checagem cancelada não pode ser alterada',
    CONCAT("UPDATE item_checagem SET status = 'confirmado' WHERE checagem_id = ", @c3, " LIMIT 1"), 'RN03');
