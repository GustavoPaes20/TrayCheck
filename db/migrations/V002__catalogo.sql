-- =============================================================================
-- TrayCheck — V002: catálogo (procedimentos, instrumentais e kits)
-- Requisitos: RF02 (instrumentais e kits), RF03 (procedimentos), RN02, RNF05
-- =============================================================================

CREATE TABLE procedimento (
    id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    codigo              VARCHAR(40)   NOT NULL COMMENT 'Identificador legível usado na URL (ex.: joelho)',
    nome                VARCHAR(120)  NOT NULL,
    especialidade       VARCHAR(80)   NOT NULL,
    descricao           VARCHAR(500)  NULL,
    duracao_estimada    VARCHAR(20)   NULL COMMENT 'Ex.: 2–3h',
    ativo               BOOLEAN       NOT NULL DEFAULT TRUE,
    criado_por          INT UNSIGNED  NOT NULL,
    criado_em           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_procedimento PRIMARY KEY (id),
    CONSTRAINT uq_procedimento_codigo UNIQUE (codigo),
    CONSTRAINT fk_procedimento_criado_por FOREIGN KEY (criado_por) REFERENCES usuario (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE instrumental (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    codigo          VARCHAR(40)   NOT NULL,
    nome            VARCHAR(120)  NOT NULL,
    categoria       VARCHAR(20)   NOT NULL,
    unidade         VARCHAR(20)   NOT NULL DEFAULT 'unid',
    critico         BOOLEAN       NOT NULL DEFAULT FALSE COMMENT 'Item cuja falta impede a cirurgia',
    ativo           BOOLEAN       NOT NULL DEFAULT TRUE,
    criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_instrumental PRIMARY KEY (id),
    CONSTRAINT uq_instrumental_codigo UNIQUE (codigo),
    CONSTRAINT uq_instrumental_nome UNIQUE (nome),
    CONSTRAINT ck_instrumental_categoria
        CHECK (categoria IN ('EPI', 'Instrumental', 'Descartável', 'Anestesia', 'Implante'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE kit (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    codigo          VARCHAR(40)   NOT NULL,
    nome            VARCHAR(120)  NOT NULL,
    descricao       VARCHAR(500)  NULL,
    ativo           BOOLEAN       NOT NULL DEFAULT TRUE,
    criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_kit PRIMARY KEY (id),
    CONSTRAINT uq_kit_codigo UNIQUE (codigo)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Associação "Kit compõe 1..* Instrumental" do diagrama de classes, com quantidade.
CREATE TABLE kit_instrumental (
    kit_id          INT UNSIGNED NOT NULL,
    instrumental_id INT UNSIGNED NOT NULL,
    quantidade      INT UNSIGNED NOT NULL DEFAULT 1,
    CONSTRAINT pk_kit_instrumental PRIMARY KEY (kit_id, instrumental_id),
    CONSTRAINT fk_kit_instrumental_kit FOREIGN KEY (kit_id) REFERENCES kit (id) ON DELETE CASCADE,
    CONSTRAINT fk_kit_instrumental_instrumental FOREIGN KEY (instrumental_id) REFERENCES instrumental (id),
    CONSTRAINT ck_kit_instrumental_quantidade CHECK (quantidade > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- RN02: somente administradores cadastram procedimentos.
-- A API deve validar isso; o gatilho é uma segunda barreira no banco.
DELIMITER //
CREATE TRIGGER trg_procedimento_rn02_bi
BEFORE INSERT ON procedimento FOR EACH ROW
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM usuario u JOIN perfil p ON p.id = u.perfil_id
        WHERE u.id = NEW.criado_por AND p.codigo = 'admin' AND u.ativo
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'RN02: somente administradores ativos podem cadastrar procedimentos.';
    END IF;
END//
DELIMITER ;
