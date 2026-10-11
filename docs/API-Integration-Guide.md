# Attendify Public API — Integration Guide

This guide is for developers integrating Attendify with an external system (ERP,
student portal, or your own application). It covers authentication, the two API
products — **Data Integration** and **Biometric Verification** — usage limits,
and copy-paste examples.

> The always-current machine-readable contract is the OpenAPI/Swagger doc at
> **`https://attendify.pro/api/integration-docs`**.

---

## 1. Getting access

The Public API is a **paid feature**. To enable it:

1. Your institution must be on a **paid plan** (the Free plan cannot use the API).
2. An **organization admin** requests API access from the dashboard
   (*API & Integrations → Request API Access*).
3. A **system administrator approves** it.
4. The org admin then creates an **API key** (*API & Integrations → Create Key*).
   Tick **"Enable biometric verification"** if the key will call the biometric
   endpoints.

The raw key is shown **once** at creation — store it securely. Disabling API
access (or revoking the key) blocks it immediately.

---

## 2. Authentication

Send your key in the `X-API-Key` header on every request.

```
Base URL:  https://attendify.pro/api
Header:    X-API-Key: ak_xxxxxxxxxxxxxxxxxxxxxxxx
```

```bash
curl -H "X-API-Key: $ATTENDIFY_KEY" \
  https://attendify.pro/api/public/courses
```

All data is scoped to **your institution** — a key can never read another
tenant's data. Requests are **rate-limited per key**.

---

## 3. Data Integration API (read-only)

Pull attendance data into your ERP. Typical sync flow:
**list courses → map by your own code → fetch sessions → fetch attendance.**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/public/courses` `?code=&page=&limit=` | List your courses (map your codes → Attendify ids) |
| GET | `/public/students/by-roll/{rollNumber}` | Resolve a student by roll number |
| GET | `/public/students/course/{courseId}` | Course roster (active students) |
| GET | `/public/sessions/course/{courseId}` `?page=&limit=&updatedSince=` | Sessions for a course |
| GET | `/public/attendance/session/{sessionId}` | Attendance records for a session |
| GET | `/public/students/by-roll/{rollNumber}/attendance` `?from=&to=&page=&limit=` | A student's attendance history |

**Example — discover a course and pull its latest attendance:**

```bash
# 1. find the Attendify course id for your code "CS-101"
curl -H "X-API-Key: $KEY" "https://attendify.pro/api/public/courses?code=CS-101"
# -> [{ "id": "c1000000-...", "code": "CS-101", "name": "...", "teacher_name": "..." }]

# 2. list that course's sessions (paginated, newest first)
curl -H "X-API-Key: $KEY" "https://attendify.pro/api/public/sessions/course/c1000000-...?limit=20"

# 3. pull attendance for a session
curl -H "X-API-Key: $KEY" "https://attendify.pro/api/public/attendance/session/<sessionId>"
```

Use `updatedSince` (ISO timestamp) and `from`/`to` (YYYY-MM-DD) for incremental
syncs, and `page`/`limit` (max 200) for pagination.

---

## 4. Biometric Verification API

Use Attendify's face & fingerprint recognition in **your own** application. You
enroll **your own users** (referenced by your `subjectRef`), then verify or
identify them. Subjects are isolated per institution and kept separate from
Attendify's attendance students. **Requires a key with the `biometric` scope.**

### Face

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/public/biometric/face/enroll` | Enroll a face for a subject |
| POST | `/public/biometric/face/verify` | **1:1** — is this image subject X? |
| POST | `/public/biometric/face/identify` | **1:N** — who is this among my subjects? |
| GET | `/public/biometric/face/{subjectRef}/status` | Is the subject enrolled? |
| DELETE | `/public/biometric/face/{subjectRef}` | Delete a subject's face |

### Fingerprint (contactless, 1:1)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/public/biometric/fingerprint/enroll` | Enroll a fingertip photo |
| POST | `/public/biometric/fingerprint/verify` | **1:1** — match a fingertip photo to a subject |
| GET | `/public/biometric/fingerprint/{subjectRef}/status` | Enrollment status |
| DELETE | `/public/biometric/fingerprint/{subjectRef}` | Delete |

