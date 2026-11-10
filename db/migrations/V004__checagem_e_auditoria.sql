-- =============================================================================
-- TrayCheck — V004: checagem, divergências e relatório de conferência
-- Requisitos: RF05, RF06, RF07, RF08, RF09, RF10, RNF06
-- Regras de negócio aplicadas no banco: RN01, RN03, RN04
--
-- Dados de auditoria não usam ON DELETE CASCADE: checagens não são apagadas,
-- apenas canceladas (status 'cancelada') enquanto estão em andamento.
-- =============================================================================

CREATE TABLE checagem (
    id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    checklist_padrao_id  INT UNSIGNED  NOT NULL,
    usuario_id           INT UNSIGNED  NOT NULL COMMENT 'Quem realiza a checagem',
    status               VARCHAR(20)   NOT NULL DEFAULT 'em_andamento',
    sala                 VARCHAR(40)   NULL,
    observacao           VARCHAR(500)  NULL,
    iniciada_em          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizada_em        DATETIME      NULL,
    CONSTRAINT pk_checagem PRIMARY KEY (id),
    CONSTRAINT fk_checagem_checklist FOREIGN KEY (checklist_padrao_id) REFERENCES checklist_padrao (id),
    CONSTRAINT fk_checagem_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
    CONSTRAINT ck_checagem_status CHECK (status IN ('em_andamento', 'finalizada', 'cancelada')),
    CONSTRAINT ck_checagem_finalizada_em CHECK (
        (status = 'em_andamento' AND finalizada_em IS NULL) OR
        (status <> 'em_andamento' AND finalizada_em IS NOT NULL)
    )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX ix_checagem_usuario ON checagem (usuario_id, iniciada_em);
CREATE INDEX ix_checagem_status ON checagem (status, iniciada_em);

CREATE TABLE item_checagem (
    id                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    checagem_id            INT UNSIGNED  NOT NULL,
    item_checklist_id      INT UNSIGNED  NOT NULL,
    status                 VARCHAR(20)   NOT NULL DEFAULT 'pendente',
    quantidade_esperada    INT UNSIGNED  NOT NULL COMMENT 'Cópia do checklist no momento da checagem',
    quantidade_encontrada  INT UNSIGNED  NULL,
    metodo_confirmacao     VARCHAR(10)   NULL,
    transcricao            VARCHAR(500)  NULL COMMENT 'Texto reconhecido por voz que gerou a marcação',
    registrado_em          DATETIME      NULL,
    registrado_por         INT UNSIGNED  NULL,
    CONSTRAINT pk_item_checagem PRIMARY KEY (id),
    CONSTRAINT uq_item_checagem UNIQUE (checagem_id, item_checklist_id),
    CONSTRAINT fk_item_checagem_checagem FOREIGN KEY (checagem_id) REFERENCES checagem (id),
    CONSTRAINT fk_item_checagem_item FOREIGN KEY (item_checklist_id) REFERENCES item_checklist (id),
    CONSTRAINT fk_item_checagem_usuario FOREIGN KEY (registrado_por) REFERENCES usuario (id),
    CONSTRAINT ck_item_checagem_status CHECK (status IN ('pendente', 'confirmado', 'pulado', 'divergente')),
    CONSTRAINT ck_item_checagem_metodo CHECK (metodo_confirmacao IS NULL OR metodo_confirmacao IN ('voz', 'toque')),
    CONSTRAINT ck_item_checagem_registro CHECK (
        (status = 'pendente' AND registrado_em IS NULL) OR
        (status <> 'pendente' AND registrado_em IS NOT NULL)
    )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Divergência: item faltante, excedente ou com outro problema (RF09).
-- Itens excedentes que não estão no checklist não têm item_checagem:
-- nesse caso informe instrumental_id (item cadastrado) ou descricao_item (texto livre).
CREATE TABLE divergencia (
    id                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    checagem_id            INT UNSIGNED  NOT NULL,
    item_checagem_id       INT UNSIGNED  NULL,
    instrumental_id        INT UNSIGNED  NULL,
    descricao_item         VARCHAR(120)  NULL,
    tipo                   VARCHAR(20)   NOT NULL,
    quantidade_esperada    INT UNSIGNED  NULL,
    quantidade_encontrada  INT UNSIGNED  NULL,
    observacao             VARCHAR(500)  NULL,
    gerada_automaticamente BOOLEAN       NOT NULL DEFAULT FALSE,
    registrada_em          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registrada_por         INT UNSIGNED  NULL,
    CONSTRAINT pk_divergencia PRIMARY KEY (id),
    CONSTRAINT uq_divergencia_item UNIQUE (item_checagem_id),
    CONSTRAINT fk_divergencia_checagem FOREIGN KEY (checagem_id) REFERENCES checagem (id),
    CONSTRAINT fk_divergencia_item FOREIGN KEY (item_checagem_id) REFERENCES item_checagem (id),
    CONSTRAINT fk_divergencia_instrumental FOREIGN KEY (instrumental_id) REFERENCES instrumental (id),
    CONSTRAINT fk_divergencia_usuario FOREIGN KEY (registrada_por) REFERENCES usuario (id),
    CONSTRAINT ck_divergencia_tipo CHECK (tipo IN ('faltante', 'excedente', 'outro')),
    CONSTRAINT ck_divergencia_alvo CHECK (
        item_checagem_id IS NOT NULL OR instrumental_id IS NOT NULL OR descricao_item IS NOT NULL
    )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Relatório gerado automaticamente ao finalizar a checagem (RF10, RN04).
-- "conteudo" guarda um retrato imutável da checagem (nomes, quantidades, divergências).
CREATE TABLE relatorio_conferencia (
    id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    checagem_id      INT UNSIGNED      NOT NULL,
    gerado_em        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duracao_segundos INT UNSIGNED      NOT NULL,
    total_itens      SMALLINT UNSIGNED NOT NULL,
    confirmados      SMALLINT UNSIGNED NOT NULL,
    pulados          SMALLINT UNSIGNED NOT NULL,
    divergentes      SMALLINT UNSIGNED NOT NULL,
    divergencias     SMALLINT UNSIGNED NOT NULL COMMENT 'Total de registros de divergência, incluindo excedentes',
    status           VARCHAR(20)       NOT NULL,
    conteudo         JSON              NOT NULL,
    CONSTRAINT pk_relatorio_conferencia PRIMARY KEY (id),
    CONSTRAINT uq_relatorio_checagem UNIQUE (checagem_id),
    CONSTRAINT fk_relatorio_checagem FOREIGN KEY (checagem_id) REFERENCES checagem (id),
    CONSTRAINT ck_relatorio_status CHECK (status IN ('ok', 'divergencia'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

DELIMITER //

-- ---------------------------------------------------------------------------
-- Checklist padrão já usado em checagem não pode ter itens alterados:
-- crie uma nova versão (preserva o histórico — RN03).
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_item_checklist_versao_bi
BEFORE INSERT ON item_checklist FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM checagem WHERE checklist_padrao_id = NEW.checklist_padrao_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Checklist padrão já utilizado em checagem: crie uma nova versão.';
    END IF;
END//

CREATE TRIGGER trg_item_checklist_versao_bu
BEFORE UPDATE ON item_checklist FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM checagem WHERE checklist_padrao_id = OLD.checklist_padrao_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Checklist padrão já utilizado em checagem: crie uma nova versão.';
    END IF;
END//

CREATE TRIGGER trg_item_checklist_versao_bd
BEFORE DELETE ON item_checklist FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM checagem WHERE checklist_padrao_id = OLD.checklist_padrao_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Checklist padrão já utilizado em checagem: crie uma nova versão.';
    END IF;
END//

-- ---------------------------------------------------------------------------
-- RF05: iniciar checagem só com checklist ativo; os itens são copiados como pendentes.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_checagem_bi
BEFORE INSERT ON checagem FOR EACH ROW
BEGIN
    IF NOT EXISTS (SELECT 1 FROM checklist_padrao WHERE id = NEW.checklist_padrao_id AND ativo) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'RF05: só é possível iniciar checagem de um checklist padrão ativo.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM item_checklist WHERE checklist_padrao_id = NEW.checklist_padrao_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'RF05: o checklist padrão não possui itens.';
    END IF;
    IF NEW.status <> 'em_andamento' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Uma checagem deve ser criada com status em_andamento.';
    END IF;
END//

CREATE TRIGGER trg_checagem_ai
AFTER INSERT ON checagem FOR EACH ROW
BEGIN
    INSERT INTO item_checagem (checagem_id, item_checklist_id, quantidade_esperada)
    SELECT NEW.id, ic.id, ic.quantidade_esperada
    FROM item_checklist ic
    WHERE ic.checklist_padrao_id = NEW.checklist_padrao_id;
END//

-- ---------------------------------------------------------------------------
-- RN01 (só finaliza com todos os itens tratados) e RN03 (finalizada é imutável).
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_checagem_bu
BEFORE UPDATE ON checagem FOR EACH ROW
BEGIN
    IF OLD.status <> 'em_andamento' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'RN03: checagem finalizada ou cancelada não pode ser editada ou reaberta.';
    END IF;

    IF NEW.checklist_padrao_id <> OLD.checklist_padrao_id
       OR NEW.usuario_id <> OLD.usuario_id
       OR NEW.iniciada_em <> OLD.iniciada_em THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Checklist, responsável e início da checagem não podem ser alterados.';
    END IF;

    IF NEW.status = 'finalizada' THEN
        IF EXISTS (SELECT 1 FROM item_checagem WHERE checagem_id = OLD.id AND status = 'pendente') THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'RN01: há itens pendentes; marque todos como confirmado, pulado ou divergente.';
        END IF;
    END IF;

    IF NEW.status <> 'em_andamento' AND NEW.finalizada_em IS NULL THEN
        SET NEW.finalizada_em = CURRENT_TIMESTAMP;
    END IF;
END//

CREATE TRIGGER trg_checagem_bd
BEFORE DELETE ON checagem FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'RN03: checagens não são excluídas; cancele a checagem em andamento.';
END//

-- RF10/RN04: ao finalizar, gera o relatório com todas as divergências.
CREATE TRIGGER trg_checagem_au
AFTER UPDATE ON checagem FOR EACH ROW
BEGIN
    IF NEW.status = 'finalizada' AND OLD.status = 'em_andamento' THEN
        INSERT INTO relatorio_conferencia (
            checagem_id, gerado_em, duracao_segundos, total_itens, confirmados, pulados,
            divergentes, divergencias, status, conteudo
        )
        SELECT
            NEW.id,
            NEW.finalizada_em,
            TIMESTAMPDIFF(SECOND, NEW.iniciada_em, NEW.finalizada_em),
            (SELECT COUNT(*) FROM item_checagem WHERE checagem_id = NEW.id),
            (SELECT COUNT(*) FROM item_checagem WHERE checagem_id = NEW.id AND status = 'confirmado'),
            (SELECT COUNT(*) FROM item_checagem WHERE checagem_id = NEW.id AND status = 'pulado'),
            (SELECT COUNT(*) FROM item_checagem WHERE checagem_id = NEW.id AND status = 'divergente'),
            (SELECT COUNT(*) FROM divergencia WHERE checagem_id = NEW.id),
            IF(
                EXISTS (SELECT 1 FROM item_checagem WHERE checagem_id = NEW.id AND status <> 'confirmado')
                OR EXISTS (SELECT 1 FROM divergencia WHERE checagem_id = NEW.id),
                'divergencia', 'ok'
            ),
            JSON_OBJECT(
                'checagemId', NEW.id,
                'procedimento', (
                    SELECT JSON_OBJECT('codigo', p.codigo, 'nome', p.nome, 'especialidade', p.especialidade)
                    FROM checklist_padrao cp JOIN procedimento p ON p.id = cp.procedimento_id
                    WHERE cp.id = NEW.checklist_padrao_id
                ),
                'checklistVersao', (SELECT versao FROM checklist_padrao WHERE id = NEW.checklist_padrao_id),
                'operador', (
                    SELECT JSON_OBJECT('id', u.id, 'nome', u.nome, 'perfil', pf.codigo)
                    FROM usuario u JOIN perfil pf ON pf.id = u.perfil_id
                    WHERE u.id = NEW.usuario_id
                ),
                'sala', NEW.sala,
                'iniciadaEm', DATE_FORMAT(NEW.iniciada_em, '%Y-%m-%dT%H:%i:%s'),
                'finalizadaEm', DATE_FORMAT(NEW.finalizada_em, '%Y-%m-%dT%H:%i:%s'),
                'itens', (
                    SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
                        'instrumental', i.nome,
                        'categoria', i.categoria,
                        'unidade', i.unidade,
                        'critico', i.critico IS TRUE,
                        'quantidadeEsperada', ich.quantidade_esperada,
                        'quantidadeEncontrada', ich.quantidade_encontrada,
                        'status', ich.status,
                        'metodo', ich.metodo_confirmacao,
                        'registradoEm', DATE_FORMAT(ich.registrado_em, '%Y-%m-%dT%H:%i:%s')
                    )), JSON_ARRAY())
                    FROM item_checagem ich
                    JOIN item_checklist ic ON ic.id = ich.item_checklist_id
                    JOIN instrumental i ON i.id = ic.instrumental_id
                    WHERE ich.checagem_id = NEW.id
                ),
                'divergencias', (
                    SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
                        'tipo', d.tipo,
                        'item', COALESCE(i_item.nome, i_livre.nome, d.descricao_item),
                        'quantidadeEsperada', d.quantidade_esperada,
                        'quantidadeEncontrada', d.quantidade_encontrada,
                        'observacao', d.observacao,
                        'automatica', d.gerada_automaticamente IS TRUE
                    )), JSON_ARRAY())
                    FROM divergencia d
                    LEFT JOIN item_checagem ich ON ich.id = d.item_checagem_id
                    LEFT JOIN item_checklist ic ON ic.id = ich.item_checklist_id
                    LEFT JOIN instrumental i_item ON i_item.id = ic.instrumental_id
                    LEFT JOIN instrumental i_livre ON i_livre.id = d.instrumental_id
                    WHERE d.checagem_id = NEW.id
                )
            );
    END IF;
