import crypto from 'crypto';

export interface QRTokenResult {
  token: string;
  windowIndex: number;
  expiresAt: number;
  intervalSeconds: number;
}

export function generateCurrentQRToken(
  baseSecret: string,
  intervalSeconds: number = 15,
): QRTokenResult {
  const now = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(now / intervalSeconds);
  const expiresAt = (windowIndex + 1) * intervalSeconds;

  const token = crypto
    .createHmac('sha256', baseSecret)
    .update(String(windowIndex))
    .digest('hex')
    .substring(0, 16);

  return {
    token,
    windowIndex,
    expiresAt,
    intervalSeconds,
  };
}

export function validateQRToken(
  baseSecret: string,
  submittedToken: string,
  intervalSeconds: number = 15,
  graceSeconds: number = 0,
): { valid: boolean; windowIndex: number } {
  const now = Math.floor(Date.now() / 1000);
  const currentWindow = Math.floor(now / intervalSeconds);

  // Look back far enough to FIND a token that could still be inside its grace; the
  // absolute freshness gate below is what actually bounds validity.
  const windowsBack = 2 + Math.ceil(Math.max(0, graceSeconds) / intervalSeconds);

  for (let offset = 0; offset <= windowsBack; offset++) {
    const windowIndex = currentWindow - offset;
    const expectedToken = crypto
      .createHmac('sha256', baseSecret)
      .update(String(windowIndex))
      .digest('hex')
      .substring(0, 16);

    if (submittedToken === expectedToken) {
      // Absolute freshness gate: a token is valid through its own rotation window
      // and then only `graceSeconds` longer. So the moment the QR visibly rotates,
      // an old/saved/screenshotted code dies within graceSeconds — independent of
      // how long the rotation interval is. Just enough grace to cover a live scan's
      // scan -> open -> verify latency, nothing more.
      const secondsSinceWindowEnded = now - (windowIndex + 1) * intervalSeconds;
      if (secondsSinceWindowEnded > graceSeconds) break; // matched, but too stale
      return { valid: true, windowIndex };
    }
  }

  return { valid: false, windowIndex: -1 };
}
