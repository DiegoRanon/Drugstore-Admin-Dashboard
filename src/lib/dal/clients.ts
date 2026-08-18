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

const DIRECTORY_PAGE_SIZE = 25;
const DIRECTORY_MAX_PAGES = 20;

/**
 * The patient directory, accumulated across keyset pages.
 *
 * The list endpoint already returns `notes` and `compliance_reminder`, so the
 * management screen needs no per-patient detail call — which matters: `GET
 * /v1/clients/{id}` is audit-logged, and selecting rows in a list should not
 * write one accountability row per click (PRD 8.1). One `client.list.read` for
 * the page is honest; twenty `client.detail.read` rows for browsing are not.
 */
export async function getClientDirectory(
  options: { search?: string; includeInactive?: boolean },
  pages: number,
): Promise<{ clients: Client[]; hasMore: boolean }> {
  const wanted = Math.min(Math.max(pages, 1), DIRECTORY_MAX_PAGES);
  const clients: Client[] = [];
  let cursor: string | undefined;
  let hasMore = false;

  for (let page = 0; page < wanted; page += 1) {
    const result = await listClients(
      {
        search: options.search,
        is_active: options.includeInactive ? undefined : "true",
        limit: DIRECTORY_PAGE_SIZE,
      },
      cursor,
    );

    clients.push(...result.data);

    if (!result.has_more || !result.next_cursor) {
      hasMore = false;
      break;
    }

    hasMore = true;
    cursor = result.next_cursor;
  }

  return { clients, hasMore };
}

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
