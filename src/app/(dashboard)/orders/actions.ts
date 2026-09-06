"use server";

import { revalidatePath } from "next/cache";

import type { Order, OptimizeRouteResult } from "@/api/types";
import {
  assignDriverSchema,
  createOrderSchema,
  optimizeRouteSchema,
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
  markOrderReady,
  optimizeRoute,
  setOrderPriority,
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
  revalidatePath("/calendar");
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

/**
 * The step that releases an order to a driver: `scheduled` -> `in_pharmacy`.
 *
 * Deliberately **not** optimistic, for the same reason as `cancelOrderAction`:
 * another admin may have cancelled the order while this page sat open, and
 * guessing would tell staff a package is on the counter when it is not.
 */
export async function markReadyAction(
  orderId: string,
): Promise<ActionResult<{ status: Order["status"] }>> {
  await requireSession();

  try {
    const order = await markOrderReady(orderId);
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

/**
 * The morning batch: staff pack a counter full of bags and declare them ready
 * together.
 *
 * There is no bulk endpoint, so this is N sequential calls. Partial failure is
 * reported rather than swallowed — some of the batch reaching the drivers and
 * some not is exactly the situation staff must be told about. Sequential
 * rather than parallel because the API allows 100 requests per minute per
 * user and a large morning is the one place that could bite.
 */
const MAX_BULK_READY = 50;

export async function markAllReadyAction(
  orderIds: string[],
): Promise<ActionResult<{ succeeded: number; failed: { id: string; code: string }[] }>> {
  await requireSession();

  if (orderIds.length === 0 || orderIds.length > MAX_BULK_READY) {
    return invalid({ form: ["invalid_batch"] });
  }

  let succeeded = 0;
  const failed: { id: string; code: string }[] = [];

  for (const id of orderIds) {
    try {
      await markOrderReady(id);
      succeeded += 1;
    } catch (error) {
      failed.push({ id, code: toFailure(error).code });
    }
  }

  revalidateOrderViews();
  return succeed({ succeeded, failed });
}

/**
 * Priority is optimistic like assignment: the server refuses only on a
 * terminal order (`409 ORDER_ALREADY_TERMINAL`), and the UI does not offer the
 * control there.
 */
export async function setPriorityAction(
  orderId: string,
  isPriority: boolean,
): Promise<ActionResult<{ isPriority: boolean }>> {
  await requireSession();

  try {
    const order = await setOrderPriority(orderId, isPriority);
    revalidateOrderViews(orderId);
    return succeed({ isPriority: order.is_priority });
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Sequences a driver's day from the dashboard (Route Optimizer).
 *
 * The pharmacy runs this before the driver leaves, so the stop order is on the
 * packing counter's screen at pickup rather than something the driver has to
 * ask for once they are already out. The driver can still re-run it, or
 * reorder by hand, from their own app — whichever ran last wins, which is the
 * intent, since the later actor knows more.
 *
 * A provider outage is not a failure here: the server keeps the previous
 * sequence and reports `degraded`, and the caller surfaces that rather than an
 * error toast.
 */
export async function optimizeRouteAction(
  input: unknown,
): Promise<ActionResult<OptimizeRouteResult>> {
  await requireSession();

  const parsed = optimizeRouteSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(fieldErrorsOf(parsed.error));
  }

  try {
    const result = await optimizeRoute(parsed.data);
    revalidateOrderViews();
    revalidatePath("/routes");
    return succeed(result);
  } catch (error) {
    return toFailure(error);
  }
}
