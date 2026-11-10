-- =============================================================================
-- TrayCheck — V005: estoque
-- Não está no diagrama de classes v2.1, mas o frontend e o contrato da API
-- (/stock e /stock/{id}/adjustments) dependem dele. Pendente de RFC para o ERS.
-- =============================================================================

CREATE TABLE estoque_item (
    id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    instrumental_id       INT UNSIGNED NOT NULL,
    quantidade_disponivel INT UNSIGNED NOT NULL DEFAULT 0,
    quantidade_minima     INT UNSIGNED NOT NULL DEFAULT 0,
    -- Mesma regra do frontend (StockManager.tsx): < 50% do mínimo = crítico; < mínimo = baixo.
    situacao              VARCHAR(10)
        GENERATED ALWAYS AS (
            CASE
                WHEN quantidade_disponivel * 2 < quantidade_minima THEN 'critical'
                WHEN quantidade_disponivel < quantidade_minima THEN 'low'
                ELSE 'ok'
            END
        ) STORED,
    atualizado_em         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    atualizado_por        INT UNSIGNED NULL,
    CONSTRAINT pk_estoque_item PRIMARY KEY (id),
    CONSTRAINT uq_estoque_item_instrumental UNIQUE (instrumental_id),
    CONSTRAINT fk_estoque_item_instrumental FOREIGN KEY (instrumental_id) REFERENCES instrumental (id),
    CONSTRAINT fk_estoque_item_usuario FOREIGN KEY (atualizado_por) REFERENCES usuario (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX ix_estoque_item_situacao ON estoque_item (situacao);

-- Toda mudança de quantidade passa por uma movimentação (rastreabilidade).
CREATE TABLE estoque_movimentacao (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    estoque_item_id  INT UNSIGNED NOT NULL,
    delta            INT          NOT NULL,
    motivo           VARCHAR(200) NULL,
    usuario_id       INT UNSIGNED NOT NULL,
    criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_estoque_movimentacao PRIMARY KEY (id),
    CONSTRAINT fk_estoque_mov_item FOREIGN KEY (estoque_item_id) REFERENCES estoque_item (id),
    CONSTRAINT fk_estoque_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
    CONSTRAINT ck_estoque_mov_delta CHECK (delta <> 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX ix_estoque_mov_item ON estoque_movimentacao (estoque_item_id, criado_em);

DELIMITER //
-- Aplica a movimentação no saldo. Saldo negativo gera erro e desfaz a operação.
CREATE TRIGGER trg_estoque_movimentacao_bi
BEFORE INSERT ON estoque_movimentacao FOR EACH ROW
BEGIN
    IF (SELECT CAST(quantidade_disponivel AS SIGNED) FROM estoque_item WHERE id = NEW.estoque_item_id) + NEW.delta < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Estoque insuficiente para esta movimentação.';
    END IF;
END//

CREATE TRIGGER trg_estoque_movimentacao_ai
AFTER INSERT ON estoque_movimentacao FOR EACH ROW
BEGIN
    UPDATE estoque_item
       SET quantidade_disponivel = quantidade_disponivel + NEW.delta,
           atualizado_por = NEW.usuario_id
     WHERE id = NEW.estoque_item_id;
END//

CREATE TRIGGER trg_estoque_movimentacao_bu
BEFORE UPDATE ON estoque_movimentacao FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Movimentações de estoque são imutáveis; registre uma nova movimentação.';
END//

CREATE TRIGGER trg_estoque_movimentacao_bd
BEFORE DELETE ON estoque_movimentacao FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Movimentações de estoque são imutáveis; registre uma nova movimentação.';
END//
DELIMITER ;
