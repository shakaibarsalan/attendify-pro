import { describe, it, expect, vi } from 'vitest';
import { generateCurrentQRToken, validateQRToken } from '../src/utils/qr-token.js';

describe('QR Token Generation', () => {
  it('generates a token of correct length', () => {
    const result = generateCurrentQRToken('test-secret', 15);
    expect(result.token).toHaveLength(16);
    expect(result.intervalSeconds).toBe(15);
    expect(result.expiresAt).toBeGreaterThan(0);
  });

  it('generates different tokens for different secrets', () => {
    const t1 = generateCurrentQRToken('secret-a', 15);
    const t2 = generateCurrentQRToken('secret-b', 15);
    expect(t1.token).not.toBe(t2.token);
  });

  it('windowIndex increases with time', () => {
    const r1 = generateCurrentQRToken('test-secret', 1);
    expect(r1.windowIndex).toBeGreaterThan(0);
  });
});

describe('QR Token Validation', () => {
  it('validates current token', () => {
    const generated = generateCurrentQRToken('test-secret', 15);
    const result = validateQRToken('test-secret', generated.token, 15);
    expect(result.valid).toBe(true);
    expect(result.windowIndex).toBe(generated.windowIndex);
  });

  it('rejects wrong secret', () => {
    const generated = generateCurrentQRToken('correct-secret', 15);
    const result = validateQRToken('wrong-secret', generated.token, 15);
    expect(result.valid).toBe(false);
  });

  it('rejects random token', () => {
    const result = validateQRToken('test-secret', 'random-invalid-token', 15);
    expect(result.valid).toBe(false);
  });

  it('rejects token from far future', () => {
    const result = validateQRToken('test-secret', '0000000000000000', 15);
    expect(result.valid).toBe(false);
  });
});
