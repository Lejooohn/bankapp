#!/usr/bin/env bash
# Manual full backup of the database, encrypted like every other backup.
#
# Writes $BACKUP_DIR/manual/bankapp-YYYYMMDD-HHMMSS.sql.gz in the format the application reads
# (AES-256-GCM, nonce || ciphertext || tag). The dump is encrypted inside the backend image,
# before anything reaches the disk: no plaintext dump is written on the NAS.
#
# Usage (from the project folder, with sudo if Docker needs it):  sudo bash scripts/backup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

CONTAINER_PREFIX="${CONTAINER_PREFIX:-bankapp}"
DB_CONTAINER="${POSTGRES_CONTAINER:-${CONTAINER_PREFIX}-db}"
BACKEND_IMAGE="${BACKEND_IMAGE:-${CONTAINER_PREFIX}-backend}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
MANUAL_DIR="$BACKUP_DIR/manual"
DUMP_FILE="$MANUAL_DIR/bankapp-$(date +%Y%m%d-%H%M%S).sql.gz"
TMP_FILE="$DUMP_FILE.tmp"

if ! docker inspect "$DB_CONTAINER" &>/dev/null; then
  echo "ERREUR : le conteneur $DB_CONTAINER n'est pas démarré." >&2
  exit 1
fi

mkdir -p "$MANUAL_DIR"
trap 'rm -f "$TMP_FILE"' EXIT

echo "[$(date)] Démarrage du backup chiffré..."
docker exec "$DB_CONTAINER" pg_dump -U bankapp bankapp \
  | gzip \
  | docker run -i --rm --env-file "$ENV_FILE" --entrypoint node "$BACKEND_IMAGE" --input-type=module -e \
      "import { encryptBuffer } from './dist/services/encryption.js'; const chunks = []; for await (const c of process.stdin) chunks.push(c); process.stdout.write(encryptBuffer(Buffer.concat(chunks)));" \
  > "$TMP_FILE"

mv "$TMP_FILE" "$DUMP_FILE"
trap - EXIT

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "[$(date)] Backup chiffré créé : $DUMP_FILE ($SIZE)"
