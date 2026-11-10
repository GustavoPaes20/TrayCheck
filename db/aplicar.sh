#!/usr/bin/env bash
# Aplica as migrações (e, opcionalmente, os dados de demonstração) em um banco MySQL 8.
#
# Uso:
#   DB_NAME=traycheck ./db/aplicar.sh            # só migrações
#   DB_NAME=traycheck ./db/aplicar.sh --seed     # migrações + dados de demonstração
#   DB_NAME=traycheck ./db/aplicar.sh --recriar  # apaga e recria o banco (CUIDADO)
#
# Conexão via variáveis padrão do cliente mysql: MYSQL_HOST, MYSQL_TCP_PORT, MYSQL_PWD,
# e DB_USER (padrão: root). As versões aplicadas ficam registradas em schema_versao.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="${DB_NAME:-traycheck}"
DB_USER="${DB_USER:-root}"
SEED=false
RECRIAR=false
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    --recriar) RECRIAR=true ;;
    *) echo "Opção desconhecida: $arg" >&2; exit 2 ;;
  esac
done

mysql_cmd() { mysql --user="$DB_USER" --default-character-set=utf8mb4 "$@"; }

if $RECRIAR; then
  mysql_cmd -e "DROP DATABASE IF EXISTS \`$DB_NAME\`;"
fi
mysql_cmd -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql_cmd "$DB_NAME" -e "
  CREATE TABLE IF NOT EXISTS schema_versao (
    versao      VARCHAR(10)  NOT NULL PRIMARY KEY,
    arquivo     VARCHAR(200) NOT NULL,
    aplicada_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  );"

aplicar_pasta() {
  local pasta="$1" prefixo="$2"
  for arquivo in "$pasta"/"$prefixo"[0-9][0-9][0-9]__*.sql; do
    [ -e "$arquivo" ] || continue
    local nome versao
    nome="$(basename "$arquivo")"
    versao="${nome%%__*}"
    if [ "$(mysql_cmd -N "$DB_NAME" -e "SELECT COUNT(*) FROM schema_versao WHERE versao='$versao';")" = "1" ]; then
      echo "  = $nome (já aplicada)"
      continue
    fi
    echo "  + $nome"
    mysql_cmd "$DB_NAME" < "$arquivo"
    mysql_cmd "$DB_NAME" -e "INSERT INTO schema_versao (versao, arquivo) VALUES ('$versao', '$nome');"
  done
}

echo "Banco: $DB_NAME"
echo "Migrações:"
aplicar_pasta "$DIR/migrations" V
if $SEED; then
  echo "Dados de demonstração:"
  aplicar_pasta "$DIR/seeds" S
fi
echo "Concluído."
