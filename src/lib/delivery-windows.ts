import type { DeliveryWindow } from "@/api/types";

/**
 * AM/PM clock bounds.
 *
 * These live on `organizations` in the database (`am_window_start`,
 * `am_window_end`, `pm_window_start`, `pm_window_end`) but **no endpoint
 * returns them** — `/v1/auth/me` gives only id, name, phone, timezone, and
 * locale. Until the server exposes them, the board shows the schema defaults.
 *
 * A pharmacy with different hours would see the wrong label here, which is why
 * this is a single constant rather than four literals sprinkled through the UI:
 * when the field arrives, only this file changes.
 */
export const DELIVERY_WINDOWS: Record<DeliveryWindow, { start: string; end: string }> = {
  AM: { start: "09:00", end: "12:00" },
  PM: { start: "13:00", end: "17:00" },
};

export const WINDOW_ORDER: DeliveryWindow[] = ["AM", "PM"];
