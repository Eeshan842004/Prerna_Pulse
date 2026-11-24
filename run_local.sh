#!/usr/bin/env bash
# Run Prerana Pulse without Docker, against a local PostgreSQL 14+ server.
#   PGHOST/PGUSER as usual for psql;  ./run_local.sh   then open http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"
DB=${PP_DB:-prerana}
OWNER_DSN=${PP_OWNER_DSN:-"postgresql://${PGUSER:-postgres}@/${DB}?host=${PGHOST:-/tmp}"}
APP_DSN=${PP_APP_DSN:-"postgresql://pp_app:pp_app@/${DB}?host=${PGHOST:-/tmp}"}
export PP_OWNER_DSN="$OWNER_DSN" PP_APP_DSN="$APP_DSN"

python3 -m pip install -q -r backend/requirements.txt
psql "${OWNER_DSN/\/$DB/\/postgres}" -tc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 \
  || psql "${OWNER_DSN/\/$DB/\/postgres}" -c "CREATE DATABASE $DB"
psql "$OWNER_DSN" -qc "ALTER DATABASE $DB SET timezone='UTC'"
(cd backend && python3 -m app.manage init)

trap 'kill 0' EXIT
(cd backend && python3 -m app.serve --port 8000) &
sleep 2
# One gateway per place on the school map. gw-blockb is deliberately not started: the principal's
# Devices tab then shows "No gateway heard since 8:35 am" for it, like a real silent gateway.
i=0
for g in gw-7b gw-stairs gw-library gw-lab gw-playground gw-office; do
  python3 gateway/gateway.py --id $g --token demo-token-$g --port $((8081 + i)) --heartbeat 10 &
  i=$((i + 1))
done
echo "Prerana Pulse: http://localhost:8000   (Ctrl+C stops everything)"
wait
