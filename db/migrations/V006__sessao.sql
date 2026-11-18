-- =============================================================================
-- TrayCheck — V006: sessões de login
-- Requisitos: RF02 (autenticação e controle de acesso), RNF01 (LGPD)
-- Banco: MySQL 8.0+ (InnoDB, utf8mb4)
--
-- Critérios do RF02 atendidos por esta tabela:
--   - a sessão expira após 8 horas sem atividade (ultimo_uso_em é renovado a cada uso);
--   - o logout encerra a sessão de verdade (revogada_em);
--   - ao inativar um usuário, suas sessões deixam de valer na hora (a API só aceita
--     sessão de usuário ativo) e podem ser revogadas em lote por usuario_id.
--
-- LGPD: guarda-se apenas o hash SHA-256 do token. O token em si nunca é gravado,
-- então um vazamento do banco não permite usar sessões abertas.
-- =============================================================================

CREATE TABLE sessao (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id     INT UNSIGNED    NOT NULL,
    token_hash     CHAR(64)        NOT NULL COMMENT 'SHA-256 (hex) do token da sessão',
    criada_em      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso_em  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Base da expiração por inatividade',
    revogada_em    DATETIME        NULL     COMMENT 'Preenchido no logout ou quando a sessão é invalidada',
    CONSTRAINT pk_sessao PRIMARY KEY (id),
    CONSTRAINT uq_sessao_token UNIQUE (token_hash),
    CONSTRAINT fk_sessao_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Sessões de login (RF02). Token aleatório; só o hash é armazenado.';

CREATE INDEX ix_sessao_usuario ON sessao (usuario_id, revogada_em);
