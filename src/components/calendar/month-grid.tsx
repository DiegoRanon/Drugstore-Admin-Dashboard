import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { CalendarDay, OrderStatus } from "@/api/types";
import type { Locale } from "@/i18n/config";
import {
  dayOfMonth,
  endOfMonth,
  shiftDate,
  startOfMonth,
  weekdayNames,
  weekdayOf,
} from "@/lib/format";
import { ORDER_STATUSES, STATUS_STYLE } from "@/lib/orders";
import { cn } from "@/lib/utils";

/**
 * The month at a glance: how many deliveries each day, and how many of them
 * nobody has packed yet.
 *
 * The counts come from `GET /v1/orders/calendar`, which returns integers and
 * no patient data — so unlike the board and the order detail, rendering this
 * writes nothing to the access audit log.
 */
export async function MonthGrid({
  month,
  today,
  days,
  locale,
}: {
  /** Any plain date inside the month to render. */
  month: string;
  today: string;
  days: CalendarDay[];
  locale: Locale;
}) {
  const t = await getTranslations();

  const byDate = new Map(days.map((day) => [day.delivery_date, day]));
  const first = startOfMonth(month);
  const last = endOfMonth(month);

  // Pad back to the Sunday on or before the first, so the grid is whole weeks.
  const gridStart = shiftDate(first, -weekdayOf(first));
  const gridEnd = shiftDate(last, 6 - weekdayOf(last));

  const cells: string[] = [];
  for (let date = gridStart; date <= gridEnd; date = shiftDate(date, 1)) {
    cells.push(date);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {weekdayNames(locale).map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-center text-xs font-medium text-muted-foreground first-letter:uppercase"
          >
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((date) => {
          const day = byDate.get(date);
          const outside = date < first || date > last;
          const total = day?.total ?? 0;

          return (
            <DayCell
              key={date}
              date={date}
              total={total}
              day={day}
              outside={outside}
              isToday={date === today}
              emptyLabel={t("calendar.noDeliveries")}
              scheduledLabel={t("calendar.scheduledCount", {
                count: day?.by_status.scheduled ?? 0,
              })}
              totalLabel={t("calendar.deliveries", { count: total })}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCell({
  date,
  total,
  day,
  outside,
  isToday,
  emptyLabel,
  scheduledLabel,
  totalLabel,
}: {
  date: string;
  total: number;
  day: CalendarDay | undefined;
  outside: boolean;
  isToday: boolean;
  emptyLabel: string;
  scheduledLabel: string;
  totalLabel: string;
}) {
  const scheduled = day?.by_status.scheduled ?? 0;

  const content = (
    <>
      <div className="flex items-baseline justify-between gap-1">
        <span
          className={cn(
            "text-sm font-medium",
            isToday &&
              "inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
            outside && "text-muted-foreground/50",
          )}
        >
          {dayOfMonth(date)}
        </span>
        {total > 0 && (
          <span className="text-xs font-semibold text-muted-foreground">{total}</span>
        )}
      </div>

      {total === 0 ? (
        <span className="sr-only">{emptyLabel}</span>
      ) : (
        <div className="mt-1.5 space-y-1">
          {/*
            Orders nobody has packed yet — the number this page exists to make
            visible. Until somebody marks them ready, no driver can see them.
          */}
          {scheduled > 0 && (
            <p className="inline-flex items-center gap-1 rounded bg-status-scheduled-soft px-1.5 py-0.5 text-xs font-semibold text-status-scheduled">
              {scheduledLabel}
            </p>
          )}
          <div className="flex flex-wrap gap-1" aria-hidden>
            {ORDER_STATUSES.filter(
              (status) => (day?.by_status[status as keyof CalendarDay["by_status"]] ?? 0) > 0,
            ).map((status) => (
              <StatusDots
                key={status}
                status={status}
                count={day?.by_status[status as keyof CalendarDay["by_status"]] ?? 0}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );

  const className = cn(
    "min-h-24 border-r border-b p-2 text-left last:border-r-0",
    outside && "bg-muted/30",
  );

  if (total === 0) {
    return (
      <div className={className} aria-label={`${date}: ${emptyLabel}`}>
        {content}
      </div>
    );
  }

  return (
    /*
      The board behind this link *is* audit-logged (`order.list.read`), so
      prefetching a month of cells would record thirty reads no human
      performed. The `require-prefetch-false` lint rule only covers
      `/orders/:id` and `/clients/:id`, so it cannot catch this one — the
      attribute has to be written by hand (PRD 8.1).
    */
    <Link
      href={`/?date=${date}`}
      prefetch={false}
      aria-label={`${date}: ${totalLabel}`}
      className={cn(className, "transition-colors hover:bg-accent focus-visible:bg-accent")}
    >
      {content}
    </Link>
  );
}

/**
 * One dot per order, capped so a busy day stays one line — the exact figure is
 * the total in the corner, and this is only meant to show the mix.
 */
function StatusDots({ status, count }: { status: OrderStatus; count: number }) {
  const shown = Math.min(count, 4);

  return (
    <span className="flex gap-0.5">
      {Array.from({ length: shown }, (_, index) => (
        <span
          key={index}
          className={cn("size-1.5 rounded-full", STATUS_STYLE[status].dot)}
        />
      ))}
    </span>
  );
}
