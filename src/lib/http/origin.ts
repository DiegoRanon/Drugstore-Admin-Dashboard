import type { NextRequest } from "next/server";

/**
 * Takes the first entry of a proxy header.
 *
 * Each hop appends to `x-forwarded-*`, so the list reads oldest-first and the
 * head is what the browser itself used.
 */
function forwarded(request: NextRequest, header: string): string | null {
  const raw = request.headers.get(header);
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * Server Actions get CSRF protection from Next's built-in Origin check. A
 * hand-written Route Handler that mutates does not, so it has to do this
 * itself (PRD 4.2).
 *
 * Compared against the *forwarded* origin rather than `request.nextUrl.origin`.
 * Behind a TLS-terminating proxy — which is every deployed environment — the
 * request reaches this process as plain HTTP on an internal port, so
 * `nextUrl.origin` reports a scheme, and sometimes a host, that the browser
 * never used. Comparing against it rejects every legitimate login with a 403
 * while working perfectly in local development, where there is no proxy to
 * disagree with.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  // Same-origin form posts and fetches from our own pages always send Origin.
  // A missing header means a non-browser client, which we refuse rather than
  // guess about.
  if (!origin) return false;

  const host = forwarded(request, "x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;

  // No proxy in front means no forwarded scheme, and the request's own is then
  // the one the browser used.
  const protocol =
    forwarded(request, "x-forwarded-proto") ?? request.nextUrl.protocol.replace(/:$/, "");

  try {
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}
