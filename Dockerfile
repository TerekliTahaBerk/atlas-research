FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
FROM base AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc prisma7.config.ts ./
COPY prisma ./prisma
RUN npm ci --loglevel=error

FROM deps AS build
ENV NODE_OPTIONS=--max-old-space-size=1024
COPY . .
RUN npm run typecheck && npm run lint && npm test && npm run build

FROM deps AS migrator
COPY ops/provision-db.mjs ops/provision-initial-user.mjs ops/migrate.mjs ./ops/
ARG ATLAS_SOURCE_COMMIT=local
LABEL org.opencontainers.image.revision=$ATLAS_SOURCE_COMMIT
USER node
CMD ["node","ops/migrate.mjs"]

FROM deps AS production-deps
RUN npm prune --omit=dev --ignore-scripts --loglevel=error

FROM base AS mail
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/worker ./dist/worker
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY ops/worker-probe.mjs ./ops/worker-probe.mjs
ARG ATLAS_SOURCE_COMMIT=local
LABEL org.opencontainers.image.revision=$ATLAS_SOURCE_COMMIT
USER node
HEALTHCHECK --interval=15s --timeout=8s --start-period=30s CMD ["node","ops/worker-probe.mjs"]
CMD ["node","dist/worker/mail/run.js"]

FROM base AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY ops/probe.mjs ./ops/probe.mjs
ARG ATLAS_SOURCE_COMMIT=local
LABEL org.opencontainers.image.revision=$ATLAS_SOURCE_COMMIT
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=8s --start-period=40s CMD ["node","ops/probe.mjs"]
CMD ["node","server.js"]
