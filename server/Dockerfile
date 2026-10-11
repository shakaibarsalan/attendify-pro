FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --prefer-offline --no-audit --no-fund --fetch-timeout=60000 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || npm install --prefer-offline --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
# Fail the image build on type errors (CI also gates on tsc). A failed build just
# blocks the deploy — the currently-running container keeps serving.
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --prefer-offline --no-audit --no-fund --fetch-timeout=60000 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || npm install --omit=dev --prefer-offline --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1
CMD ["node", "dist/index.js"]
