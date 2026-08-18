import "server-only";

import { cache } from "react";

import type { Client, CreateClientBody } from "@/api/types";
import { apiFetch } from "@/lib/api/client";
import {
  fetchPageWithCursorRecovery,
  type Page,
} from "@/lib/api/pagination";

import { requireAccessToken } from "./session";

export async function listClients(
  options: { search?: string; is_active?: "true" | "false"; limit?: number } = {},
  cursor?: string,
): Promise<Page<Client>> {
  const token = await requireAccessToken();

  return fetchPageWithCursorRecovery<Client>(
    (next) =>
      apiFetch<Page<Client>>("/v1/clients/", {
        token,
        query: { ...options, cursor: next },
      }),
    cursor,
  );
}

/** Audit-logged, like order detail. Do not prefetch routes that call this. */
export const getClient = cache(async (id: string): Promise<Client> => {
  const token = await requireAccessToken();
  return apiFetch<Client>(`/v1/clients/${id}`, { token });
});

export async function createClient(body: CreateClientBody): Promise<Client> {
  const token = await requireAccessToken();
  return apiFetch<Client>("/v1/clients/", { method: "POST", token, body });
}

export async function updateClient(
  id: string,
  body: Partial<CreateClientBody> & { is_active?: boolean },
): Promise<Client> {
  const token = await requireAccessToken();
  return apiFetch<Client>(`/v1/clients/${id}`, { method: "PATCH", token, body });
}

/**
 * Soft delete — the server sets `is_active = false` and keeps history. The UI
 * says "Deactivate" because that is what actually happens (PRD 5.4).
 */
export async function deactivateClient(id: string): Promise<void> {
  const token = await requireAccessToken();
  await apiFetch<void>(`/v1/clients/${id}`, { method: "DELETE", token });
}
