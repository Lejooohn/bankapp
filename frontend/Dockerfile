# Build context is the repository root (docker-compose sets context: .), because the
# frontend depends on the shared package in ../shared.
FROM node:26-alpine

WORKDIR /app

COPY shared/package*.json ./shared/
RUN cd shared && npm ci
COPY shared/ ./shared/
RUN cd shared && npm run build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

EXPOSE 5173

# Healthcheck to verify dev server is responsive.
# Use 127.0.0.1 explicitly: "localhost" can resolve to ::1, and nothing
# listens on IPv6 in this stack, which made the check fail forever.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5173/ || exit 1

# WSL2 bind mounts can drop out momentarily while Docker Desktop restarts
# containers at Windows startup, which crashes the Vite dev server and would
# otherwise leave the container exited for good (relying on the restart
# policy's growing backoff). Loop npm run dev so a transient mount hiccup
# just triggers a quick restart instead. Same pattern as backend/Dockerfile.
CMD ["sh", "-c", "while true; do npm run dev; echo 'dev server exited, restarting in 1s...'; sleep 1; done"]
