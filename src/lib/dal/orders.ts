import "server-only";

import { cache } from "react";

import type {
  CalendarMonth,
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
  /** Inclusive date range, an alternative to a single `date`. */
  from?: string;
  to?: string;
  status?: OrderStatus;
  driver_id?: string;
  client_id?: string;
  /** The API takes the string enum, not a boolean. */
  is_priority?: "true" | "false";
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

/** Server-side rule: accepted only while `scheduled` or `in_pharmacy`. */
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

/**
 * Staff declare the order physically packed: `scheduled` -> `in_pharmacy`.
 *
 * This is the step that makes an order visible to a driver at all — every
 * driver query excludes `scheduled` rows at the repository layer. It
 * deliberately does not require an assigned driver: staff pack the bags
 * whether or not dispatch has picked someone.
 */
export async function markOrderReady(id: string): Promise<Order> {
  const token = await requireAccessToken();
  return apiFetch<Order>(`/v1/orders/${id}/ready`, { method: "POST", token });
}

/** Refused on a terminal order with `409 ORDER_ALREADY_TERMINAL`. */
export async function setOrderPriority(
  id: string,
  isPriority: boolean,
): Promise<Order> {
  const token = await requireAccessToken();
  return apiFetch<Order>(`/v1/orders/${id}/priority`, {
    method: "POST",
    token,
    body: { is_priority: isPriority },
  });
}

/**
 * Per-day counts by status. Counts only, no patient data, and deliberately
 * **not** audit-logged server-side — recording it as a PII read would bury the
 * real accesses every time someone pages a month (privacy-rules.md 6). Unlike
 * `getOrder`, this one is safe to call freely.
 */
export const getCalendar = cache(
  async (from: string, to: string): Promise<CalendarMonth> => {
    const token = await requireAccessToken();
    return apiFetch<CalendarMonth>("/v1/orders/calendar", {
      token,
      query: { from, to },
    });
  },
);
