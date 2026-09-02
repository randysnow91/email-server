// Constant-time string comparison.
//
// A plain `a === b` stops at the first character that differs, so how long
// it takes leaks how many leading characters of a guess were correct - in
// theory enough to recover a secret one character at a time by measuring
// response times (a "timing attack"). This compares every character no
// matter what, so there's no timing signal to measure.
//
// Written without node:crypto (no timingSafeEqual) so it works in the Edge
// runtime too - proxy.ts, which runs there, uses this.
export function constantTimeEqual(a: string, b: string): boolean {
  // The length check leaks length, but the admin secret's length is fixed
  // and not sensitive (it's a documented 64-char hex string).
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    // OR every XOR into the accumulator: it stays 0 only if every character
    // matched, and the loop always runs the full length.
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
