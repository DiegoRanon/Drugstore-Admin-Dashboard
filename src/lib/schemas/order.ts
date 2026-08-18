import { z } from "zod";

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

/**
 * The shared field set. Create and edit are both built from this so they cannot
 * drift; `.transform()` returns a pipe in Zod v4, which is why the raw object
 * lives on its own rather than being unwrapped later.
 */
const orderFields = z.object({
  client_id: z.string().uuid(),
  patient_name: z.string().trim().min(1).max(255),
  address: z.string().trim().min(1).max(500),
  phone_number: z.string().trim().min(1).max(50),
  delivery_date: z.string().regex(PLAIN_DATE),
  delivery_window: deliveryWindow,
  payment_status: paymentStatus,
  amount_due: money.nullish(),
  requires_cooler_bag: z.boolean(),
});

/**
 * Nothing is owed at the door on an order already paid for, and sending a stale
 * figure would show the driver an amount to collect.
 */
function clearAmountWhenPaid<T extends { payment_status?: "paid" | "unpaid"; amount_due?: number | null }>(
  order: T,
) {
  return {
    ...order,
    amount_due: order.payment_status === "paid" ? null : (order.amount_due ?? null),
  };
}

export const createOrderSchema = orderFields.transform(clearAmountWhenPaid);

/** The server accepts a PATCH only while the order is `in_pharmacy`. */
export const updateOrderSchema = orderFields
  .omit({ client_id: true })
  .partial()
  .transform(clearAmountWhenPaid);

export const assignDriverSchema = z.object({
  order_id: z.string().uuid(),
  /** `null` unassigns. */
  driver_id: z.string().uuid().nullable(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/** Shared by the drawer and the full page so they cannot drift apart. */
export function orderFormFromFormData(formData: FormData) {
  const amount = String(formData.get("amount_due") ?? "").trim();

  return {
    client_id: String(formData.get("client_id") ?? ""),
    patient_name: String(formData.get("patient_name") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone_number: String(formData.get("phone_number") ?? ""),
    delivery_date: String(formData.get("delivery_date") ?? ""),
    delivery_window: String(formData.get("delivery_window") ?? "AM"),
    payment_status: String(formData.get("payment_status") ?? "unpaid"),
    amount_due: amount.length > 0 ? amount : null,
    requires_cooler_bag: formData.get("requires_cooler_bag") === "on",
  };
}
