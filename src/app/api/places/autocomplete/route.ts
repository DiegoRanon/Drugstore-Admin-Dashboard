import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/errors";
import { suggestPlaces } from "@/lib/dal/places";
import { getSession } from "@/lib/dal/session";

/**
 * Backs the address picker on the order and patient forms.
 *
 * Same arrangement as `api/clients/search`: a session-gated Route Handler so
 * the browser only ever talks to this origin. The provider key stays on the
 * delivery API, the CSP stays `connect-src 'self'`, and the employee's
 * keystrokes are not sent to a third party from a page we do not control.
 *
 * A provider outage is not an error here. The API already returns an empty
 * list in that case, and the address field stays typeable — an employee with
 * a patient on the phone must be able to finish taking the order.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const sessionToken =
    request.nextUrl.searchParams.get("session_token")?.trim() ?? "";

  // Nothing typed yet, or no billing session — either way there is nothing to
  // ask Google, and asking anyway would be a charge for an empty string.
  if (query.length === 0 || sessionToken.length === 0) {
    return NextResponse.json(
      { data: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    return NextResponse.json(
      { data: await suggestPlaces(query, sessionToken) },
      { headers: { "cache-control": "no-store" } },
    );
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