END//

-- ---------------------------------------------------------------------------
-- Itens da checagem: imutáveis após finalizar (RN03); quantidade diferente da
-- esperada vira divergência automaticamente (RN04).
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_item_checagem_bi
BEFORE INSERT ON item_checagem FOR EACH ROW
BEGIN
    IF NEW.status <> 'pendente' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Itens da checagem são criados como pendentes.';
    END IF;
END//

CREATE TRIGGER trg_item_checagem_bu
BEFORE UPDATE ON item_checagem FOR EACH ROW
BEGIN
    IF (SELECT status FROM checagem WHERE id = OLD.checagem_id) <> 'em_andamento' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'RN03: checagem finalizada ou cancelada não pode ser alterada.';
    END IF;

    IF NEW.checagem_id <> OLD.checagem_id
       OR NEW.item_checklist_id <> OLD.item_checklist_id
       OR NEW.quantidade_esperada <> OLD.quantidade_esperada THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Item, checagem e quantidade esperada não podem ser alterados.';
    END IF;

    -- Confirmado sem quantidade = quantidade esperada.
    IF NEW.status = 'confirmado' AND NEW.quantidade_encontrada IS NULL THEN
        SET NEW.quantidade_encontrada = NEW.quantidade_esperada;
    END IF;

    -- Confirmado com quantidade diferente vira divergente (RN04).
    IF NEW.status = 'confirmado' AND NEW.quantidade_encontrada <> NEW.quantidade_esperada THEN
        SET NEW.status = 'divergente';
    END IF;

    -- Volta para pendente limpa o registro.
    IF NEW.status = 'pendente' THEN
        SET NEW.quantidade_encontrada = NULL,
            NEW.metodo_confirmacao = NULL,
            NEW.transcricao = NULL,
            NEW.registrado_em = NULL,
            NEW.registrado_por = NULL;
    ELSEIF NEW.registrado_em IS NULL OR NEW.status <> OLD.status THEN
        SET NEW.registrado_em = CURRENT_TIMESTAMP;
    END IF;
