# La Belle Scens — Design System (site estático, nginx)
# Padrão Hovio: nginx:alpine + Dockerfile (igual hub hovio.com.br).
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html hero.html tema.css tema.js /usr/share/nginx/html/
# Painel demo (overview/cenário + 9 módulos) — labellescens.hovio.com.br/painel/
COPY painel/ /usr/share/nginx/html/painel/
# Jornada — 3 direções visuais (a/b/c + índice) — labellescens.hovio.com.br/fluxo/
COPY fluxo/ /usr/share/nginx/html/fluxo/
# fonts/ contém .keep sempre; os .woff2 reais da Dior são gitignorados
# (proprietários — não distribuir). Sem eles o catálogo usa o fallback livre.
COPY fonts/ /usr/share/nginx/html/fonts/
# Imagens do hero — self-hosted (sem picsum/CDN externo, não bloqueável)
COPY img/ /usr/share/nginx/html/img/
# Design System em rota dedicada — labellescens.hovio.com.br/design-system/
COPY design-system/ /usr/share/nginx/html/design-system/
# Planejamento tecnico — labellescens.hovio.com.br/planning/
COPY planning/ /usr/share/nginx/html/planning/

EXPOSE 80
# Healthcheck rápido (wget existe no nginx:alpine via busybox) — fica saudável em ~3-8s,
# antes do gate de deploy do Coolify desistir. Intervalo padrão (30s) faz rollback.
HEALTHCHECK --interval=5s --timeout=3s --start-period=3s --retries=5 \
  CMD wget -qO /dev/null http://127.0.0.1:80/ || exit 1
