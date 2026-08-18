import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, retryAfterSeconds } from "@/lib/api/errors";
import { fetchCurrentUserWithToken, login } from "@/lib/dal/auth";
import { isSameOrigin } from "@/lib/http/origin";
import { setSessionCookie } from "@/lib/session/cookie";
import { sealSession } from "@/lib/session/seal";
import type { Session } from "@/lib/session/types";

/**
 * Login lives in a Route Handler rather than a Server Action because it has to
 * set a cookie on the response, and Server Components cannot.
 */

const LoginBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "INVALID_ORIGIN" }, { status: 403 });
  }

  const parsed = LoginBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_CREDENTIALS" }, { status: 400 });
  }

  try {
    const result = await login(parsed.data.email, parsed.data.password);

    // A driver's credentials are valid but this dashboard is not for them.
    // Sign them in anyway so proxy can show the "use the mobile app" screen
    // rather than pretending the password was wrong.
    const { organization } = await fetchCurrentUserWithToken(result.access_token);

    const session: Session = {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      accessExpiresAt: Date.now() + result.expires_in * 1000,
      lastSeenAt: Date.now(),
      user: result.user,
      organization,
    };

    const response = NextResponse.json({ role: result.user.role });
    setSessionCookie(response, await sealSession(session));
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          code: error.code,
          // Both 429 shapes are normalized to seconds here so the form does not
          // have to know which limiter answered.
          retry_after_seconds: retryAfterSeconds(error),
          request_id: error.requestId,
        },
        { status: error.status },
      );
    }

    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
  }
}
