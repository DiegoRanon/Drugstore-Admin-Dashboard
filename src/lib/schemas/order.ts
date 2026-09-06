import { z } from "zod";

import type { CreateOrderBody, UpdateOrderBody } from "@/api/types";

/**
 * Mirrored from the server's request schemas (`openapi.json`), not invented
 * here. Field lengths and bounds match the API exactly so a form rejects what
 * the server would reject — a 422 the user could have been warned about is a
 * bug, not an error state.
 *
 * There is no medical, pharmaceutical, or prescription field anywhere in here.
 * The API has nowhere to put such data and the UI must not invite it (MVP §4).
 */

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLAIN_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const MAX_AMOUNT = 99_999_999.99;
const MAX_PACKAGES = 50;

/** Accepts `24,50` as well as `24.50`: this is a French-Canadian product. */
const money = z
  .string()
  .trim()
  .transform((value) => Number(value.replace(",", ".")))
  .refine((amount) => Number.isFinite(amount) && amount >= 0 && amount <= MAX_AMOUNT, {
    message: "invalid_amount",
  });

export const deliveryWindow = z.enum(["AM", "PM"]);
export const paymentStatus = z.enum(["paid", "unpaid"]);
export const packageType = z.enum(["bag", "cooler", "tote", "envelope"]);

/**
 * What is printed on the bag, and what kind of bag it is.
 *
 * A closed enum and a label code, and nothing else: `order_packages` has no
 * description or notes column by design, because a free-text line item is
 * exactly where a medication name would end up (privacy-rules.md §3).
 */
const packageRow = z.object({
  label_code: z.string().trim().min(1).max(32),
  package_type: packageType,
});

/**
 * The shared field set. Create and edit are both built from this so they cannot
 * drift; `.transform()` returns a pipe in Zod v4, which is why the raw object
 * lives on its own rather than being unwrapped later.
 */
const orderFields = z.object({
  client_id: z.string().uuid(),
  /** Dispatch may pick the driver while creating; `null` leaves it unassigned. */
  driver_id: z.string().uuid().nullable(),
  patient_name: z.string().trim().min(1).max(255),
  address: z.string().trim().min(1).max(500),
  phone_number: z.string().trim().min(1).max(50),
  /**
   * Captured from Places when the employee picked a suggestion. All four
   * travel together or not at all — the server pairs them with a CHECK
   * constraint, and half a coordinate routes to the wrong hemisphere.
   */
  place_id: z.string().trim().min(1).max(255).nullable(),
  formatted_address: z.string().trim().min(1).max(500).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  delivery_date: z.string().regex(PLAIN_DATE),
  delivery_window: deliveryWindow,
  /** An explicit promise — "between 2 and 4". Both ends or neither. */
  requested_time_start: z.string().regex(PLAIN_TIME).nullable(),
  requested_time_end: z.string().regex(PLAIN_TIME).nullable(),
  payment_status: paymentStatus,
  amount_due: money.nullish(),
  requires_cooler_bag: z.boolean(),
  is_priority: z.boolean(),
  packages: z.array(packageRow).max(MAX_PACKAGES),
});

/**
 * Two rules the server also enforces, applied here so the form and the API
 * cannot disagree about what was just saved.
 *
 * - Nothing is owed at the door on an order already paid for, and sending a
 *   stale figure would show the driver an amount to collect.
 * - A `cooler` package forces `requires_cooler_bag`; the two cannot drift.
 */
function normalize<
  T extends {
    payment_status?: "paid" | "unpaid";
    amount_due?: number | null;
    requires_cooler_bag?: boolean;
    packages?: { package_type: z.infer<typeof packageType> }[];
  },
>(order: T) {
  const hasCoolerPackage =
    order.packages?.some((row) => row.package_type === "cooler") ?? false;

  return {
    ...order,
    requires_cooler_bag: (order.requires_cooler_bag ?? false) || hasCoolerPackage,
    amount_due: order.payment_status === "paid" ? null : (order.amount_due ?? null),
  };
}

/**
 * The two cross-field rules the server also enforces, checked here so the
 * employee sees a field error rather than a 422 after the round trip.
 */
