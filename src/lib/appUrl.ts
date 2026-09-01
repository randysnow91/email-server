// Absolute URLs for links that leave the app (i.e. land in an email).
// NEXT_PUBLIC_APP_URL must point at the deployed origin in production
// (set it in Render's environment variables) - unsubscribe links in sent
// email are only correct if this is right.

function origin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, ""); // no trailing slash
}

export function unsubscribeUrl(token: string): string {
  return `${origin()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

// Tokenless unsubscribe page - used for test sends, where there is no real
// subscriber. The page shows a "this link is missing its code" message.
export function unsubscribePageUrl(): string {
  return `${origin()}/unsubscribe`;
}
