import "server-only";

import { cache } from "react";

import type { InviteCode } from "@/api/types";
import { apiFetch } from "@/lib/api/client";

import { requireAccessToken } from "./session";

/** Invites are not keyset-paginated — the endpoint takes `limit` only. */
export const listInvites = cache(
  async (options: { is_active?: "true" | "false"; limit?: number } = {}) => {
    const token = await requireAccessToken();
    const result = await apiFetch<{ data: InviteCode[] }>("/v1/invites/", {
      token,
      query: { limit: 200, ...options },
    });
    return result.data;
  },
);

export async function createInvite(expiresAt?: string): Promise<InviteCode> {
  const token = await requireAccessToken();
  return apiFetch<InviteCode>("/v1/invites/", {
    method: "POST",
    token,
    body: expiresAt ? { expires_at: expiresAt } : {},
  });
}

/**
 * Only an unredeemed code can be revoked; the server answers 409 otherwise.
 * Revoking would not remove a driver the code already created, so the UI points
 * at the roster instead (PRD 5.6).
 */
export async function revokeInvite(id: string): Promise<void> {
  const token = await requireAccessToken();
  await apiFetch<void>(`/v1/invites/${id}`, { method: "DELETE", token });
}