**Example — enroll then verify a face:**

```bash
# enroll (image = base64 JPEG/PNG, optionally a data: URI)
curl -X POST https://attendify.pro/api/public/biometric/face/enroll \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{ "subjectRef": "employee-4821", "image": "data:image/jpeg;base64,/9j/4AAQ..." }'
# -> { "success": true, "subjectRef": "employee-4821", "embeddingId": "...", "qualityScore": ... }

# verify 1:1
curl -X POST https://attendify.pro/api/public/biometric/face/verify \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{ "subjectRef": "employee-4821", "image": "data:image/jpeg;base64,..." }'
# -> { "match": true, "confidence": 0.97, "threshold": 0.55, "subjectRef": "employee-4821" }

# identify 1:N
curl -X POST https://attendify.pro/api/public/biometric/face/identify \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{ "image": "data:image/jpeg;base64,..." }'
# -> { "match": true, "subjectRef": "employee-4821", "confidence": 0.97, "candidates": [...] }
```

**Anti-spoofing.** Face `verify`/`identify` run multi-signal anti-spoofing by
default, rejecting printed photos / screen replays. If your application runs its
own liveness and supplies a live capture, you may pass `"antiSpoof": false`.

---

## 5. Webhooks

Receive **signed event callbacks** instead of polling. Register an HTTPS endpoint
(*API & Integrations → Webhooks*); Attendify POSTs a JSON body when a subscribed
event occurs.

**Events:** `attendance.marked` (a student was verified present) · `fraud.alert`
(a suspicious attempt was detected — geofence breach, duplicate device, or shared IP).

**Payloads:**

```json
{ "event": "attendance.marked",
  "data": { "attendanceId": "…", "studentId": "…", "sessionId": "…",
            "status": "verified", "method": "face", "markedAt": "…" },
  "timestamp": "2026-06-16T09:05:00Z" }
```

```json
{ "event": "fraud.alert",
  "data": { "studentId": "…", "sessionId": "…",
            "reason": "Duplicate device: same device used by …",
            "severity": "critical", "detectedAt": "…" },
  "timestamp": "2026-06-17T09:05:00Z" }
```

**Verify the signature.** Each delivery carries
`X-Attendify-Signature: sha256=<hmac>` — an HMAC-SHA256 of the raw request body
using your webhook's signing secret (shown once at creation). Recompute and
compare to reject forged calls:

```
expected = "sha256=" + HMAC_SHA256(secret, <raw request body>)
```

Deliveries are best-effort with an 8-second timeout — return `2xx` quickly and
process asynchronously.

---

## 6. Usage & quotas (billing)

Each plan includes a **monthly cap on billable verifications** (face
verify/identify + fingerprint verify). **Enroll, status, and delete are free.**

- Your current usage is shown in the dashboard (*API & Integrations → Verification
  usage this month*).
- When the cap is reached, billable calls return **`429 Too Many Requests`** with
  `{ used, quota }`. Upgrade your plan (or contact your administrator) for more.

---

## 7. Errors

| Status | Meaning |
|---|---|
| `400` | Bad request (missing field, no face detected, quality too low, spoof detected) |
| `401` | Missing or invalid API key |
| `403` | Key lacks the required scope (e.g. `biometric`), or API access is disabled |
| `404` | Resource not found (e.g. subject not enrolled) |
| `429` | Monthly verification quota reached |
| `5xx` | Server / AI-service error — retry with backoff |

Error responses are JSON: `{ "error": "human-readable message" }`.

---

## 8. Quick reference

```
Auth header     X-API-Key: <key>
Base URL        https://attendify.pro/api
Pagination      ?page=1&limit=50   (limit max 200)
Incremental     ?updatedSince=<ISO>  ·  ?from=YYYY-MM-DD&to=YYYY-MM-DD
Biometric scope required for /public/biometric/*  (create key with biometric enabled)
Free ops        enroll, status, delete   ·   Billable: verify, identify
Full reference  https://attendify.pro/api/integration-docs
```
