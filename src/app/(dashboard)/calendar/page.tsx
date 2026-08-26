import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";

import { MonthGrid } from "@/components/calendar/month-grid";
import { MonthStepper } from "@/components/calendar/month-stepper";
import { NewDeliveryTrigger } from "@/components/new-delivery/new-delivery-trigger";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/config";
import { getCalendar } from "@/lib/dal/orders";
import { requireSession } from "@/lib/dal/session";
import { endOfMonth, startOfMonth, todayIn } from "@/lib/format";

/**
 * Where an order is born.
 *
 * An order is created into the admin's calendar as `scheduled` and is invisible
 * to every driver until somebody declares it physically ready, so this view
 * answers the question the day board cannot: what is coming, and how much of it
 * has nobody packed yet.
 *
 * `GET /v1/orders/calendar` returns per-day integers and no patient data, and
 * is deliberately not audit-logged server-side (privacy-rules.md §6) — paging a
 * year through here records nothing.
 */
export const dynamic = "force-dynamic";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const t = await getTranslations();
  const { month } = await searchParams;
  const session = await requireSession();

  // "Today" is the pharmacy's own day — not the server's and not the browser's.
  const today = todayIn(session.organization.timezone);
  const thisMonth = startOfMonth(today);

  const requested = typeof month === "string" && PLAIN_DATE.test(month) ? month : today;
  const selected = startOfMonth(requested);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthStepper month={selected} thisMonth={thisMonth} />
        <div className="ml-auto">
          <NewDeliveryTrigger defaultDate={today} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t("calendar.subtitle")}</p>

      <Suspense key={selected} fallback={<Skeleton className="h-[32rem] w-full rounded-lg" />}>
        <CalendarContent month={selected} today={today} />
      </Suspense>
    </div>
  );
}

async function CalendarContent({ month, today }: { month: string; today: string }) {
  const locale = (await getLocale()) as Locale;
  const { days } = await getCalendar(month, endOfMonth(month));

  return <MonthGrid month={month} today={today} days={days} locale={locale} />;
}
