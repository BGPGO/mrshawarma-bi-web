#!/bin/sh
# refresh.sh — pipeline de atualização diária dentro do container.
#
# Roda fetch-data → fetch-saldos → build-data → build-jsx e copia
# data.js + app.bundle.js pro document root do nginx.
#
# Lê credenciais F360 de env vars (F360_API_TOKEN) ou de /app/.env.

set -e

# Carrega env exportado pelo entrypoint (cron não herda env do PID 1).
if [ -f /etc/cron-env ]; then
  set -a
  . /etc/cron-env
  set +a
fi

cd /app
LOG=/var/log/refresh.log
TS() { date '+%Y-%m-%d %H:%M:%S'; }

# Tee pra stdout (visível em Coolify logs) E pra arquivo (debug histórico).
exec > >(tee -a "$LOG") 2>&1

echo ""
echo "===== $(TS) refresh start ($1) ====="
if [ -n "$F360_API_TOKEN" ]; then echo "[$(TS)] F360_API_TOKEN=SET"; else echo "[$(TS)] F360_API_TOKEN=MISSING"; fi

# --boot com data/ persistente: se _summary.json é fresco, pula fetch mas
# AINDA rebuilda+copia (Dockerfile re-COPYa seed data.js antigo em todo rebuild,
# então nginx html precisa ser reescrito mesmo quando data/ veio do volume).
SKIP_FETCH=0
if [ "$1" = "--boot" ] && [ -f data/_summary.json ]; then
  age=$(( $(date +%s) - $(stat -c %Y data/_summary.json 2>/dev/null || echo 0) ))
  if [ "$age" -lt 86400 ]; then
    echo "[$(TS)] boot: dados frescos ($age s) — pulando fetch (rebuild+copy só)"
    SKIP_FETCH=1
  fi
fi

if [ "$SKIP_FETCH" = "0" ]; then
  # Cache stale: páginas Omie deslocam quando novos movs entram, então cachear
  # por número de página vaza dados antigos. Limpa antes de cada fetch.
  echo "[$(TS)] limpa cache pre-fetch"
  rm -rf data/_cache

  echo "[$(TS)] fetch-f360.cjs"
  node fetch-f360.cjs || echo "[$(TS)] fetch-f360 falhou (continua)"
fi

if [ -f data/movimentos.json ]; then
  echo "[$(TS)] build-data.cjs"
  node build-data.cjs
  echo "[$(TS)] build-jsx.cjs"
  node build-jsx.cjs
  cp -f data.js app.bundle.js /usr/share/nginx/html/
  cp -f report*.json /usr/share/nginx/html/ 2>/dev/null || true
  echo "[$(TS)] refresh OK — data.js atualizado em $(stat -c %y /usr/share/nginx/html/data.js)"

  # Sync pro Supabase Storage (se configurado)
  if [ -f /app/sync-supabase.sh ]; then
    /app/sync-supabase.sh || echo "[$(TS)] sync-supabase falhou (continua)"
  fi
else
  echo "[$(TS)] data/movimentos.json ausente — pulando build (servindo dados antigos)"
fi

echo "===== $(TS) refresh end ====="
