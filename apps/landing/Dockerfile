FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --prefer-offline --no-audit --no-fund --fetch-timeout=60000 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || npm install --prefer-offline --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/80 || exit 1
CMD ["nginx", "-g", "daemon off;"]
