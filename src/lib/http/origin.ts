import type { NextRequest } from "next/server";

/**
 * Server Actions get CSRF protection from Next's built-in Origin check. A
 * hand-written Route Handler that mutates does not, so it has to do this
 * itself (PRD 4.2).
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  // Same-origin form posts and fetches from our own pages always send Origin.
  // A missing header means a non-browser client, which we refuse rather than
  // guess about.
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}
