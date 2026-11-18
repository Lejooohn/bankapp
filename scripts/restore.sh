#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
DECRYPT_SCRIPT="$SCRIPT_DIR/decrypt-backup.mjs"

# Load .env
if [ -f "$ENV_FILE" ]; then
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
CONTAINER_PREFIX="${CONTAINER_PREFIX:-bankapp}"
DB_CONTAINER="${POSTGRES_CONTAINER:-${CONTAINER_PREFIX}-db}"
API_CONTAINER="${API_CONTAINER:-${CONTAINER_PREFIX}-api}"
WEB_CONTAINER="${WEB_CONTAINER:-${CONTAINER_PREFIX}-web}"
POSTGRES_CONTAINER="$DB_CONTAINER"
TMP_SQL="/tmp/restore-$$-$(date +%s).sql"
TMP_PRE_RESTORE="$BACKUP_DIR/pre-restore/dump-before-$(date +%Y%m%d-%H%M%S).sql.gz"

# Cleanup on exit
cleanup() {
  rm -f "$TMP_SQL"
}
trap cleanup EXIT

# --- Sélection du dump ---
if [ -n "${1:-}" ]; then
  DUMP_FILE="$1"
else
  echo "Dumps disponibles :"
  ls -lht "$BACKUP_DIR"/{daily,manual}/bankapp-*.sql.gz 2>/dev/null | head -10
  echo ""
  LATEST=$(ls -t "$BACKUP_DIR"/{daily,manual}/bankapp-*.sql.gz 2>/dev/null | head -1)
  if [ -z "$LATEST" ]; then
    echo "ERREUR : aucun dump trouvé dans $BACKUP_DIR/daily ou $BACKUP_DIR/manual" >&2
    exit 1
  fi
  echo "Dump le plus récent : $LATEST"
  read -rp "Utiliser ce dump ? [O/n] " CONFIRM
  CONFIRM="${CONFIRM:-O}"
  if [[ ! "$CONFIRM" =~ ^[Oo]$ ]]; then
    read -rp "Chemin complet du dump à restaurer : " DUMP_FILE
  else
    DUMP_FILE="$LATEST"
  fi
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "ERREUR : fichier introuvable : $DUMP_FILE" >&2
  exit 1
fi

SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo ""
echo "  Dump    : $DUMP_FILE ($SIZE)"
echo "  Cible   : $POSTGRES_CONTAINER (base bankapp)"
echo ""

# --- Validation du dump AVANT toute opération destructive ---
echo "[$(date)] Validation du dump (déchiffrage + décompression)..."
# The NAS host has no node: decryption runs in the backend image, with the key from .env and the
# dump folder mounted read-only.
BACKEND_IMAGE="${BACKEND_IMAGE:-${CONTAINER_PREFIX}-backend}"
DUMP_DIR="$(cd "$(dirname "$DUMP_FILE")" && pwd)"
if ! docker run --rm --env-file "$ENV_FILE" -v "$DUMP_DIR:/backups:ro" -v "$SCRIPT_DIR:/scripts:ro" \
  "$BACKEND_IMAGE" node /scripts/decrypt-backup.mjs "/backups/$(basename "$DUMP_FILE")" > "$TMP_SQL" 2>&1; then
  echo "ERREUR : impossible de déchiffrer ou décompresser le dump" >&2
  cat "$TMP_SQL" >&2
  exit 1
fi

if [ ! -s "$TMP_SQL" ]; then
  echo "ERREUR : dump déchiffré est vide" >&2
  exit 1
fi

if ! grep -q "COPY public.transactions" "$TMP_SQL"; then
  echo "ERREUR : dump ne semble pas valide (pas de table transactions)" >&2
  exit 1
fi

echo "[$(date)] Validation OK"
echo ""
echo "ATTENTION : cette opération remplace toutes les données existantes."
echo "Un backup de l'état courant sera créé dans $BACKUP_DIR/pre-restore/"
read -rp "Confirmer la restauration ? [oui/NON] " CONFIRM
if [ "$CONFIRM" != "oui" ]; then
  echo "Restauration annulée."
  exit 0
fi

# --- Créer snapshot de sécurité de l'état courant ---
echo "[$(date)] Création d'un backup de sécurité de l'état actuel..."
mkdir -p "$BACKUP_DIR/pre-restore"
docker exec "$POSTGRES_CONTAINER" pg_dump -U bankapp bankapp | gzip > "$TMP_PRE_RESTORE"
echo "[$(date)] Backup de sécurité : $TMP_PRE_RESTORE"

# --- Arrêter dépendances ---
echo "[$(date)] Arrêt du backend et du frontend..."
docker stop "$API_CONTAINER" "$WEB_CONTAINER" 2>/dev/null || true

# --- Restaurer ---
echo "[$(date)] Suppression du schéma existant..."
docker exec "$POSTGRES_CONTAINER" psql -U bankapp bankapp -c "
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO bankapp;
" > /dev/null

echo "[$(date)] Restauration en cours (transaction atomique)..."
if ! docker exec -i "$POSTGRES_CONTAINER" psql -U bankapp bankapp \
  -v ON_ERROR_STOP=1 --single-transaction < "$TMP_SQL" > /dev/null 2>&1; then
  echo "ERREUR : la restauration a échoué" >&2
  echo "[$(date)] ROLLBACK automatique appliqué (--single-transaction)"
  echo "[$(date)] Backup de sécurité conservé : $TMP_PRE_RESTORE"
  docker start "$API_CONTAINER" "$WEB_CONTAINER" 2>/dev/null || true
  exit 1
fi

# --- Vérifier intégrité ---
echo "[$(date)] Vérification de l'intégrité..."
USER_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U bankapp bankapp -t -c "SELECT COUNT(*) FROM users" | tr -d ' ')
ACCOUNT_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U bankapp bankapp -t -c "SELECT COUNT(*) FROM accounts" | tr -d ' ')
TRANSACTION_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U bankapp bankapp -t -c "SELECT COUNT(*) FROM transactions" | tr -d ' ')
MAX_DATE=$(docker exec "$POSTGRES_CONTAINER" psql -U bankapp bankapp -t -c "SELECT MAX(date) FROM transactions" | tr -d ' ')

echo "[$(date)] Restauration complètement réussie!"
echo "  - Users: $USER_COUNT"
echo "  - Accounts: $ACCOUNT_COUNT"
echo "  - Transactions: $TRANSACTION_COUNT (max date: $MAX_DATE)"
echo ""

# --- Redémarrer services ---
echo "[$(date)] Redémarrage du backend et du frontend..."
docker start "$API_CONTAINER" "$WEB_CONTAINER" 2>/dev/null || true

echo "[$(date)] Done. Backup de sécurité conservé : $TMP_PRE_RESTORE"
echo "[$(date)] Pour annuler, restaurer depuis ce backup."
