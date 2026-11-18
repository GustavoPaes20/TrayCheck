-- =============================================================================
-- TrayCheck — V007: preferências de notificação do usuário
-- Origem: tela de perfil do frontend e contrato da API (/profile/notifications).
-- Não está no diagrama de classes v2.1 (pendente de RFC para a ERS).
-- Banco: MySQL 8.0+ (InnoDB, utf8mb4)
--
-- Uma linha por usuário. Quem nunca salvou preferências não tem linha: a API devolve os
-- padrões abaixo (os mesmos DEFAULT desta tabela), então não é preciso criar linhas em lote.
-- =============================================================================

CREATE TABLE preferencia_notificacao (
    usuario_id         INT UNSIGNED NOT NULL,
    alerta_estoque     BOOLEAN      NOT NULL DEFAULT TRUE  COMMENT 'Avisar quando um item ficar abaixo do mínimo',
    lembrete_cirurgia  BOOLEAN      NOT NULL DEFAULT TRUE  COMMENT 'Lembrar das cirurgias do dia',
    checklist_por_voz  BOOLEAN      NOT NULL DEFAULT TRUE  COMMENT 'Usar a assistência de voz na checagem',
    relatorio_semanal  BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'Receber o resumo semanal',
    atualizado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_preferencia_notificacao PRIMARY KEY (usuario_id),
    CONSTRAINT fk_preferencia_notificacao_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Preferências de notificação por usuário (perfil). Sem linha = valores padrão.';
