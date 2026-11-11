-- =============================================================================
-- TrayCheck — dados de DEMONSTRAÇÃO (não aplicar em produção)
-- Gerado a partir de src/frontend/data/mockData.ts, para o banco ter os mesmos
-- dados que o modo demonstração do frontend.
--
-- Senhas (hash bcrypt): ana.silva → senha123 | rafael.lima → circ123 |
-- admin → admin123 | demais usuários → traycheck123
-- =============================================================================

SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO usuario (id, perfil_id, nome, email, senha_hash, telefone, registro_profissional, turno, ativo) VALUES
    (1, 2, 'Ana Silva', 'ana.silva@hospitalcentral.br', '$2b$10$AWmUzx8x5jNJjNmmr1ruRuUvsmacTxp1sTMHPLNLmm5K2ftN17rla', '(11) 99874-3210', 'COREN-SP 123456', 'Turno A (07:00–19:00)', TRUE),
    (2, 1, 'Carlos Mendes', 'admin@hospitalcentral.br', '$2b$10$4oMSi3pDHOKpLJpp7KFeeuspC7.p.s4Zc.TypEx.XO4GxK1rvVz2m', '(11) 97654-8800', NULL, 'Administrativo', TRUE),
    (3, 2, 'Fernanda Costa', 'fernanda.costa@hospitalcentral.br', '$2b$10$sIKDgZmTV0kaZieA4BveI.GyDnvVS29UY6f77euwGjrTh0z6eUvpy', NULL, NULL, 'Turno B', TRUE),
    (4, 3, 'Rafael Lima', 'rafael.lima@hospitalcentral.br', '$2b$10$DBsROaXnESvF9ElJaldnk.phuh3hcTwyK9Dw2jMla.ElLJ4qK4XDq', '(11) 98765-4321', NULL, 'Turno A (07:00–19:00)', TRUE),
    (5, 2, 'Juliana Rocha', 'juliana.rocha@hospitalcentral.br', '$2b$10$sIKDgZmTV0kaZieA4BveI.GyDnvVS29UY6f77euwGjrTh0z6eUvpy', NULL, NULL, 'Turno C', TRUE),
    (6, 3, 'Pedro Nunes', 'pedro.nunes@hospitalcentral.br', '$2b$10$sIKDgZmTV0kaZieA4BveI.GyDnvVS29UY6f77euwGjrTh0z6eUvpy', NULL, NULL, 'Turno B', FALSE),
    (7, 2, 'Mariana Torres', 'mariana.torres@hospitalcentral.br', '$2b$10$sIKDgZmTV0kaZieA4BveI.GyDnvVS29UY6f77euwGjrTh0z6eUvpy', NULL, NULL, 'Turno A', TRUE);

INSERT INTO instrumental (id, codigo, nome, categoria, unidade, critico) VALUES
    (1, 'luvas-estereis-7-5', 'Luvas Estéreis (7.5)', 'EPI', 'pares', TRUE),
    (2, 'bisturi-n-15', 'Bisturi nº 15', 'Instrumental', 'unid', TRUE),
    (3, 'artroscopio-4mm', 'Artroscópio 4mm', 'Instrumental', 'unid', TRUE),
    (4, 'shaver-artroscopico', 'Shaver Artroscópico', 'Instrumental', 'kit', TRUE),
    (5, 'torniquete-pneumatico', 'Torniquete Pneumático', 'Instrumental', 'unid', TRUE),
    (6, 'soro-fisiologico-3l', 'Soro Fisiológico 3L', 'Descartável', 'bolsas', FALSE),
    (7, 'campo-cirurgico-esteril', 'Campo Cirúrgico Estéril', 'Descartável', 'unid', FALSE),
    (8, 'cateter-de-irrigacao', 'Cateter de Irrigação', 'Descartável', 'unid', FALSE),
    (9, 'propofol-200mg', 'Propofol 200mg', 'Anestesia', 'amp', TRUE),
    (10, 'fentanil-250mcg', 'Fentanil 250mcg', 'Anestesia', 'amp', TRUE),
    (11, 'fio-de-sutura-pds-0', 'Fio de Sutura PDS 0', 'Descartável', 'unid', FALSE),
    (12, 'ancora-de-sutura-artro', 'Âncora de Sutura Artro', 'Implante', 'unid', TRUE),
    (13, 'bisturi-n-10', 'Bisturi nº 10', 'Instrumental', 'unid', TRUE),
    (14, 'sistema-de-bypass-cardiopulmonar', 'Sistema de Bypass Cardiopulmonar', 'Instrumental', 'kit', TRUE),
    (15, 'desfibrilador-interno', 'Desfibrilador Interno', 'Instrumental', 'unid', TRUE),
    (16, 'fio-prolene-4-0', 'Fio Prolene 4-0', 'Descartável', 'unid', TRUE),
    (17, 'heparina-5000ui', 'Heparina 5000UI', 'Anestesia', 'amp', TRUE),
    (18, 'dreno-de-torax', 'Dreno de Tórax', 'Descartável', 'unid', TRUE),
    (19, 'luvas-estereis-8-0', 'Luvas Estéreis (8.0)', 'EPI', 'pares', TRUE),
    (20, 'sistema-de-implante-pedicular', 'Sistema de Implante Pedicular', 'Implante', 'kit', TRUE),
    (21, 'eletrodos-de-neuromonitoramento', 'Eletrodos de Neuromonitoramento', 'Instrumental', 'unid', TRUE),
    (22, 'soro-fisiologico-1l', 'Soro Fisiológico 1L', 'Descartável', 'bolsas', FALSE),
    (23, 'luvas-estereis-7-0', 'Luvas Estéreis (7.0)', 'EPI', 'pares', TRUE),
    (24, 'bisturi-n-22', 'Bisturi nº 22', 'Instrumental', 'unid', TRUE),
    (25, 'tela-de-polipropileno-10x15', 'Tela de Polipropileno 10x15', 'Implante', 'unid', TRUE),
    (26, 'grasper-laparoscopico', 'Grasper Laparoscópico', 'Instrumental', 'unid', TRUE),
    (27, 'trocarte-10mm', 'Trocarte 10mm', 'Descartável', 'unid', FALSE),
    (28, 'co2-medicinal', 'CO2 Medicinal', 'Anestesia', 'cilindro', TRUE),
    (29, 'endoloop-cirurgico', 'Endoloop Cirúrgico', 'Descartável', 'unid', TRUE),
    (30, 'ocitocina-10ui', 'Ocitocina 10UI', 'Anestesia', 'amp', TRUE),
    (31, 'kit-raquianestesia', 'Kit Raquianestesia', 'Anestesia', 'kit', TRUE),
    (32, 'fio-vicryl-0', 'Fio Vicryl 0', 'Descartável', 'unid', FALSE),
    (33, 'aspirador-cirurgico', 'Aspirador Cirúrgico', 'Instrumental', 'unid', TRUE);

