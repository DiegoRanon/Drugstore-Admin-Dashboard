import "server-only";

import type { PlaceSuggestion, ResolvedPlace } from "@/api/types";
import { apiFetch } from "@/lib/api/client";

import { requireAccessToken } from "./session";

/**
 * Address standardization, read through the delivery API.
 *
 * The provider key lives on the server and only there. This app's CSP is
 * `connect-src 'self'` (src/proxy.ts) and it has no NEXT_PUBLIC_* variable
 * anywhere — both deliberate — so the browser cannot call Google directly and
 * is not being asked to. It talks to a Route Handler, which talks to this,
 * which talks to the API. Same shape as the patient picker.
 *
 * Not `cache()`-wrapped, unlike the rest of the DAL: these are per-keystroke
 * reads whose whole purpose is to be different each time.
 */

export async function suggestPlaces(
  query: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const token = await requireAccessToken();

  const response = await apiFetch<{ data: PlaceSuggestion[] }>(
    "/v1/places/autocomplete",
    { token, query: { q: query, session_token: sessionToken } },
  );

  return response.data;
}

export async function resolvePlace(
  placeId: string,
  sessionToken: string,
): Promise<ResolvedPlace> {
  const token = await requireAccessToken();

  return apiFetch<ResolvedPlace>(`/v1/places/${encodeURIComponent(placeId)}`, {
    token,
    query: { session_token: sessionToken },
  });
}
