import { getTranslations } from "next-intl/server";

import type { DeliveryWindow, Order } from "@/api/types";
import { OrderCard } from "@/components/board/order-card";
import type { AssignableDriver } from "@/components/orders/assign-driver-menu";
import type { Locale } from "@/i18n/config";
import { DELIVERY_WINDOWS } from "@/lib/delivery-windows";
import { formatClockTime } from "@/lib/format";
import type { DriverIndex } from "@/lib/orders";

export async function BoardColumn({
  window,
  orders,
  drivers,
  assignableDrivers,
  locale,
}: {
  window: DeliveryWindow;
  orders: Order[];
  drivers: DriverIndex;
  assignableDrivers: AssignableDriver[];
  locale: Locale;
}) {
  const t = await getTranslations();
  const { start, end } = DELIVERY_WINDOWS[window];
  const heading = t(window === "AM" ? "board.am" : "board.pm");

  return (
    <section
      aria-label={heading}
      className="flex min-h-0 flex-col rounded-lg border bg-muted/40"
    >
      <header className="flex items-center justify-between border-b bg-card/60 px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          {heading}
          <span className="ml-2 font-normal text-muted-foreground">
            {t("board.windowRange", {
              start: formatClockTime(start, locale),
              end: formatClockTime(end, locale),
            })}
          </span>
        </h2>
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          aria-label={t("board.count", { count: orders.length })}
        >
          {orders.length}
        </span>
      </header>

      {orders.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {t("board.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              driver={order.driver_id ? drivers.get(order.driver_id) : undefined}
              assignableDrivers={assignableDrivers}
              locale={locale}
            />
          ))}
        </div>
      )}
    </section>
  );
}
