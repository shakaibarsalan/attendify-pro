import crypto from 'crypto';

// Ambiguity-free alphabets (no O/0/I/l/1) so an emailed temp password is easy to
// read and type. Guarantees at least one upper, lower, digit and special so it
// satisfies the app's password-complexity rule.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGIT = '23456789';
const SPECIAL = '!@#$%&*';

function pick(alphabet: string): string {
  return alphabet[crypto.randomInt(alphabet.length)];
}

export function generateStrongPassword(length = 12): string {
  const all = UPPER + LOWER + DIGIT + SPECIAL;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SPECIAL)];
  while (chars.length < length) chars.push(pick(all));
  // Fisher–Yates shuffle so the guaranteed-class chars aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
