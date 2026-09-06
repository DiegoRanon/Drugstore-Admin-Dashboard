import { getLocale, getTranslations } from "next-intl/server";

import { DateStepper } from "@/components/board/date-stepper";
import { DriverRoute } from "@/components/routes/driver-route";
import type { Locale } from "@/i18n/config";
import { listDrivers } from "@/lib/dal/drivers";
import { getOrdersForDate } from "@/lib/dal/orders";
import { requireSession } from "@/lib/dal/session";
import { shortName, todayIn } from "@/lib/format";
import { activeStopsByDriver } from "@/lib/orders";

/** Renders patient data: never prerendered, never cached (PRD 8.2). */
export const dynamic = "force-dynamic";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One day's routes, a driver at a time.
 *
 * The board answers "what is going out today"; this answers "in what order",
 * which is a different question and was previously answerable only from inside
 * the driver's phone. Staff optimize here before the driver leaves, so the
 * sequence is on the packing counter's screen at pickup.
 *
 * Stops are sorted with the driver's comparator, not the board's — see
 * `sortForDriverQueue`. Showing the pharmacy a different order than the driver
 * is the exact failure this feature exists to prevent.
 */
export default async function RoutesPage({ searchParams }: PageProps<"/routes">) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const { date } = await searchParams;
  const session = await requireSession();

  const today = todayIn(session.organization.timezone);
  const selected = typeof date === "string" && PLAIN_DATE.test(date) ? date : today;

  const [orders, drivers] = await Promise.all([
    getOrdersForDate(selected),
    listDrivers(),
  ]);

  const byDriver = activeStopsByDriver(orders);

  // Only drivers who actually have stops. An empty roster row is noise on a
  // screen whose whole purpose is the stops.
  const routes = drivers
    .filter((driver) => (byDriver.get(driver.id)?.length ?? 0) > 0)
    .map((driver) => ({
      driver,
      stops: byDriver.get(driver.id) ?? [],
    }));

  const unassigned = orders.filter(
    (order) =>
      !order.driver_id &&
      (order.status === "in_pharmacy" || order.status === "scheduled"),
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateStepper date={selected} today={today} />
        {unassigned > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("routes.unassigned", { count: unassigned })}
          </p>
        )}
      </div>

      {routes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">{t("routes.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("routes.emptyHint")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {routes.map(({ driver, stops }) => (
            <DriverRoute
              key={driver.id}
              date={selected}
              driverId={driver.id}
              driverName={shortName(driver.first_name, driver.last_name)}
              stops={stops}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}
