#!/usr/bin/env bash
# Testes do banco: recria um banco descartável, aplica migrações + seed e
# executa tests/db/T*.sql. Sai com código 1 se algum teste falhar.
#
# Uso: ./tests/db/executar.sh   (conexão via MYSQL_HOST, MYSQL_TCP_PORT, MYSQL_PWD, DB_USER)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export DB_NAME="${DB_NAME:-traycheck_teste}"
DB_USER="${DB_USER:-root}"
mysql_cmd() { mysql --user="$DB_USER" --default-character-set=utf8mb4 "$@"; }

"$RAIZ/db/aplicar.sh" --recriar --seed > /dev/null
mysql_cmd "$DB_NAME" < "$RAIZ/tests/db/_assert.sql"
for teste in "$RAIZ"/tests/db/T*.sql; do
  mysql_cmd "$DB_NAME" < "$teste"
done

mysql_cmd -t "$DB_NAME" -e "
  SELECT arquivo, IF(passou, 'ok', 'FALHOU') AS resultado, nome,
         IF(passou, '', detalhe) AS detalhe
  FROM teste_resultado ORDER BY id;"

falhas="$(mysql_cmd -N "$DB_NAME" -e "SELECT COUNT(*) FROM teste_resultado WHERE NOT passou;")"
total="$(mysql_cmd -N "$DB_NAME" -e "SELECT COUNT(*) FROM teste_resultado;")"
echo "$((total - falhas))/$total testes passaram."
[ "$falhas" = "0" ]
