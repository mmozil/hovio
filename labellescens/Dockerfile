# La Belle Scens — Design System (site estático, nginx)
# Padrão Hovio: nginx:alpine + Dockerfile (igual hub hovio.com.br).
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
# fonts/ contém .keep sempre; os .woff2 reais da Dior são gitignorados
# (proprietários — não distribuir). Sem eles o catálogo usa o fallback livre.
COPY fonts/ /usr/share/nginx/html/fonts/

EXPOSE 80
HEALTHCHECK CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
