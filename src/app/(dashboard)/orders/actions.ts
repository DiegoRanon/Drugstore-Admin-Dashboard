"use server";

import { revalidatePath } from "next/cache";

import type { Order } from "@/api/types";
import {
  assignDriverSchema,
  createOrderSchema,
  orderFormFromFormData,
  updateOrderSchema,
} from "@/lib/schemas/order";
import {
  fieldErrorsOf,
  invalid,
  succeed,
  toFailure,
  type ActionResult,
} from "@/lib/actions/result";
import {
  assignDriver,
  cancelOrder,
  createOrder,
  getOrder,
  updateOrder,
} from "@/lib/dal/orders";
import { requireSession } from "@/lib/dal/session";

/**
 * Order mutations.
 *
 * Every action re-verifies the session before acting. Server Functions are POST
 * requests to the route where they are used rather than routes of their own, so
 * a proxy matcher edit can silently remove their coverage — the check belongs
 * here, not upstream. Next's own Origin check gives these CSRF protection.
 */

/** The board, the history view, and the order's own page all go stale. */
function revalidateOrderViews(id?: string) {
  revalidatePath("/");
  revalidatePath("/orders");
  if (id) revalidatePath(`/orders/${id}`);
}

export async function createOrderAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; patientName: string }>> {
  await requireSession();

  const parsed = createOrderSchema.safeParse(orderFormFromFormData(formData));
  if (!parsed.success) {
    return invalid(fieldErrorsOf(parsed.error));
  }

  try {
    const order = await createOrder(parsed.data);
    revalidateOrderViews();
    return succeed({ id: order.id, patientName: order.patient_name });
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateOrderAction(
  orderId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireSession();

  const parsed = updateOrderSchema.safeParse(orderFormFromFormData(formData));
  if (!parsed.success) {
    return invalid(fieldErrorsOf(parsed.error));
  }

  try {
    // The server refuses a PATCH outside `in_pharmacy` with a 422. The UI
    // disables the control long before this, but a stale tab can still get
    // here, and the refusal must surface rather than fail silently.
    const order = await updateOrder(orderId, parsed.data);
    revalidateOrderViews(orderId);
    return succeed({ id: order.id });
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Assignment is the main action of the morning, so it is the one place an
 * optimistic update is appropriate: the server has no rule that can refuse a
 * reassignment of an open order (PRD 6.5).
 */
export async function assignDriverAction(
  orderId: string,
  driverId: string | null,
): Promise<ActionResult<{ driverId: string | null }>> {
  await requireSession();

  const parsed = assignDriverSchema.safeParse({ order_id: orderId, driver_id: driverId });
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));

  try {
    const order = await assignDriver(parsed.data.order_id, parsed.data.driver_id);
    revalidateOrderViews(orderId);
    return succeed({ driverId: order.driver_id });
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Cancel is deliberately **not** optimistic. The server may legitimately refuse
 * with `409 ORDER_INVALID_TRANSITION` because a driver picked the package up
 * while the dialog was open — so the truth is refetched and shown rather than
 * assumed (PRD 6.5).
 */
export async function cancelOrderAction(
  orderId: string,
): Promise<ActionResult<{ status: Order["status"] }>> {
  await requireSession();

  try {
    const order = await cancelOrder(orderId);
    revalidateOrderViews(orderId);
    return succeed({ status: order.status });
  } catch (error) {
    const failure = toFailure(error);

    // Tell the user what the order actually is now, not just that it failed.
    if (failure.code === "ORDER_INVALID_TRANSITION") {
      revalidateOrderViews(orderId);
      try {
        const fresh = await getOrder(orderId);
        return { ...failure, fieldErrors: { status: [fresh.status] } };
      } catch {
        return failure;
      }
    }

    return failure;
  }
}

