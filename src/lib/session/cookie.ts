import type { NextResponse } from "next/server";

/**
 * One cookie carries the whole session, sealed.
 *
 * `httpOnly` is the control that matters: browser JavaScript cannot read it, so
 * an XSS cannot exfiltrate a 30-day credential to patient data (PRD 4.2).
 *
 * `SameSite=Lax` rather than `Strict` so a link into the dashboard from an
 * email lands on the intended page instead of a login screen. Mutations go
 * through Server Actions (Origin-checked by Next) or Route Handlers that check
 * `Origin` themselves, so Lax costs nothing here.
 */
export const SESSION_COOKIE = "dsd_session";

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
} as const;

export function setSessionCookie(response: NextResponse, sealed: string): void {
  response.cookies.set(SESSION_COOKIE, sealed, SESSION_COOKIE_OPTIONS);
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
}
