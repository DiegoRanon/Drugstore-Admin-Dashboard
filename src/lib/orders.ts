import type { Driver, Order, OrderStatus } from "@/api/types";

/**
 * Presentation metadata per status. Colour is one of three signals here — the
 * label and the icon carry the same information, so the board stays readable
 * in greyscale and for colour-blind users (PRD 7).
 *
 * Declared in lifecycle order, because `ORDER_STATUSES` below is derived from
 * these keys and drives the status filter.
 */
export const STATUS_STYLE: Record<
  OrderStatus,
  { stripe: string; chip: string; dot: string }
> = {
  scheduled: {
    stripe: "bg-status-scheduled",
    chip: "text-status-scheduled bg-status-scheduled-soft",
    dot: "bg-status-scheduled",
  },
  in_pharmacy: {
    stripe: "bg-status-in-pharmacy",
    chip: "text-status-in-pharmacy bg-status-in-pharmacy-soft",
    dot: "bg-status-in-pharmacy",
  },
  picked_up: {
    stripe: "bg-status-picked-up",
    chip: "text-status-picked-up bg-status-picked-up-soft",
    dot: "bg-status-picked-up",
  },
  completed: {
    stripe: "bg-status-completed",
    chip: "text-status-completed bg-status-completed-soft",
    dot: "bg-status-completed",
  },
  returned: {
    stripe: "bg-status-returned",
    chip: "text-status-returned bg-status-returned-soft",
    dot: "bg-status-returned",
  },
  returned_to_pharmacy: {
    stripe: "bg-status-returned-to-pharmacy",
    chip: "text-status-returned-to-pharmacy bg-status-returned-to-pharmacy-soft",
    dot: "bg-status-returned-to-pharmacy",
  },
  cancelled: {
    stripe: "bg-status-cancelled",
    chip: "text-status-cancelled bg-status-cancelled-soft",
    dot: "bg-status-cancelled",
  },
};

/**
 * Every status, in lifecycle order — the filter dropdown and the query-string
 * allowlist both read this one list.
 *
 * Derived from an exhaustive `Record<OrderStatus, …>` rather than written out
 * again: a status added to the API is a compile error in `STATUS_STYLE`, and
 * cannot silently go missing from the filters the way it could when this was
 * an array literal duplicated across two files.
 */
export const ORDER_STATUSES = Object.keys(STATUS_STYLE) as OrderStatus[];

/**
 * Can anything else happen to this order?
 *
 * `returned` is deliberately **not** terminal: the delivery failed, but the
 * package is in the driver's van and the pharmacy is owed a handover. Only
 * `returned_to_pharmacy` closes that loop. Collapsing the two makes a failed
 * delivery look settled on the board at exactly the moment somebody has to
 * chase it (drugstore-server/docs/delivery-workflow.md).
 *
 * A `Record`, not an array, so a new status has to be classified here before
 * the code compiles.
 */
const TERMINAL_BY_STATUS: Record<OrderStatus, boolean> = {
  scheduled: false,
  in_pharmacy: false,
  picked_up: false,
  returned: false,
  completed: true,
  returned_to_pharmacy: true,
  cancelled: true,
};

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_BY_STATUS[status];
}

/**
 * Mirrors the server's edit rule: a PATCH is accepted while the order is
 * `scheduled` or `in_pharmacy` and refused after with `422 ORDER_NOT_EDITABLE`.
 * Once a driver holds the bags, changing the address would mean the delivery
 * being performed no longer matches its record.
 */
const EDITABLE_BY_STATUS: Record<OrderStatus, boolean> = {
  scheduled: true,
  in_pharmacy: true,
  picked_up: false,
  returned: false,
  completed: false,
  returned_to_pharmacy: false,
  cancelled: false,
};

export function isEditable(status: OrderStatus): boolean {
  return EDITABLE_BY_STATUS[status];
}

/** Failed at the door, and the package has not come back to the counter yet. */
export function isAwaitingHandover(status: OrderStatus): boolean {
  return status === "returned";
}

