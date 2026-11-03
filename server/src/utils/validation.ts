// Shared input checks. Both run in linear time on any input, so a crafted string
// can't make a request hang (CodeQL js/polynomial-redos).

/** A local part, then dot-separated domain labels. Labels can't contain dots, so
 *  there is only one way to match and no backtracking blow-up. */
export const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Removes trailing slashes with a loop: the /\/+$/ regex is quadratic on long runs of '/'. */
export function stripTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47) end--;
  return s.slice(0, end);
}
