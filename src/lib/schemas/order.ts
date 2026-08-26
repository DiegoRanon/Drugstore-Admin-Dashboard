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
  delivery_date: z.string().regex(PLAIN_DATE),
  delivery_window: deliveryWindow,
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

export const createOrderSchema = orderFields.transform(normalize);

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
  .transform(normalize);

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
    phone_number: String(formData.get("phone_number") ?? ""),
    delivery_date: String(formData.get("delivery_date") ?? ""),
    delivery_window: String(formData.get("delivery_window") ?? "AM"),
    payment_status: String(formData.get("payment_status") ?? "unpaid"),
    amount_due: amount.length > 0 ? amount : null,
    requires_cooler_bag: formData.get("requires_cooler_bag") === "on",
    is_priority: formData.get("is_priority") === "on",
    packages,
  };
}