END//

CREATE TRIGGER trg_item_checagem_au
AFTER UPDATE ON item_checagem FOR EACH ROW
BEGIN
    -- Saiu de divergente: remove a divergência gerada automaticamente.
    IF OLD.status = 'divergente' AND NEW.status <> 'divergente' THEN
        DELETE FROM divergencia WHERE item_checagem_id = NEW.id AND gerada_automaticamente;
    END IF;

    -- Entrou (ou continua) em divergente: cria/atualiza a divergência (RN04).
    IF NEW.status = 'divergente' THEN
        INSERT INTO divergencia (
            checagem_id, item_checagem_id, tipo, quantidade_esperada, quantidade_encontrada,
            gerada_automaticamente, registrada_em, registrada_por
        ) VALUES (
            NEW.checagem_id, NEW.id,
            IF(COALESCE(NEW.quantidade_encontrada, 0) > NEW.quantidade_esperada, 'excedente', 'faltante'),
            NEW.quantidade_esperada, COALESCE(NEW.quantidade_encontrada, 0),
            TRUE, NEW.registrado_em, NEW.registrado_por
        )
        ON DUPLICATE KEY UPDATE
            tipo = IF(gerada_automaticamente, VALUES(tipo), tipo),
            quantidade_encontrada = VALUES(quantidade_encontrada);
    END IF;
