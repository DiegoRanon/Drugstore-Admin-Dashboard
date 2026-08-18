import "server-only";

import { cache } from "react";

import type {
  CreateOrderBody,
  Order,
  OrderDetail,
  OrderStatus,
  UpdateOrderBody,
} from "@/api/types";
import { apiFetch } from "@/lib/api/client";
import { fetchPageWithCursorRecovery, type Page } from "@/lib/api/pagination";

import { requireAccessToken } from "./session";

export type OrderFilters = {
  date?: string;
  status?: OrderStatus;
  driver_id?: string;
  client_id?: string;
  updated_since?: string;
  limit?: number;
};

export async function listOrders(
  filters: OrderFilters = {},
  cursor?: string,
): Promise<Page<Order>> {
  const token = await requireAccessToken();

  return fetchPageWithCursorRecovery<Order>(
    (next) =>
      apiFetch<Page<Order>>("/v1/orders/", {
        token,
        query: { ...filters, cursor: next },
      }),
    cursor,
  );
}

/** The board: one day, both windows, newest state. */
export const getOrdersForDate = cache(async (date: string): Promise<Order[]> => {
  const page = await listOrders({ date, limit: 200 });
  return page.data;
});

const HISTORY_PAGE_SIZE = 50;
/** Bounds the work behind a "load more" that someone leans on. */
const HISTORY_MAX_PAGES = 20;

/**
 * The history view's "load more", server-side.
 *
 * Pagination is keyset — `{ data, next_cursor, has_more }`, no page numbers and
 * no total count — so accumulating means walking the cursors. The page count
 * lives in the URL and the walk is redone on each request, which keeps every
 * row rendered on the server instead of shipping order JSON to the browser to
 * be appended there.
 *
 * Cursors stay opaque throughout: never parsed, never constructed.
 */
export async function getOrderHistory(
  filters: OrderFilters,
  pages: number,
): Promise<{ orders: Order[]; hasMore: boolean; pageSize: number }> {
  const wanted = Math.min(Math.max(pages, 1), HISTORY_MAX_PAGES);
  const orders: Order[] = [];
  let cursor: string | undefined;
  let hasMore = false;

  for (let page = 0; page < wanted; page += 1) {
    const result = await listOrders({ ...filters, limit: HISTORY_PAGE_SIZE }, cursor);
    orders.push(...result.data);

    if (!result.has_more || !result.next_cursor) {
      hasMore = false;
      break;
    }

    hasMore = true;
    cursor = result.next_cursor;
  }

  return { orders, hasMore, pageSize: HISTORY_PAGE_SIZE };
}

/**
 * Audit-logged on the server: every call writes a row recording who read this
 * patient's information. Never call it speculatively, and never let `<Link>`
 * prefetch a route that calls it (PRD 8.1).
 */
export const getOrder = cache(async (id: string): Promise<OrderDetail> => {
  const token = await requireAccessToken();
  return apiFetch<OrderDetail>(`/v1/orders/${id}`, { token });
});

export async function createOrder(
  body: CreateOrderBody,
  idempotencyKey?: string,
): Promise<Order> {
  const token = await requireAccessToken();
  return apiFetch<Order>("/v1/orders/", {
    method: "POST",
    token,
    body,
    idempotencyKey,
  });
}

/** Server-side rule: accepted only while the order is `in_pharmacy`. */
export async function updateOrder(id: string, body: UpdateOrderBody): Promise<Order> {
  const token = await requireAccessToken();
  return apiFetch<Order>(`/v1/orders/${id}`, { method: "PATCH", token, body });
}

/** `null` unassigns. */
export async function assignDriver(
  id: string,
  driverId: string | null,
): Promise<Order> {
  const token = await requireAccessToken();
  return apiFetch<Order>(`/v1/orders/${id}/assign`, {
    method: "POST",
    token,
    body: { driver_id: driverId },
  });
}

export async function cancelOrder(id: string): Promise<Order> {
  const token = await requireAccessToken();
  return apiFetch<Order>(`/v1/orders/${id}/cancel`, { method: "POST", token });
}
