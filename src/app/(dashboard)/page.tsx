import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";

import { BoardColumn } from "@/components/board/board-column";
import { BoardSkeleton } from "@/components/board/board-skeleton";
import { DateStepper } from "@/components/board/date-stepper";
import { ExceptionBand } from "@/components/board/exception-band";
import { LiveUpdates } from "@/components/board/live-updates";
import { NewDeliveryTrigger } from "@/components/new-delivery/new-delivery-trigger";
import type { Locale } from "@/i18n/config";
import { listDrivers } from "@/lib/dal/drivers";
import { getOrdersForDate } from "@/lib/dal/orders";
import { requireSession } from "@/lib/dal/session";
import { shortName, todayIn } from "@/lib/format";
import { groupByWindow, indexDrivers } from "@/lib/orders";

/** Renders patient data: never prerendered, never cached (PRD 8.2). */
export const dynamic = "force-dynamic";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function BoardPage({ searchParams }: PageProps<"/">) {
  const t = await getTranslations();
  const { date } = await searchParams;
  const session = await requireSession();

  // "Today" is the pharmacy's own day — not the server's and not the browser's.
  const today = todayIn(session.organization.timezone);
  const selected = typeof date === "string" && PLAIN_DATE.test(date) ? date : today;

  // Anything the server writes after this instant is news for the poller.
  const renderedAt = new Date().toISOString();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateStepper date={selected} today={today} />
        <div className="ml-auto flex items-center gap-4">
          <LiveUpdates since={renderedAt} />
          <NewDeliveryTrigger defaultDate={selected} />
        </div>
      </div>

      {/*
        The toolbar paints immediately; the day's orders stream in behind it.
        The boundary lives here rather than in a route-level `loading.tsx` so it
        does not sit above `/orders/[id]` and break its 404 status.
      */}
      <Suspense key={selected} fallback={<BoardSkeleton />}>
        <BoardContent date={selected} emptyTitle={t("board.empty")} emptyHint={t("board.emptyHint")} />
      </Suspense>
    </div>
  );
}

async function BoardContent({
  date,
  emptyTitle,
  emptyHint,
}: {
  date: string;
  emptyTitle: string;
  emptyHint: string;
}) {
  const locale = (await getLocale()) as Locale;

  // The roster is small and changes rarely, so it is fetched alongside the day's
  // orders and joined here: orders carry `driver_id` only (PRD 9.3).
  const [orders, drivers] = await Promise.all([getOrdersForDate(date), listDrivers()]);

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-16 text-center">
        <p className="font-medium">{emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  const { AM, PM } = groupByWindow(orders);
  const driverIndex = indexDrivers(drivers);

  // Only employed drivers can be assigned work (PRD 5.3).
  const assignableDrivers = drivers
    .filter((driver) => driver.is_active)
    .map((driver) => ({
      id: driver.id,
      name: shortName(driver.first_name, driver.last_name),
    }));

  return (
    <>
      <ExceptionBand orders={orders} />
      <div className="grid gap-4 lg:grid-cols-2">
        <BoardColumn
          window="AM"
          orders={AM}
          drivers={driverIndex}
          assignableDrivers={assignableDrivers}
          locale={locale}
        />
        <BoardColumn
          window="PM"
          orders={PM}
          drivers={driverIndex}
          assignableDrivers={assignableDrivers}
          locale={locale}
        />
      </div>
    </>
  );
}