function checkRanges(
  order: {
    requested_time_start?: string | null;
    requested_time_end?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  const start = order.requested_time_start ?? null;
  const end = order.requested_time_end ?? null;

  if (start !== null || end !== null) {
    if (start === null || end === null) {
      ctx.addIssue({
        code: "custom",
        path: [start ? "requested_time_end" : "requested_time_start"],
        message: "time_range_incomplete",
      });
    } else if (start >= end) {
      ctx.addIssue({
        code: "custom",
        path: ["requested_time_end"],
        message: "time_range_inverted",
      });
    }
  }

  const hasLat = order.latitude !== undefined && order.latitude !== null;
  const hasLng = order.longitude !== undefined && order.longitude !== null;
  if (hasLat !== hasLng) {
    ctx.addIssue({
      code: "custom",
      path: ["address"],
      message: "coordinates_unpaired",
    });
  }
}

export const createOrderSchema = orderFields
  .superRefine(checkRanges)
  .transform(normalize);

/**
 * The server accepts a PATCH while the order is `scheduled` or `in_pharmacy`.
 *
 * `driver_id` is omitted: reassignment has its own endpoint. `packages` is not
 * merged but **replaced wholesale**, so the edit form has to submit the full
 * current list — an empty array really does mean "no packages".
 */
export const updateOrderSchema = orderFields
  .omit({ client_id: true, driver_id: true })
  .partial()
  .superRefine(checkRanges)
  .transform(normalize);

/**
 * A dashboard-initiated optimization run.
 *
 * `time_range` is a run-level default the server applies only to stops with no
 * promise of their own — it narrows an unscheduled afternoon, it does not
 * re-promise a delivery a patient was already given a time for.
 */
export const optimizeRouteSchema = z
  .object({
    date: z.string().regex(PLAIN_DATE),
    driver_id: z.string().uuid(),
    time_range: z
      .object({
        start: z.string().regex(PLAIN_TIME),
        end: z.string().regex(PLAIN_TIME),
      })
      .nullish()
      .transform((range) => range ?? undefined),
  })
  .refine(
    (input) => !input.time_range || input.time_range.start < input.time_range.end,
    { path: ["time_range"], message: "time_range_inverted" },
  );

export const assignDriverSchema = z.object({
  order_id: z.string().uuid(),
  /** `null` unassigns. */
  driver_id: z.string().uuid().nullable(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/**
 * These schemas are a hand-written mirror of the server's, so nothing stops
 * them drifting from the generated types the way they did when the lifecycle
 * changed. These two lines are the check: if a field here stops being something
 * the API accepts, `npm run typecheck` fails instead of a user collecting a 422.
 */
type Assert<T extends true> = T;

export type CreateMatchesContract = Assert<
  CreateOrderInput extends CreateOrderBody ? true : false
>;
export type UpdateMatchesContract = Assert<
  UpdateOrderInput extends UpdateOrderBody ? true : false
>;

/** Shared by the drawer and the full page so they cannot drift apart. */
export function orderFormFromFormData(formData: FormData) {
  const amount = String(formData.get("amount_due") ?? "").trim();
  const driverId = String(formData.get("driver_id") ?? "").trim();

  /** An empty hidden input is "not set", not an empty address. */
  const text = (field: string): string | null => {
    const value = String(formData.get(field) ?? "").trim();
    return value.length > 0 ? value : null;
  };

  /**
   * The geocode the address picker resolved. Read as a unit: if either half
   * of the coordinate is missing the whole geocode is dropped, because a
   * half-resolved address is one the server would reject and one the router
   * could not use anyway.
   */
  const latitude = Number(formData.get("address_latitude") ?? "");
  const longitude = Number(formData.get("address_longitude") ?? "");
  const located =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    String(formData.get("address_latitude") ?? "").trim().length > 0;

  // Package rows travel as two parallel repeated fields, paired by index. That
  // keeps the form inside its plain uncontrolled-FormData model rather than
  // smuggling JSON through a hidden input.
  const labelCodes = formData.getAll("package_label_code").map(String);
  const packageTypes = formData.getAll("package_type").map(String);
  const packages = labelCodes
    .map((labelCode, index) => ({
      label_code: labelCode.trim(),
      package_type: packageTypes[index] ?? "bag",
    }))
    // A row with no label code is a row the user added and left blank.
    .filter((row) => row.label_code.length > 0);

  return {
    client_id: String(formData.get("client_id") ?? ""),
    driver_id: driverId.length > 0 ? driverId : null,
    patient_name: String(formData.get("patient_name") ?? ""),
    address: String(formData.get("address") ?? ""),
    place_id: located ? text("address_place_id") : null,
    formatted_address: located ? text("address_formatted") : null,
    latitude: located ? latitude : null,
    longitude: located ? longitude : null,
    phone_number: String(formData.get("phone_number") ?? ""),
    delivery_date: String(formData.get("delivery_date") ?? ""),
    delivery_window: String(formData.get("delivery_window") ?? "AM"),
    requested_time_start: text("requested_time_start"),
    requested_time_end: text("requested_time_end"),
    payment_status: String(formData.get("payment_status") ?? "unpaid"),
    amount_due: amount.length > 0 ? amount : null,
    requires_cooler_bag: formData.get("requires_cooler_bag") === "on",
    is_priority: formData.get("is_priority") === "on",
    packages,
  };
}
