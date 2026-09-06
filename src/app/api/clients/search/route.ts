import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/errors";
import { listClients } from "@/lib/dal/clients";
import { getSession } from "@/lib/dal/session";

/**
 * Backs the patient picker in the quick-add drawer.
 *
 * Fetched on demand rather than preloaded into the page. The trigger sits in
 * the sidebar on every screen, so preloading would serialize the whole patient
 * list into the HTML payload of pages that never open the drawer — PII exposed
 * for no reason (PRD 3.1).
 *
 * Returns only what the picker renders, plus the saved geocode the order form
 * inherits. `notes` in particular stays server-side; it is not needed to
 * choose a patient.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  try {
    const page = await listClients({
      // The picker offers active patients only: a deactivated one must not
      // become the target of a new delivery.
      is_active: "true",
      search: query.length > 0 ? query : undefined,
      limit: 20,
    });

    return NextResponse.json(
      {
        data: page.data.map((client) => ({
          id: client.id,
          name: client.name,
          address: client.address,
          phone_number: client.phone_number,
          place_id: client.place_id,
          formatted_address: client.formatted_address,
          latitude: client.latitude,
          longitude: client.longitude,
        })),
      },
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
