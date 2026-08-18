import { NextResponse } from "next/server";

/**
 * Keeps the idle clock honest while someone is working without navigating.
 *
 * The route body does nothing. `lastSeenAt` lives in the sealed cookie, and
 * only `proxy.ts` can rewrite it — this endpoint exists so there is a cheap
 * request for proxy to act on. It deliberately sits outside `/api/auth`, which
 * the proxy matcher excludes.
 */
export async function GET() {
  return new NextResponse(null, { status: 204 });
}
