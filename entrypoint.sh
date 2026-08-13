#!/bin/sh
# entrypoint.sh — boot do container.
#
# 1. Roda refresh.sh uma vez (atualiza dados no boot)
# 2. Inicia cron em background (refresh diário 03:00 UTC = 00:00 BRT)
# 3. Inicia nginx em foreground (PID 1)

set -e

mkdir -p /var/log
touch /var/log/refresh.log

# dcron NÃO herda env vars do PID 1 — exporta credenciais Omie pra arquivo
# que refresh.sh lê. Sem isso, fetch-data dispara mas adapter falha por
# OMIE_APP_KEY/SECRET undefined (descoberto 26/05/2026: data parou em 23/05).
# F360_ estava FALTANDO neste grep, e este BI e F360, nao Omie: o refresh do boot
# funcionava (herda o env do PID 1) e mascarava o defeito, mas todo refresh por
# cron rodava com F360_API_TOKEN vazio -> fetch-f360 sai 1 -> refresh.sh segue no
# `|| echo falhou` e rebuilda com o dado velho, com log de aparencia saudavel.
env | grep -E '^(OMIE_|F360_|BI_|COOLIFY_|SUPABASE_|ANTHROPIC_)' > /etc/cron-env || true
chmod 600 /etc/cron-env

# Boot refresh em background — não atrasa o nginx ficar pronto.
# --boot pula se dados estão frescos (<24h) — evita refetch a cada restart.
( /app/refresh.sh --boot & ) &

# Cron daemon (dcron) em foreground modo -f -d 8 (debug) seria barulhento;
# usa modo padrão em background.
crond -b -L /var/log/cron.log

# Nginx em foreground (mantém PID 1, recebe sinais do tini)
exec nginx -g 'daemon off;'
