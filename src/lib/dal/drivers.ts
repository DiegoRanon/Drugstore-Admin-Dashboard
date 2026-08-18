import "server-only";

import { cache } from "react";

import type { Driver, DriverAfterUpdate } from "@/api/types";
import { apiFetch } from "@/lib/api/client";
import { fetchAllPages, type Page } from "@/lib/api/pagination";

import { requireAccessToken } from "./session";

/**
 * Backs both the roster page and the assign dropdown. The roster is small and
 * changes rarely, so it is fetched whole and deduped per request — orders carry
 * `driver_id` only, and the board joins names against this list.
 */
export const listDrivers = cache(async (): Promise<Driver[]> => {
  const token = await requireAccessToken();

  return fetchAllPages<Driver>((cursor) =>
    apiFetch<Page<Driver>>("/v1/drivers/", {
      token,
      query: { limit: 200, cursor },
    }),
  );
});

export const getDriver = cache(async (id: string): Promise<Driver> => {
  const token = await requireAccessToken();
  return apiFetch<Driver>(`/v1/drivers/${id}`, { token });
});

/**
 * Deactivating revokes the driver's refresh tokens immediately. The response
 * reports `active_order_count` so the UI can prompt to reassign whatever was
 * left stranded — deactivation is deliberately not blocked by it (PRD 5.5).
 */
export async function setDriverActive(
  id: string,
  isActive: boolean,
): Promise<DriverAfterUpdate> {
  const token = await requireAccessToken();
  return apiFetch<DriverAfterUpdate>(`/v1/drivers/${id}`, {
    method: "PATCH",
    token,
    body: { is_active: isActive },
  });
}
