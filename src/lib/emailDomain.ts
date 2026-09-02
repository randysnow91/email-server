import { promises as dns } from "dns";

// Best-effort check that an email address's domain can actually receive mail.
// Catches typos ("gmail.con") and nonsense ("qqq.qqqqqqq") that a syntax
// regex can't - "x@y.z" is a valid *shape* regardless of whether y.z exists.
//
// Fails OPEN: if the DNS lookup itself errors (timeout, resolver hiccup) we
// allow the address through rather than block a real signup over a transient
// network problem. Only a definitive "this domain has no mail route" rejects.
export async function domainCanReceiveEmail(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || !domain.includes(".")) return false;

  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // ENODATA = domain exists but has no MX records (fall through to the A
    // check below). ENOTFOUND = domain doesn't exist at all.
    if (code !== "ENODATA" && code !== "ENOTFOUND") return true;
  }

  // No MX record - mail can still be delivered to an A record (RFC 5321).
  try {
    await dns.resolve(domain);
    return true;
  } catch {
    return false;
  }
}
