# ── Build Stage ──
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev
COPY . .
RUN npm run build

# ── Runtime Stage ──
FROM node:22-slim AS runtime
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/types.ts ./
COPY --from=build /app/version.ts ./

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["./node_modules/.bin/tsx", "server/index.ts"]
