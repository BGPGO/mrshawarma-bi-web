FROM nginx:alpine

# Node 20 + cron + ferramentas mínimas pro ETL diário
RUN apk add --no-cache nodejs npm dcron tini ca-certificates \
 && mkdir -p /app /var/log

WORKDIR /app

# Deps Node primeiro (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Scripts ETL + adapters
COPY adapters/ ./adapters/
COPY fetch-f360.cjs fetch-data.cjs fetch-saldos.cjs fetch-pedidos.cjs generate-report.cjs ./
COPY build-data.cjs build-data-extras.cjs build-jsx.cjs ./
COPY bi.config.js ./
COPY components.jsx pages-1.jsx pages-2.jsx pages-3.jsx pages-4.jsx upsell-pages.jsx ./

# Site estático servido pelo nginx
COPY index.html styles.css /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Seed inicial dos artefatos buildados (sobrescritos pelo cron)
COPY data.js app.bundle.js /usr/share/nginx/html/
COPY report*.json /usr/share/nginx/html/

# Cron + entrypoint
COPY crontab /etc/crontabs/root
COPY refresh.sh entrypoint.sh sync-supabase.sh /app/
RUN chmod +x /app/refresh.sh /app/entrypoint.sh /app/sync-supabase.sh

EXPOSE 80
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/entrypoint.sh"]
