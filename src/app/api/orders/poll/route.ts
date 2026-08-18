import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/errors";
import { listOrders } from "@/lib/dal/orders";
import { getSession } from "@/lib/dal/session";

/**
 * Change detection for the board.
 *
 * The server has no WebSocket layer, so the documented approach is polling
 * `?updated_since=` — and because every write bumps `updated_at` through a
 * database trigger, it cannot miss a change (PRD 6.4).
 *
 * **This endpoint returns no patient data.** Only a count and a timestamp. The
 * board itself is re-rendered on the server when the count is non-zero, which
 * keeps patient names and addresses out of the browser's JavaScript entirely —
 * the reason this project uses server rendering in the first place (PRD 2.1).
 *
 * No `date` filter: an order edited onto or off a given day would otherwise slip
 * through the filter and leave the board stale.
 */
export async function GET(request: NextRequest) {
  // Authoritative check. Proxy is optimistic and a matcher edit could skip it.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const since = request.nextUrl.searchParams.get("since");
  if (!since || Number.isNaN(Date.parse(since))) {
    return NextResponse.json({ code: "INVALID_SINCE" }, { status: 400 });
  }

  try {
    const page = await listOrders({ updated_since: since, limit: 200 });

    return NextResponse.json(
      { changed: page.data.length, at: new Date().toISOString() },
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
