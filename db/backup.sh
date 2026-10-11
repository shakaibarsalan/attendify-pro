#!/usr/bin/env bash
# =============================================================================
# Encrypted backups of BOTH Attendify databases (app + biometric vector store).
#
# Each DB is pg_dump'd (custom format) and AES-256 encrypted BEFORE it touches
# disk — the biometric dump contains face embeddings + fingerprint templates, so
# a plaintext dump would undo every other control. Cron-friendly.
#
#   cd /opt/attendify && bash db/backup.sh
#
# Uses `docker exec` + the in-container pg_dump over the local socket, so it needs
# no host pg_dump and keeps working after the DB passwords are rotated
# (a host-port + hardcoded-password approach would break).
#
# Requires BACKUP_PASSPHRASE (put it in .env).
# NOTE: writes to $DIR/backups on the same host — copy these OFF-host (rsync/scp/
# cloud) so a disk loss doesn't take the backups with it.
# =============================================================================
set -euo pipefail

DIR="${ATTENDIFY_DIR:-/opt/attendify}"
cd "$DIR"
# Load BACKUP_PASSPHRASE (and any BACKUP_* overrides) from .env if present.
[ -f .env ] && { set -a; . ./.env; set +a; }
: "${BACKUP_PASSPHRASE:?ABORT: set BACKUP_PASSPHRASE in .env (the AES key for backups)}"

BACKUP_DIR="${BACKUP_DIR:-$DIR/backups}"
RETAIN="${BACKUP_RETAIN:-14}"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"

dump_one(){ # <container> <user> <db> <label>
  local c="$1" u="$2" db="$3" label="$4"
  local out="$BACKUP_DIR/${label}_${ts}.dump.enc" tmp
  tmp="$(mktemp "$BACKUP_DIR/.${label}.XXXXXX")"
  if docker exec "$c" pg_dump -U "$u" --no-owner --no-privileges -Fc "$db" \
       | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE > "$tmp"; then
    [ -s "$tmp" ] || { rm -f "$tmp"; echo "[backup] ABORT: empty dump for $label"; exit 1; }
    chmod 600 "$tmp"; mv "$tmp" "$out"
    echo "[backup]   $label -> $out ($(du -h "$out" | cut -f1))"
  else
    rm -f "$tmp"; echo "[backup] ABORT: pg_dump failed for $label"; exit 1
  fi
}

echo "[backup] $ts"
dump_one attendify-db-main      attendify_user attendify           main
dump_one attendify-db-biometric biometric_user attendify_biometric biometric

# Retention: keep the newest $RETAIN encrypted dumps per database.
for label in main biometric; do
  ls -1t "$BACKUP_DIR/${label}_"*.dump.enc 2>/dev/null | tail -n +$((RETAIN+1)) | xargs -r rm -f
done
echo "[backup] done — kept newest $RETAIN each in $BACKUP_DIR"
