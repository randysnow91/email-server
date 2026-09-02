// The app's public origin. NEXT_PUBLIC_APP_URL must point at the deployed
// origin in production (set it in Render's environment variables) - used
// for unsubscribe links in sent email AND for redirects built in the
// middleware / logout route, because behind Render's proxy `request.url`
// is the internal address (localhost:10000), not the real domain.
export function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, ""); // no trailing slash
}

export function unsubscribeUrl(token: string): string {
  return `${appOrigin()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

// Tokenless unsubscribe page - used for test sends, where there is no real
// subscriber. The page shows a "this link is missing its code" message.
export function unsubscribePageUrl(): string {
  return `${appOrigin()}/unsubscribe`;
}
