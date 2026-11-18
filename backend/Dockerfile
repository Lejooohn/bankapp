# Build context is the repository root (docker-compose sets context: .), because the
# backend depends on the shared package in ../shared.
#
# Stages:
#   prod  compiled JavaScript only (`node dist/index.js`), devDependencies pruned (docker-compose.yml)
#   dev   tsx watch with the sources bind-mounted (docker-compose.local.yml uses this target)
# The dev stage is last, so a plain `docker build` still produces the dev image.

FROM node:26-alpine AS base

WORKDIR /app

# PostgreSQL client for manual backups (must match the server major version)
RUN apk add --no-cache postgresql18-client

# Shared package first: the backend links it as file:../shared.
COPY shared/package*.json ./shared/
RUN cd shared && npm ci
COPY shared/ ./shared/
RUN cd shared && npm run build

# Version file (read by the About dialog) and the build commit (set by the deployer).
COPY VERSION ./VERSION
ARG GIT_COMMIT=dev
ENV APP_COMMIT=$GIT_COMMIT

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./

EXPOSE 3000

FROM base AS prod
ENV NODE_ENV=production
RUN npm run build && npm prune --omit=dev
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/index.js"]

FROM base AS dev
# WSL2 bind mounts can drop out momentarily while the app is running, which crashes
# tsx --watch (ERR_MODULE_NOT_FOUND) and would otherwise kill the container for good.
# Loop npm run dev so a transient mount hiccup just triggers a quick restart instead
# of leaving the container up but dead (as seen with the previous startup-only wait).
CMD ["sh", "-c", "while true; do npm run dev; echo 'dev server exited, restarting in 1s...'; sleep 1; done"]
