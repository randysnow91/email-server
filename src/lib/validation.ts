// Deliberately simple: catches typos and obviously-malformed input without
// trying to be a full RFC 5322 validator (nobody's email client agrees on
// what those allow anyway).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && EMAIL_PATTERN.test(email.trim());
}
