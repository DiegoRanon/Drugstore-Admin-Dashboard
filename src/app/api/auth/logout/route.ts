import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { logout } from "@/lib/dal/auth";
import { isSameOrigin } from "@/lib/http/origin";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/session/cookie";
import { unsealSession } from "@/lib/session/seal";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "INVALID_ORIGIN" }, { status: 403 });
  }

  const store = await cookies();
  const session = await unsealSession(store.get(SESSION_COOKIE)?.value);

  if (session) {
    try {
      // Revoke server-side first. Clearing the cookie alone would leave a valid
      // 30-day credential alive on the server (PRD 8.4).
      await logout(session.refreshToken);
    } catch {
      // An already-revoked or unreachable token must not trap the user in a
      // signed-in UI. Clear the cookie regardless.
    }
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
