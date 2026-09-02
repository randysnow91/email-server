// In-memory fixed-window rate limiter.
//
// State lives in this Node process. That's fine for the single always-on
// Render instance this app runs on (§2): it's shared across all requests to
// that process and simply resets on redeploy. If the app ever scales to
// multiple instances or moves to serverless, back this with Redis or a
// database table instead - the API below wouldn't change.

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

// Guards against unbounded growth if someone hammers the endpoint from many
// IPs: once we're tracking this many keys, drop the expired ones.
const MAX_TRACKED_KEYS = 1000;

export type RateLimitOptions = { limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

// Peek at a key's window without counting anything against it. Call this
// first to reject an over-limit caller before doing any real work.
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const win = windows.get(key);
  const now = Date.now();

  if (!win || now >= win.resetAt || win.count < opts.limit) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return { allowed: false, retryAfterSeconds: Math.ceil((win.resetAt - now) / 1000) };
}

// Count one failed attempt against the key's current window.
export function registerFailure(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  const win = windows.get(key);

  if (!win || now >= win.resetAt) {
    windows.set(key, { count: 1, resetAt: now + opts.windowMs });
  } else {
    win.count += 1;
  }

  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [k, w] of windows) {
      if (now >= w.resetAt) windows.delete(k);
    }
  }
}

// Clear a key's window - call after a successful auth so someone who
// fumbled their secret a few times isn't left locked out.
export function clearRateLimit(key: string): void {
  windows.delete(key);
}