INSERT INTO procedimento (id, codigo, nome, especialidade, duracao_estimada, criado_por) VALUES
    (1, 'joelho', 'Artroscopia de Joelho', 'Ortopedia', '2–3h', 2),
    (2, 'cardio', 'Revascularização Cardíaca', 'Cardiologia', '4–6h', 2),
    (3, 'coluna', 'Artrodese de Coluna', 'Neurocirurgia', '3–5h', 2),
    (4, 'hernia', 'Herniorrafia Laparoscópica', 'Cirurgia Geral', '1–2h', 2),
    (5, 'apendicite', 'Apendicectomia', 'Cirurgia Geral', '1h', 2),
    (6, 'cesarea', 'Cesariana', 'Obstetrícia', '1–2h', 2);

INSERT INTO checklist_padrao (id, procedimento_id, versao, ativo, criado_por) VALUES
    (1, 1, '1.0', TRUE, 2),
    (2, 2, '1.0', TRUE, 2),
    (3, 3, '1.0', TRUE, 2),
    (4, 4, '1.0', TRUE, 2),
    (5, 5, '1.0', TRUE, 2),
    (6, 6, '1.0', TRUE, 2);

INSERT INTO item_checklist (checklist_padrao_id, instrumental_id, quantidade_esperada, ordem) VALUES
    (1, 1, 4, 1),
    (1, 2, 2, 2),
    (1, 3, 1, 3),
    (1, 4, 1, 4),
    (1, 5, 1, 5),
    (1, 6, 3, 6),
    (1, 7, 6, 7),
    (1, 8, 2, 8),
    (1, 9, 2, 9),
    (1, 10, 1, 10),
    (1, 11, 4, 11),
    (1, 12, 2, 12),
    (2, 1, 6, 1),
    (2, 13, 3, 2),
    (2, 14, 1, 3),
    (2, 15, 1, 4),
    (2, 16, 8, 5),
    (2, 17, 4, 6),
    (2, 7, 8, 7),
    (2, 18, 2, 8),
    (3, 19, 4, 1),
    (3, 2, 2, 2),
    (3, 20, 1, 3),
    (3, 21, 8, 4),
    (3, 22, 4, 5),
    (3, 7, 6, 6),
    (3, 9, 2, 7),
    (4, 23, 3, 1),
    (4, 24, 1, 2),
    (4, 25, 1, 3),
    (4, 26, 2, 4),
    (4, 27, 3, 5),
    (4, 28, 1, 6),
    (4, 7, 5, 7),
    (5, 23, 3, 1),
    (5, 24, 1, 2),
    (5, 26, 2, 3),
    (5, 29, 2, 4),
    (5, 27, 2, 5),
    (5, 28, 1, 6),
    (6, 1, 4, 1),
    (6, 24, 1, 2),
    (6, 7, 6, 3),
    (6, 30, 2, 4),
    (6, 31, 1, 5),
    (6, 32, 4, 6),
    (6, 33, 1, 7);

INSERT INTO kit (id, codigo, nome, descricao) VALUES
    (1, 'paramentacao-basica', 'Kit de Paramentação Básica', 'EPI e campos usados em todos os procedimentos');
INSERT INTO kit_instrumental (kit_id, instrumental_id, quantidade) VALUES
    (1, 1, 4),
    (1, 7, 6);

INSERT INTO estoque_item (instrumental_id, quantidade_disponivel, quantidade_minima, atualizado_por) VALUES
    (1, 48, 20, 2),
    (23, 12, 20, 2),
    (19, 30, 15, 2),
    (2, 35, 15, 2),
    (13, 8, 10, 2),
    (24, 20, 10, 2),
    (7, 120, 50, 4),
    (6, 24, 12, 4),
    (9, 6, 10, 2),
    (10, 15, 8, 4),
    (25, 3, 5, 2),
    (11, 28, 10, 4),
    (16, 20, 8, 4),
    (12, 4, 6, 2),
    (17, 18, 8, 4),
    (27, 15, 6, 4);

COMMIT;
