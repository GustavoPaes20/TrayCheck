-- =============================================================================
-- TrayCheck — V003: checklist padrão por procedimento
-- Requisitos: RF04 (vincular checklist padrão a cada procedimento), RN02, RNF05
-- =============================================================================

CREATE TABLE checklist_padrao (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    procedimento_id INT UNSIGNED  NOT NULL,
    versao          VARCHAR(20)   NOT NULL,
    ativo           BOOLEAN       NOT NULL DEFAULT TRUE,
    criado_por      INT UNSIGNED  NOT NULL,
    criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Garante no máximo UM checklist ativo por procedimento
    -- (MySQL não tem índice único parcial; a coluna gerada vale NULL quando inativo).
    procedimento_ativo_id INT UNSIGNED
        GENERATED ALWAYS AS (IF(ativo, procedimento_id, NULL)) STORED,
    CONSTRAINT pk_checklist_padrao PRIMARY KEY (id),
    CONSTRAINT uq_checklist_padrao_versao UNIQUE (procedimento_id, versao),
    CONSTRAINT uq_checklist_padrao_um_ativo UNIQUE (procedimento_ativo_id),
    CONSTRAINT fk_checklist_padrao_procedimento FOREIGN KEY (procedimento_id) REFERENCES procedimento (id),
    CONSTRAINT fk_checklist_padrao_criado_por FOREIGN KEY (criado_por) REFERENCES usuario (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Versões do checklist de cada procedimento. Nova versão = nova linha; versões antigas ficam para o histórico.';

CREATE TABLE item_checklist (
    id                   INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    checklist_padrao_id  INT UNSIGNED      NOT NULL,
    instrumental_id      INT UNSIGNED      NOT NULL,
    quantidade_esperada  INT UNSIGNED      NOT NULL,
    ordem                SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Ordem de leitura na checagem por voz',
    CONSTRAINT pk_item_checklist PRIMARY KEY (id),
    CONSTRAINT uq_item_checklist_instrumental UNIQUE (checklist_padrao_id, instrumental_id),
    CONSTRAINT fk_item_checklist_checklist FOREIGN KEY (checklist_padrao_id) REFERENCES checklist_padrao (id) ON DELETE CASCADE,
    CONSTRAINT fk_item_checklist_instrumental FOREIGN KEY (instrumental_id) REFERENCES instrumental (id),
    CONSTRAINT ck_item_checklist_quantidade CHECK (quantidade_esperada > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- RN02: somente administradores vinculam checklists padrão.
DELIMITER //
CREATE TRIGGER trg_checklist_padrao_rn02_bi
BEFORE INSERT ON checklist_padrao FOR EACH ROW
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM usuario u JOIN perfil p ON p.id = u.perfil_id
        WHERE u.id = NEW.criado_por AND p.codigo = 'admin' AND u.ativo
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'RN02: somente administradores ativos podem vincular checklists padrão.';
    END IF;
END//
DELIMITER ;
