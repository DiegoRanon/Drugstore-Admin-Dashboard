import { getLocale, getTranslations } from "next-intl/server";

import { BoardColumn } from "@/components/board/board-column";
import { DateStepper } from "@/components/board/date-stepper";
import { ExceptionBand } from "@/components/board/exception-band";
import { NewDeliveryTrigger } from "@/components/new-delivery/new-delivery-trigger";
import { ORG_WINDOWS, ordersForDate, TODAY } from "@/fixtures";
import type { Locale } from "@/i18n/config";
import { requireSession } from "@/lib/dal/session";
import { todayIn } from "@/lib/format";
import { groupByWindow } from "@/lib/orders";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function BoardPage({ searchParams }: PageProps<"/">) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const { date } = await searchParams;
  const session = await requireSession();

  // "Today" is the pharmacy's own day, not the server's or the browser's.
  const today = todayIn(session.organization.timezone);
  const selected = typeof date === "string" && PLAIN_DATE.test(date) ? date : today;

  // Phase 3 replaces this with `GET /v1/orders?date=` through the DAL.
  const orders = ordersForDate(selected === today ? TODAY : selected);
  const { AM, PM } = groupByWindow(orders);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateStepper date={selected} today={today} />
        <NewDeliveryTrigger className="ml-auto" />
      </div>

      <ExceptionBand orders={orders} />

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-16 text-center">
          <p className="font-medium">{t("board.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("board.emptyHint")}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <BoardColumn
            window="AM"
            orders={AM}
            start={ORG_WINDOWS.am_window_start}
            end={ORG_WINDOWS.am_window_end}
            locale={locale}
          />
          <BoardColumn
            window="PM"
            orders={PM}
            start={ORG_WINDOWS.pm_window_start}
            end={ORG_WINDOWS.pm_window_end}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
