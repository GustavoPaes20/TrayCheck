-- Utilitários de teste do banco. Criados num banco de teste descartável.
DROP TABLE IF EXISTS teste_resultado;
CREATE TABLE teste_resultado (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    arquivo   VARCHAR(80)  NOT NULL,
    nome      VARCHAR(200) NOT NULL,
    passou    BOOLEAN      NOT NULL,
    detalhe   VARCHAR(500) NULL
);

DROP PROCEDURE IF EXISTS assert_igual;
DROP PROCEDURE IF EXISTS assert_erro;
DROP PROCEDURE IF EXISTS assert_ok;

DELIMITER //
-- Compara dois valores (como texto; NULL = NULL é considerado igual).
CREATE PROCEDURE assert_igual(IN p_nome VARCHAR(200), IN p_obtido TEXT, IN p_esperado TEXT)
BEGIN
    INSERT INTO teste_resultado (arquivo, nome, passou, detalhe)
    VALUES (@arquivo, p_nome, p_obtido <=> p_esperado,
            CONCAT('esperado=', COALESCE(p_esperado, 'NULL'), ' obtido=', COALESCE(p_obtido, 'NULL')));
END//

-- Executa um comando e exige que ele FALHE com mensagem contendo p_trecho.
CREATE PROCEDURE assert_erro(IN p_nome VARCHAR(200), IN p_sql TEXT, IN p_trecho VARCHAR(200))
BEGIN
    DECLARE v_msg TEXT DEFAULT NULL;
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
        GET DIAGNOSTICS CONDITION 1 v_msg = MESSAGE_TEXT;
    SET @sql_teste = p_sql;
    PREPARE stmt FROM @sql_teste;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    INSERT INTO teste_resultado (arquivo, nome, passou, detalhe)
    VALUES (@arquivo, p_nome, v_msg IS NOT NULL AND v_msg LIKE CONCAT('%', p_trecho, '%'),
            COALESCE(CONCAT('erro: ', v_msg), 'o comando NÃO falhou'));
END//

-- Executa um comando e exige que ele FUNCIONE.
CREATE PROCEDURE assert_ok(IN p_nome VARCHAR(200), IN p_sql TEXT)
BEGIN
    DECLARE v_msg TEXT DEFAULT NULL;
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
        GET DIAGNOSTICS CONDITION 1 v_msg = MESSAGE_TEXT;
    SET @sql_teste = p_sql;
    PREPARE stmt FROM @sql_teste;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    INSERT INTO teste_resultado (arquivo, nome, passou, detalhe)
    VALUES (@arquivo, p_nome, v_msg IS NULL, COALESCE(CONCAT('erro inesperado: ', v_msg), 'ok'));
END//
DELIMITER ;