END//

CREATE TRIGGER trg_item_checagem_bd
BEFORE DELETE ON item_checagem FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'RN03: itens de checagem não são excluídos.';
END//

-- ---------------------------------------------------------------------------
-- Divergências: só em checagem em andamento (RN03).
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_divergencia_bi
BEFORE INSERT ON divergencia FOR EACH ROW
BEGIN
    IF (SELECT status FROM checagem WHERE id = NEW.checagem_id) <> 'em_andamento' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'RN03: checagem finalizada ou cancelada não aceita novas divergências.';
    END IF;
    IF NEW.item_checagem_id IS NOT NULL
       AND (SELECT checagem_id FROM item_checagem WHERE id = NEW.item_checagem_id) <> NEW.checagem_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'O item informado não pertence a esta checagem.';
    END IF;
END//

CREATE TRIGGER trg_divergencia_bu
BEFORE UPDATE ON divergencia FOR EACH ROW
BEGIN
    IF (SELECT status FROM checagem WHERE id = OLD.checagem_id) <> 'em_andamento' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'RN03: divergências de checagem finalizada não podem ser alteradas.';
    END IF;
END//

CREATE TRIGGER trg_divergencia_bd
BEFORE DELETE ON divergencia FOR EACH ROW
BEGIN
    IF (SELECT status FROM checagem WHERE id = OLD.checagem_id) <> 'em_andamento' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'RN03: divergências de checagem finalizada não podem ser excluídas.';
    END IF;
END//

-- O relatório é gerado pelo banco e não pode ser alterado nem excluído.
CREATE TRIGGER trg_relatorio_bu
BEFORE UPDATE ON relatorio_conferencia FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RN03: relatórios de conferência são imutáveis.';
END//

CREATE TRIGGER trg_relatorio_bd
BEFORE DELETE ON relatorio_conferencia FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RN03: relatórios de conferência são imutáveis.';
END//

DELIMITER ;
