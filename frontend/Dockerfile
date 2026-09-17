FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
# nginx.conf tambem copiado p/ html: excluir do servico estatico
RUN rm -f /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/Dockerfile
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:80/ || exit 1
