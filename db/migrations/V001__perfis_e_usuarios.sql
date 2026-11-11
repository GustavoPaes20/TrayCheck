-- =============================================================================
-- TrayCheck — V001: perfis e usuários
-- Requisitos: RF01 (autenticação e perfis), RN05, RNF01 (LGPD)
-- Banco: MySQL 8.0+ (InnoDB, utf8mb4)
-- =============================================================================

CREATE TABLE perfil (
    id          TINYINT UNSIGNED NOT NULL,
    codigo      VARCHAR(20)      NOT NULL,
    nome        VARCHAR(60)      NOT NULL,
    CONSTRAINT pk_perfil PRIMARY KEY (id),
    CONSTRAINT uq_perfil_codigo UNIQUE (codigo),
    CONSTRAINT ck_perfil_codigo CHECK (codigo IN ('admin', 'enfermeiro', 'circulante'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Perfis de acesso (RF01). admin=Administrador, enfermeiro=Enf. Instrumentador(a), circulante=Circulante';

-- Perfis são dados estruturais (não de demonstração): o sistema não funciona sem eles.
INSERT INTO perfil (id, codigo, nome) VALUES
    (1, 'admin',      'Administrador'),
    (2, 'enfermeiro', 'Enfermeiro(a) Instrumentador(a)'),
    (3, 'circulante', 'Circulante');

CREATE TABLE usuario (
    id                      INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    perfil_id               TINYINT UNSIGNED NOT NULL,
    nome                    VARCHAR(120)     NOT NULL,
    email                   VARCHAR(160)     NOT NULL,
    -- Nunca armazenar senha em texto puro (RNF01). Esperado: hash bcrypt/argon2.
    senha_hash              VARCHAR(255)     NOT NULL,
    telefone                VARCHAR(30)      NULL,
    registro_profissional   VARCHAR(40)      NULL COMMENT 'Ex.: COREN',
    turno                   VARCHAR(60)      NULL,
    ativo                   BOOLEAN          NOT NULL DEFAULT TRUE,
    ultimo_acesso_em        DATETIME         NULL,
    criado_em               DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em           DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_usuario PRIMARY KEY (id),
    CONSTRAINT uq_usuario_email UNIQUE (email),
    CONSTRAINT fk_usuario_perfil FOREIGN KEY (perfil_id) REFERENCES perfil (id),
    CONSTRAINT ck_usuario_email CHECK (email LIKE '%_@_%._%'),
    CONSTRAINT ck_usuario_senha_hash CHECK (CHAR_LENGTH(senha_hash) >= 50)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Usuários do sistema. Login por e-mail (alinhado ao frontend e ao contrato da API).';

CREATE INDEX ix_usuario_perfil ON usuario (perfil_id);
