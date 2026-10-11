FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --prefer-offline --no-audit --no-fund --fetch-timeout=60000 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || npm install --prefer-offline --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npx vite build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.prod.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
