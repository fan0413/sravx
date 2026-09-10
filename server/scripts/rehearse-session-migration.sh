#!/usr/bin/env bash
# Draft rehearsal only. Requires explicit owner approval before execution.
set -euo pipefail

backup_path=${1:?Usage: rehearse-session-migration.sh <controlled-logical-backup.sql> <migration.sql> <source-schema>}
migration_path=${2:?Usage: rehearse-session-migration.sh <controlled-logical-backup.sql> <migration.sql> <source-schema>}
source_schema=${3:?Usage: rehearse-session-migration.sh <controlled-logical-backup.sql> <migration.sql> <source-schema>}
expected_table=${4:-user_sessions}
[[ -f "$backup_path" && -f "$migration_path" ]] || { echo 'Controlled backup or migration file not found.' >&2; exit 2; }
[[ "$expected_table" =~ ^[A-Za-z0-9_]+$ ]] || { echo 'Expected table name is invalid.' >&2; exit 2; }

umask 077
container_name="sravx-session-rehearsal-$$"
database_name="sravx_rehearsal"
database_password=$(openssl rand -base64 36 | tr -d '\n')
business_dump=$(mktemp)
cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; rm -f "$business_dump"; unset database_password; }
trap cleanup EXIT

# Full physical exports include the MySQL system schema. Restore only the named
# business schema, while removing its CREATE DATABASE/USE statements so all
# objects land in the isolated rehearsal database.
awk -v schema="$source_schema" '
  $0 ~ "^-- Current Database: `" schema "`" { copying=1 }
  copying && $0 ~ "^-- Dumping events for database" { exit }
  copying && $0 ~ "^CREATE DATABASE.*`" schema "`" { next }
  copying && $0 ~ "^USE `" schema "`;" { next }
  copying { print }
' "$backup_path" > "$business_dump"
[[ -s "$business_dump" ]] || { echo 'Business schema section was not found in the controlled backup.' >&2; exit 3; }

docker run --detach --rm --name "$container_name" --network none --memory 1g \
  -e MYSQL_ROOT_PASSWORD="$database_password" -e MYSQL_DATABASE="$database_name" mysql:8.0 >/dev/null

for _ in $(seq 1 60); do
  if docker logs "$container_name" 2>&1 | grep -q 'MySQL init process done. Ready for start up.' \
    && docker exec -e MYSQL_PWD="$database_password" "$container_name" mysqladmin ping -uroot --silent >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec -e MYSQL_PWD="$database_password" "$container_name" mysqladmin ping -uroot --silent >/dev/null
echo 'Isolated MySQL container is ready.'
{
  printf 'SET FOREIGN_KEY_CHECKS=0;\n'
  cat "$business_dump"
  printf '\nSET FOREIGN_KEY_CHECKS=1;\n'
} | docker exec -e MYSQL_PWD="$database_password" -i "$container_name" mysql --default-character-set=utf8mb4 -uroot "$database_name"
echo 'Business schema restore completed.'
docker exec -e MYSQL_PWD="$database_password" -i "$container_name" mysql --default-character-set=utf8mb4 -uroot "$database_name" < "$migration_path"
docker exec -e MYSQL_PWD="$database_password" "$container_name" mysql -N -uroot "$database_name" -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${expected_table}';" | grep -qx '1'
echo "Isolated migration rehearsal passed for ${expected_table}; container cleanup follows."
