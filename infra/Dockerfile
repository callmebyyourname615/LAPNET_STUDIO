FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm db:generate && pnpm build && pnpm api:openapi
RUN pnpm --filter @lapnet/api deploy --legacy --prod /out/api

FROM build AS migrate
CMD ["pnpm", "db:migrate"]

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3100
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
RUN mkdir -p /app/storage/documents /app/storage/quarantine && chown -R node:node /app/storage
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3100/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]

FROM nginx:1.30.0-alpine@sha256:0272e4604ed93c1792f03695a033a6e8546840f86e0de20a884bb17d2c924883 AS web
COPY --from=build /workspace/dist /usr/share/nginx/html
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
