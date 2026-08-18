import type { Paginated } from "@/api/types";

import { ApiError, ERROR_CODES } from "./errors";

/**
 * Every list endpoint is keyset-paginated: `{ data, next_cursor, has_more }`,
 * with no page numbers and no total count. That is deliberate — pages stay
 * stable while orders are created all day — and it constrains the UI:
 *
 * - no "Page 3 of 12", no jump-to-page, no "247 results"
 * - "Load more" or infinite scroll instead
 * - cursors are opaque; never parse one, never build one
 */
export type Page<T> = Paginated<T>;

/**
 * A stale or malformed cursor answers `INVALID_CURSOR`. The only sane recovery
 * is to drop it and refetch from the start rather than showing an error the
 * user cannot act on.
 */
export async function fetchPageWithCursorRecovery<T>(
  fetchPage: (cursor?: string) => Promise<Page<T>>,
  cursor?: string,
): Promise<Page<T>> {
  try {
    return await fetchPage(cursor);
  } catch (error) {
    if (
      cursor &&
      error instanceof ApiError &&
      error.code === ERROR_CODES.invalidCursor
    ) {
      return fetchPage(undefined);
    }
    throw error;
  }
}

/**
 * Walks every page. Only for small, bounded collections the UI genuinely needs
 * whole — the driver roster, invite codes. Never for orders or clients.
 */
export async function fetchAllPages<T>(
  fetchPage: (cursor?: string) => Promise<Page<T>>,
  maxPages = 10,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor);
    items.push(...result.data);
    if (!result.has_more || !result.next_cursor) break;
    cursor = result.next_cursor;
  }

  return items;
}
