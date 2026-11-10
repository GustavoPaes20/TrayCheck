-- RF01, RF02, RF03, RF04, RN02, RN05, RNF01
-- Usuários do seed: 1=Ana (enfermeiro), 2=Carlos (admin), 4=Rafael (circulante), 6=Pedro (circulante inativo)
SET @arquivo = 'T01_cadastro_e_perfis';

-- RF01 / RNF01 -----------------------------------------------------------------
CALL assert_erro('RNF01: senha em texto puro é rejeitada',
    "INSERT INTO usuario (perfil_id, nome, email, senha_hash) VALUES (2, 'X', 'x@h.br', 'senha123')",
    'ck_usuario_senha_hash');
CALL assert_erro('RF01: e-mail duplicado é rejeitado',
    "INSERT INTO usuario (perfil_id, nome, email, senha_hash) VALUES (2, 'X', 'admin@hospitalcentral.br', REPEAT('a', 60))",
    'Duplicate entry');
CALL assert_erro('RF01: perfil inexistente é rejeitado',
    "INSERT INTO usuario (perfil_id, nome, email, senha_hash) VALUES (9, 'X', 'novo@h.br', REPEAT('a', 60))",
    'foreign key constraint');
CALL assert_igual('RF01: existem exatamente 3 perfis',
    (SELECT GROUP_CONCAT(codigo ORDER BY id) FROM perfil), 'admin,enfermeiro,circulante');

-- RF03 / RN02 ------------------------------------------------------------------
CALL assert_erro('RN02: enfermeiro não cadastra procedimento',
    "INSERT INTO procedimento (codigo, nome, especialidade, criado_por) VALUES ('t1', 'Teste', 'Geral', 1)",
    'RN02');
CALL assert_erro('RN05: circulante não cadastra procedimento',
    "INSERT INTO procedimento (codigo, nome, especialidade, criado_por) VALUES ('t1', 'Teste', 'Geral', 4)",
    'RN02');
CALL assert_ok('RF03: administrador cadastra procedimento',
    "INSERT INTO procedimento (codigo, nome, especialidade, criado_por) VALUES ('teste-rf03', 'Procedimento Teste', 'Geral', 2)");
CALL assert_erro('RF03: código de procedimento é único',
    "INSERT INTO procedimento (codigo, nome, especialidade, criado_por) VALUES ('joelho', 'Outro', 'Geral', 2)",
    'Duplicate entry');

-- RF02 -------------------------------------------------------------------------
CALL assert_erro('RF02: categoria de instrumental inválida é rejeitada',
    "INSERT INTO instrumental (codigo, nome, categoria) VALUES ('x', 'Pinça X', 'Brinquedo')",
    'ck_instrumental_categoria');
CALL assert_ok('RF02: cadastra instrumental',
    "INSERT INTO instrumental (codigo, nome, categoria, critico) VALUES ('pinca-kelly-reta', 'Pinça Kelly Reta', 'Instrumental', TRUE)");
CALL assert_ok('RF02: cadastra kit com instrumental',
    "INSERT INTO kit_instrumental (kit_id, instrumental_id, quantidade) SELECT 1, id, 2 FROM instrumental WHERE codigo = 'pinca-kelly-reta'");
CALL assert_erro('RF02: quantidade zero no kit é rejeitada',
    "INSERT INTO kit_instrumental (kit_id, instrumental_id, quantidade) VALUES (1, 2, 0)",
    'ck_kit_instrumental_quantidade');

-- RF04 / RN02 ------------------------------------------------------------------
SET @proc_teste = (SELECT id FROM procedimento WHERE codigo = 'teste-rf03');
CALL assert_erro('RN02: circulante não vincula checklist padrão',
    CONCAT("INSERT INTO checklist_padrao (procedimento_id, versao, criado_por) VALUES (", @proc_teste, ", '1.0', 4)"),
    'RN02');
INSERT INTO usuario (id, perfil_id, nome, email, senha_hash, ativo)
VALUES (99, 1, 'Adm Inativo', 'inativo@h.br', REPEAT('a', 60), FALSE);
CALL assert_erro('RN02: administrador inativo não vincula checklist',
    CONCAT("INSERT INTO checklist_padrao (procedimento_id, versao, criado_por) VALUES (", @proc_teste, ", '1.0', 99)"),
    'RN02');
CALL assert_ok('RF04: administrador vincula checklist padrão',
    CONCAT("INSERT INTO checklist_padrao (procedimento_id, versao, criado_por) VALUES (", @proc_teste, ", '1.0', 2)"));
CALL assert_erro('RF04: só um checklist ativo por procedimento',
    CONCAT("INSERT INTO checklist_padrao (procedimento_id, versao, criado_por) VALUES (", @proc_teste, ", '2.0', 2)"),
    'uq_checklist_padrao_um_ativo');
CALL assert_ok('RF04: nova versão inativa pode coexistir',
    CONCAT("INSERT INTO checklist_padrao (procedimento_id, versao, ativo, criado_por) VALUES (", @proc_teste, ", '2.0', FALSE, 2)"));
CALL assert_erro('RF04: quantidade esperada zero é rejeitada',
    CONCAT("INSERT INTO item_checklist (checklist_padrao_id, instrumental_id, quantidade_esperada) SELECT id, 1, 0 FROM checklist_padrao WHERE procedimento_id = ", @proc_teste, " AND versao = '1.0'"),
    'ck_item_checklist_quantidade');
CALL assert_ok('RF04: adiciona item ao checklist ainda não utilizado',
    CONCAT("INSERT INTO item_checklist (checklist_padrao_id, instrumental_id, quantidade_esperada) SELECT id, 1, 2 FROM checklist_padrao WHERE procedimento_id = ", @proc_teste, " AND versao = '1.0'"));
CALL assert_erro('RF04: instrumental repetido no mesmo checklist é rejeitado',
    CONCAT("INSERT INTO item_checklist (checklist_padrao_id, instrumental_id, quantidade_esperada) SELECT id, 1, 5 FROM checklist_padrao WHERE procedimento_id = ", @proc_teste, " AND versao = '1.0'"),
    'Duplicate entry');
CALL assert_igual('Seed: checklist do joelho tem 12 itens',
    (SELECT COUNT(*) FROM item_checklist WHERE checklist_padrao_id = 1), '12');
