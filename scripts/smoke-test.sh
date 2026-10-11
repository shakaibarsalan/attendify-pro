#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Post-deploy smoke test
#
# Runs on the deploy runner immediately after a release, against the freshly
# deployed backend (default http://127.0.0.1:5000). Verifies the core API
# surface, security posture and auth path WITHOUT mutating any data, so a broken
# release is caught loudly instead of silently reaching users.
#
# Core checks fail the deploy (exit 1). The AI/readiness probe is a soft check
# (warn only) because the AI model reload after a rebuild can take a couple of
# minutes and is not itself a "broken deploy".
# ---------------------------------------------------------------------------
set -uo pipefail

BASE="${SMOKE_BASE:-http://127.0.0.1:5000}"
fails=0
note() { echo "[smoke] $*"; }
fail() { echo "[smoke] FAIL: $*"; fails=$((fails + 1)); }
code() { curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$@"; }

note "target: $BASE"

# 1. Liveness
c=$(code "$BASE/health")
[ "$c" = "200" ] && note "health 200" || fail "health -> $c"

# 2. A real read endpoint (DB-backed)
c=$(code "$BASE/api/plans")
[ "$c" = "200" ] && note "GET /api/plans 200" || fail "GET /api/plans -> $c"

# 3. Curated integration docs present AND not leaking internal endpoints
body=$(curl -s --max-time 15 "$BASE/api/integration-docs.json")
if echo "$body" | grep -q '"/public/courses"'; then
  note "integration-docs serves public endpoints"
else
  fail "integration-docs missing expected public path"
fi
if echo "$body" | grep -qE '"/(auth/login|users|institutions|fraud|reports)"'; then
  fail "integration-docs LEAKS internal endpoints"
else
  note "integration-docs has no internal leak"
fi

# 4. Full internal docs hidden in production
c=$(code "$BASE/api-docs.json")
[ "$c" = "404" ] && note "/api-docs.json hidden (404)" || fail "/api-docs.json exposed -> $c"

# 5. Auth path works (read-only login). Credentials come from the environment and
#    are never committed: SMOKE_EMAIL / SMOKE_PASSWORD. Skipped when unset.
if [ -n "${SMOKE_EMAIL:-}" ] && [ -n "${SMOKE_PASSWORD:-}" ]; then
  body=$(printf '{"email":"%s","password":"%s"}' "$SMOKE_EMAIL" "$SMOKE_PASSWORD")
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" -d "$body")
  [ "$c" = "200" ] && note "auth/login 200" || fail "auth/login -> $c"
else
  note "auth/login check skipped (set SMOKE_EMAIL and SMOKE_PASSWORD to enable)"
fi

# 6. Auth rejects bad credentials
c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@attendify.app","password":"definitely-wrong"}')
[ "$c" = "401" ] && note "auth rejects bad creds (401)" || fail "bad-creds login -> $c (expected 401)"

# 7. FULL PUBLIC CHAIN (edge nginx -> web nginx -> server). The checks above hit
#    the backend directly; this catches a broken nginx PROXY (e.g. a stale
#    upstream IP) that the direct-backend checks would miss. Self-signed cert -> -k.
EDGE="${SMOKE_EDGE:-https://127.0.0.1}"
ec=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 15 "$EDGE/api/plans")
[ "$ec" = "200" ] && note "public chain GET /api/plans 200 (edge->web->server)" \
  || fail "PUBLIC CHAIN /api/plans -> $ec — nginx proxy is broken even though backend is up"
ec=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 15 "$EDGE/api/integration-docs.json")
[ "$ec" = "200" ] && note "public chain integration-docs.json 200" \
  || fail "PUBLIC CHAIN integration-docs -> $ec"

# 8. SOFT: full readiness incl. AI service (warmup-tolerant — warn, don't fail)
ready=0
for i in 1 2 3 4 5 6 7 8; do
  c=$(code "$BASE/health/ready")
  if [ "$c" = "200" ]; then ready=1; break; fi
  sleep 15
done
if [ "$ready" = "1" ]; then
  note "readiness 200 (DB + AI healthy)"
else
  note "WARN: /health/ready not 200 after ~2min (AI may still be warming) — not failing the smoke"
fi

echo "[smoke] ---------------------------------------------"
if [ "$fails" -gt 0 ]; then
  echo "[smoke] RESULT: $fails core check(s) FAILED"
  exit 1
fi
echo "[smoke] RESULT: all core checks passed"
