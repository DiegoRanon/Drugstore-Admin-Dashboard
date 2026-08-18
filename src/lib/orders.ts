import type { Driver, Order, OrderStatus } from "@/api/types";

/**
 * Presentation metadata per status. Colour is one of three signals here — the
 * label and the icon carry the same information, so the board stays readable
 * in greyscale and for colour-blind users (PRD 7).
 */
export const STATUS_STYLE: Record<
  OrderStatus,
  { stripe: string; chip: string; dot: string }
> = {
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
  cancelled: {
    stripe: "bg-status-cancelled",
    chip: "text-status-cancelled bg-status-cancelled-soft",
    dot: "bg-status-cancelled",
  },
};

export const TERMINAL_STATUSES: OrderStatus[] = [
  "completed",
  "returned",
  "cancelled",
];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * The server has no human-readable order number — only a UUID (see the gap
 * noted in the build plan). Until it grows one, show a stable short handle so
 * staff can say "eight-two-one" on the phone without reading 36 characters.
 */
export function shortReference(id: string): string {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

export type ExceptionKind =
  | "returned"
  | "unpaidDelivered"
  | "coolerUnconfirmed";

/**
 * The three things a pharmacist must see before anything else (PRD 5.2).
 * `cancelled` is deliberately absent: it never left the pharmacy, so there is
 * nothing to chase.
 */
export function exceptionsFor(order: Order): ExceptionKind[] {
  const found: ExceptionKind[] = [];

  if (order.status === "returned") found.push("returned");

  if (order.status === "completed" && order.payment_status === "unpaid") {
    found.push("unpaidDelivered");
  }

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

/** Unassigned first, then by route position, then by creation order. */
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
