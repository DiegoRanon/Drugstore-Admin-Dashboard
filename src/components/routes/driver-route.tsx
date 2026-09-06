"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  Flag,
  LoaderCircle,
  MapPin,
  Route,
  Snowflake,
  TriangleAlert,
} from "lucide-react";

import type { Order, RouteEstimate } from "@/api/types";
import { optimizeRouteAction } from "@/app/(dashboard)/orders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import type { Locale } from "@/i18n/config";
import { formatClockTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One driver's day, with the control that sequences it.
 *
 * The stops arrive already in the order the driver will see them — the parent
 * sorts with the driver's comparator, and the server re-reads its own queue
 * after optimizing rather than echoing the solver. So this component never
 * reorders anything itself; it renders a route and offers to recompute it.
 *
 * The optional time range narrows the run. It applies only to stops that carry
 * no promise of their own, which is a server-side rule (see
 * `resolveWindowMinutes`) and is what the hint under the inputs is telling the
 * user: setting "afternoon" here will not move a delivery the pharmacy already
 * promised for 09:30.
 */
export function DriverRoute({
  date,
  driverId,
  driverName,
  stops,
  locale,
}: {
  date: string;
  driverId: string;
  driverName: string;
  stops: Order[];
  locale: Locale;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [degraded, setDegraded] = useState(false);
  const [estimates, setEstimates] = useState<Map<string, RouteEstimate>>(new Map());
  const [isPending, startTransition] = useTransition();

  // Surfaced up front rather than only after a run: an address nobody
  // standardized is fixable now, while the packages are still on the counter.
  const ungeocoded = stops.filter((stop) => stop.latitude === null);

  function optimize() {
    startTransition(async () => {
      const bothEnds = start.length > 0 && end.length > 0;

      const result = await optimizeRouteAction({
        date,
        driver_id: driverId,
        time_range: bothEnds ? { start, end } : null,
      });

      if (!result.ok) return showFailure(result);

      setDegraded(result.data.degraded);
      setEstimates(
        new Map(result.data.estimates?.map((e) => [e.order_id, e]) ?? []),
      );

      // `degraded` is not an error — the route is the driver's previous one
      // and still perfectly usable — but saying "optimized" would be a lie.
      if (result.data.degraded) {
        showSuccess(t("routes.degraded"));
      } else {
        showSuccess(t("routes.optimized", { count: result.data.orders.length }));
      }

      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b p-4">
        <div>
          <h2 className="font-semibold">{driverName}</h2>
          <p className="text-sm text-muted-foreground">
            {t("routes.stopCount", { count: stops.length })}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`start-${driverId}`} className="text-xs">
              {t("routes.from")}
            </Label>
            <Input
              id={`start-${driverId}`}
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="w-32"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`end-${driverId}`} className="text-xs">
              {t("routes.to")}
            </Label>
            <Input
              id={`end-${driverId}`}
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="w-32"
            />
          </div>

          <Button onClick={optimize} disabled={isPending || stops.length < 2}>
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Route className="size-4" aria-hidden />
            )}
            {t("routes.optimize")}
          </Button>
        </div>
      </header>

      <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        {t("routes.timeRangeHint")}
      </p>

      {degraded && (
        <p className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {t("routes.degradedBanner")}
        </p>
      )}

      {ungeocoded.length > 0 && (
        <p className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {t("routes.ungeocoded", { count: ungeocoded.length })}
        </p>
      )}

      <ol className="divide-y">
        {stops.map((stop, index) => {
          const estimate = estimates.get(stop.id);

          return (
            <li key={stop.id} className="flex items-start gap-3 p-4">
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
                  index === 0 && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Audit-log compliance: never prefetch a route that reads PII. */}
                  <Link
                    href={`/orders/${stop.id}`}
                    prefetch={false}
                    className="font-medium hover:underline"
                  >
                    {stop.patient_name}
                  </Link>

                  {stop.is_priority && (
                    <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                      <Flag className="size-3" aria-hidden />
                      {t("order.priority")}
                    </span>
                  )}

                  {stop.requires_cooler_bag && (
                    <span className="inline-flex items-center gap-1 rounded bg-cooler-soft px-1.5 py-0.5 text-xs font-medium text-cooler">
                      <Snowflake className="size-3" aria-hidden />
                      {t("order.coolerRequired")}
                    </span>
                  )}
                </div>

                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <MapPin
                    className={cn(
                      "size-3.5 shrink-0",
                      stop.latitude === null && "text-amber-600 dark:text-amber-500",
                    )}
                    aria-hidden
                  />
                  {stop.address}
                </p>

                {(stop.requested_time_start || stop.requested_delivery_time) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stop.requested_time_start && stop.requested_time_end
                      ? t("routes.window", {
                          start: formatClockTime(stop.requested_time_start, locale),
                          end: formatClockTime(stop.requested_time_end, locale),
                        })
                      : t("order.requestedTime", {
                          time: formatClockTime(stop.requested_delivery_time!, locale),
                        })}
                  </p>
                )}
              </div>

              {estimate?.distance_meters !== null &&
                estimate?.distance_meters !== undefined && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {t("routes.distance", {
                      km: (estimate.distance_meters / 1000).toFixed(1),
                    })}
                  </span>
                )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
