#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Nightly database backup with rotation.
#
# Dumps BOTH Attendify databases (main + biometric) from their Docker containers
# to a local directory, gzipped and timestamped, and prunes dumps older than
# BACKUP_KEEP_DAYS. Installed as a cron by the deploy workflow; also runnable by
# hand:  bash scripts/backup-db.sh
#
# Local backups protect against bad migrations / accidental deletes. They do NOT
# survive losing the whole server — push them off-site (S3 / Backblaze / rsync)
# for real disaster recovery.
# ---------------------------------------------------------------------------
set -uo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/attendify/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
ts="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

ok=0
fail=0

dump() {
  local container="$1" user="$2" db="$3" name="$4"
  local out="$BACKUP_DIR/${name}-${ts}.sql.gz"
  if docker exec "$container" pg_dump -U "$user" -d "$db" 2>/dev/null | gzip > "$out"; then
    if [ -s "$out" ]; then
      echo "[backup] OK   $out ($(du -h "$out" | cut -f1))"
      ok=$((ok + 1))
    else
      echo "[backup] FAIL empty dump for $name — removing"
      rm -f "$out"
      fail=$((fail + 1))
    fi
  else
    echo "[backup] FAIL pg_dump failed for $name"
    rm -f "$out"
    fail=$((fail + 1))
  fi
}

dump attendify-db-main      attendify_user  attendify            main
dump attendify-db-biometric biometric_user  attendify_biometric  biometric

# Rotation — by age (older than KEEP_DAYS) AND by count (keep newest KEEP_COUNT of
# each DB), so frequent deploys can't fill the disk between nightly runs.
KEEP_COUNT="${BACKUP_KEEP_COUNT:-20}"
find "$BACKUP_DIR" -name '*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
for prefix in main biometric; do
  ls -1t "$BACKUP_DIR/${prefix}-"*.sql.gz 2>/dev/null | tail -n +"$((KEEP_COUNT + 1))" | xargs -r rm -f
done

retained="$(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)"
echo "[backup] $ts done: $ok ok, $fail failed; $retained dumps retained (keep ${KEEP_DAYS}d / ${KEEP_COUNT} each)"

# Non-zero exit if either database failed, so a caller (deploy verify / cron log)
# can detect a broken backup mechanism.
[ "$fail" -eq 0 ]
