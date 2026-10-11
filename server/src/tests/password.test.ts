import { describe, it, expect } from 'vitest';
import { generateStrongPassword } from '../utils/password.js';

describe('generateStrongPassword', () => {
  it('returns the requested length (default 12)', () => {
    expect(generateStrongPassword()).toHaveLength(12);
    expect(generateStrongPassword(16)).toHaveLength(16);
    expect(generateStrongPassword(20)).toHaveLength(20);
  });

  it('always satisfies the complexity rule (upper, lower, digit, special)', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateStrongPassword();
      expect(/[A-Z]/.test(pw), `no uppercase in "${pw}"`).toBe(true);
      expect(/[a-z]/.test(pw), `no lowercase in "${pw}"`).toBe(true);
      expect(/[0-9]/.test(pw), `no digit in "${pw}"`).toBe(true);
      expect(/[^A-Za-z0-9]/.test(pw), `no special in "${pw}"`).toBe(true);
    }
  });

  it('avoids ambiguous characters (O/0/I/l/1)', () => {
    for (let i = 0; i < 100; i++) {
      expect(/[O0Il1]/.test(generateStrongPassword())).toBe(false);
    }
  });

  it('is effectively unique across calls (random)', () => {
    const set = new Set(Array.from({ length: 500 }, () => generateStrongPassword()));
    expect(set.size).toBe(500);
  });
});
