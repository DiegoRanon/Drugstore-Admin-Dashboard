/**
 * Named aliases over the generated OpenAPI schema.
 *
 * The server's spec declares every payload inline (`components.schemas` is
 * empty), so these aliases are the only readable handle on those shapes. They
 * are *derived*, never hand-written: regenerating `schema.d.ts` after a server
 * change surfaces the drift here as a type error instead of at runtime.
 */
import type { paths } from "./schema";

type OrderList =
  paths["/v1/orders/"]["get"]["responses"][200]["content"]["application/json"];

export type Order = OrderList["data"][number];
export type OrderDetail =
  paths["/v1/orders/{id}"]["get"]["responses"][200]["content"]["application/json"];

export type OrderStatus = Order["status"];
export type DeliveryWindow = Order["delivery_window"];
export type PaymentStatus = Order["payment_status"];
export type PaymentMethod = NonNullable<Order["payment_method"]>;

/** `pickup`, `complete`, `return`, and `handover` belong to the driver app. */
export type OrderTransition = OrderDetail["available_transitions"][number];
export type StatusEvent = OrderDetail["status_events"][number];

/** Label codes printed on the bags — no description field exists, by design. */
export type OrderPackage = OrderDetail["packages"][number];
export type PackageType = OrderPackage["package_type"];
export type FailureReason = NonNullable<OrderDetail["failure_reason"]>;
export type PaymentException = NonNullable<OrderDetail["payment_exception"]>;

/** Counts per day. No patient data, and not audit-logged server-side. */
export type CalendarMonth =
  paths["/v1/orders/calendar"]["get"]["responses"][200]["content"]["application/json"];
export type CalendarDay = CalendarMonth["days"][number];

export type CreateOrderBody =
  paths["/v1/orders/"]["post"]["requestBody"]["content"]["application/json"];
export type UpdateOrderBody =
  paths["/v1/orders/{id}"]["patch"]["requestBody"]["content"]["application/json"];

/**
 * Route optimization (`POST /v1/orders/route/optimize`).
 *
 * `orders` comes back in the order the driver will actually see it, which is
 * priority-first and only then the optimizer's sequence — the server re-reads
 * the queue rather than echoing the solver, so the dashboard and the driver
 * app cannot show different routes.
 */
export type OptimizeRouteBody =
  paths["/v1/orders/route/optimize"]["post"]["requestBody"]["content"]["application/json"];
export type OptimizeRouteResult =
  paths["/v1/orders/route/optimize"]["post"]["responses"][200]["content"]["application/json"];
export type RouteEstimate = NonNullable<OptimizeRouteResult["estimates"]>[number];

/** Address standardization, brokered by the server (the key never ships here). */
export type PlaceSuggestion =
  paths["/v1/places/autocomplete"]["get"]["responses"][200]["content"]["application/json"]["data"][number];
export type ResolvedPlace =
  paths["/v1/places/{place_id}"]["get"]["responses"][200]["content"]["application/json"];

export type Client =
  paths["/v1/clients/"]["get"]["responses"][200]["content"]["application/json"]["data"][number];
export type CreateClientBody =
  paths["/v1/clients/"]["post"]["requestBody"]["content"]["application/json"];

export type Driver =
  paths["/v1/drivers/"]["get"]["responses"][200]["content"]["application/json"]["data"][number];
/** Only the PATCH response carries `active_order_count`. */
export type DriverAfterUpdate =
  paths["/v1/drivers/{id}"]["patch"]["responses"][200]["content"]["application/json"];

export type InviteCode =
  paths["/v1/invites/"]["get"]["responses"][200]["content"]["application/json"]["data"][number];

export type SessionUser =
  paths["/v1/auth/login"]["post"]["responses"][200]["content"]["application/json"]["user"];
export type Organization =
  paths["/v1/auth/me"]["get"]["responses"][200]["content"]["application/json"]["organization"];

/** Every list endpoint pages the same way: keyset, no totals, opaque cursors. */
export type Paginated<T> = {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
};
