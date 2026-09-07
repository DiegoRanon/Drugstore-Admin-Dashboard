import "server-only";

import { cache } from "react";

import { apiFetch } from "@/lib/api/client";
import type { PharmacyAddressInput } from "@/lib/schemas/organization";

import { requireAccessToken } from "./session";

/**
 * Mirrors the server's `organizationResponseSchema`.
 *
 * Written by hand rather than derived from `@/api/types`, because
 * `src/api/schema.d.ts` is generated from `openapi.json` and that dump needs a
 * running server. Re-run `npm run openapi:dump` (server) then `npm run
 * api:types` (here) and this can become a derived type like the rest.
 */
export type PharmacyProfile = {
  id: string;
  name: string;
  address: string | null;
  place_id: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  locale: string;
};

export const getOrganization = cache(async (): Promise<PharmacyProfile> => {
  const token = await requireAccessToken();
  return apiFetch<PharmacyProfile>("/v1/organization/", { token });
});

export async function updateOrganizationAddress(
  input: PharmacyAddressInput,
): Promise<PharmacyProfile> {
  const token = await requireAccessToken();

  return apiFetch<PharmacyProfile>("/v1/organization/", {
    method: "PATCH",
    token,
    body: input,
  });
}