/**
 * An admin sees patient details at every status. The server's
 * `PII_VISIBLE_STATUSES` cliff governs the *driver* serializer and is
 * deliberately not mirrored here — see drugstore-server/docs/privacy-rules.md.
 */

/**
 * The server has no human-readable order number — only a UUID (see the gap
 * noted in the build plan). Until it grows one, show a stable short handle so
 * staff can say "eight-two-one" on the phone without reading 36 characters.
 */
export function shortReference(id: string): string {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

export type ExceptionKind =
  | "awaitingHandover"
  | "unpaidDelivered"
  | "coolerUnconfirmed";

/**
 * The things a pharmacist must see before anything else (PRD 5.2).
 *
 * `cancelled` is deliberately absent: it never left the pharmacy, so there is
 * nothing to chase. `returned_to_pharmacy` is absent for the opposite reason —
 * the package is back on the shelf and the matter is closed.
 */
export function exceptionsFor(order: Order): ExceptionKind[] {
  const found: ExceptionKind[] = [];

  // Failed, and still in the van. The actionable window is before the
  // pharmacy's return deadline, which is why this fires on `returned` and
  // goes quiet at `returned_to_pharmacy`.
  if (isAwaitingHandover(order.status)) found.push("awaitingHandover");

  // An unpaid delivery the pharmacy authorised is a decision, not an anomaly:
  // `payment_exception` is the record of that call, so it silences the alarm.
  // The reason itself is shown on the order's own page.
  if (
    order.status === "completed" &&
    order.payment_status === "unpaid" &&
    order.payment_exception === null
  ) {
    found.push("unpaidDelivered");
  }

  // Gated on `isTerminal`, so it stays quiet while the cooler is still in the
  // van on a returned order and speaks up once the order is actually closed.
  if (
    order.requires_cooler_bag &&
    order.cooler_bag_confirmed === null &&
    isTerminal(order.status)
  ) {
    found.push("coolerUnconfirmed");
  }

  return found;
}

export type BoardException = { order: Order; kind: ExceptionKind };

export function collectExceptions(orders: Order[]): BoardException[] {
  return orders.flatMap((order) =>
    exceptionsFor(order).map((kind) => ({ order, kind })),
  );
}

/**
 * `amount_collected` differing from `amount_due` is worth flagging on the
 * detail screen. The server returns both and draws no conclusion (PRD 5.3).
 */
export function hasPaymentDiscrepancy(order: Order): boolean {
  if (!order.payment_collected) return false;
  if (order.amount_due === null || order.amount_collected === null) return false;
  return Number(order.amount_due) !== Number(order.amount_collected);
}

/**
 * Unassigned first, then by route position, then by creation order.
 *
 * `is_priority` deliberately does not sort here. It reorders the *driver's*
 * queue, where the question is "which address next"; this board is organised
 * around who still needs a driver, and a priority flag jumping rows would
 * fight that. The flag is shown as a badge instead.
 */
export function sortForBoard(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    if (!a.driver_id !== !b.driver_id) return a.driver_id ? 1 : -1;
    const aSeq = a.sequence_number ?? Number.MAX_SAFE_INTEGER;
    const bSeq = b.sequence_number ?? Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function groupByWindow(orders: Order[]): {
  AM: Order[];
  PM: Order[];
} {
  return {
    AM: sortForBoard(orders.filter((o) => o.delivery_window === "AM")),
    PM: sortForBoard(orders.filter((o) => o.delivery_window === "PM")),
  };
}

/**
 * Orders carry `driver_id` only, so the board joins names against the cached
 * roster (PRD 9.3). Fine at this scale; worth revisiting past a few dozen
 * drivers.
 */
export type DriverIndex = ReadonlyMap<string, Driver>;

export function indexDrivers(drivers: Driver[]): DriverIndex {
  return new Map(drivers.map((driver) => [driver.id, driver]));
}
