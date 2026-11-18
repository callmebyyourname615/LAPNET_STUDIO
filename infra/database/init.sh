#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 \
  --set runtime_password="$RUNTIME_PASSWORD" --set migrator_password="$MIGRATOR_PASSWORD" \
  --file /docker-entrypoint-initdb.d/bootstrap.sql.template
