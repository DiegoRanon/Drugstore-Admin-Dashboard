import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/errors";
import { resolvePlace } from "@/lib/dal/places";
import { getSession } from "@/lib/dal/session";

/**
 * Turns the suggestion an employee clicked into a standardized address and a
 * coordinate, and closes the billing session opened by the autocomplete calls.
 *
 * Unlike the suggestion endpoint this reports failure, because it runs after a
 * deliberate choice: silently returning nothing would leave the form refusing
 * to fill in with no indication why. The picker falls back to the text the
 * employee already typed, so the order still saves — just without coordinates.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const placeId = request.nextUrl.searchParams.get("place_id")?.trim() ?? "";
  const sessionToken =
    request.nextUrl.searchParams.get("session_token")?.trim() ?? "";

  if (placeId.length === 0 || sessionToken.length === 0) {
    return NextResponse.json({ code: "VALIDATION_FAILED" }, { status: 400 });
  }

  try {
    return NextResponse.json(await resolvePlace(placeId, sessionToken), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { code: error.code, request_id: error.requestId },
        { status: error.status },
      );
    }
    return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
  }
}
