import crypto from 'crypto';

// A short-lived, signed "presence pass" proving a student scanned the session's
// LIVE rotating QR at a recent moment (i.e. was physically in the room). It is
// issued by /sessions/:id/verify-presence after the 3-second QR validates, and is
// then carried by the (slower) biometric mark — which is why it must outlive the
// QR's 3s window. The short TTL keeps it from being forwarded/reused much later.

const PASS_TTL_SECONDS = 180; // 3 minutes — enough to complete a face/fingerprint scan.

function passSecret(): string {
  return process.env.LIVENESS_HMAC_SECRET || process.env.JWT_SECRET || 'attendify-presence-pass-secret';
}

export function issuePresencePass(sessionId: string, studentId: string): string {
  const exp = Math.floor(Date.now() / 1000) + PASS_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ s: sessionId, u: studentId, e: exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', passSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyPresencePass(pass: unknown, sessionId: string, studentId: string): boolean {
  if (!pass || typeof pass !== 'string') return false;
  const dot = pass.indexOf('.');
  if (dot < 1) return false;
  const payload = pass.slice(0, dot);
  const sig = pass.slice(dot + 1);
  const expected = crypto.createHmac('sha256', passSecret()).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.s !== sessionId || data.u !== studentId) return false;
    if (Math.floor(Date.now() / 1000) > Number(data.e)) return false;
    return true;
  } catch {
    return false;
  }
}
