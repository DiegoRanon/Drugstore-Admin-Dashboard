import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronDown, Snowflake, User } from "lucide-react";

import type { Driver, Order } from "@/api/types";
import { StatusChip } from "@/components/board/status-chip";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatMoney, shortName } from "@/lib/format";
import { isTerminal, shortReference, STATUS_STYLE } from "@/lib/orders";
import { cn } from "@/lib/utils";

export async function OrderCard({
  order,
  driver,
  locale,
}: {
  order: Order;
  driver: Driver | undefined;
  locale: Locale;
}) {
  const t = await getTranslations();
  const closed = isTerminal(order.status);
  const assignable = order.status === "in_pharmacy";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card shadow-xs transition-shadow focus-within:shadow-md hover:shadow-md",
        closed && "bg-card/60",
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1", STATUS_STYLE[order.status].stripe)}
        aria-hidden
      />

      <div className="space-y-2.5 py-3 pr-3 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/*
              Detail reads are written to an append-only audit log. `<Link>`
              prefetches on viewport entry by default, which would record 50
              accesses nobody performed — so prefetching is off here, and that
              is a compliance control, not a performance choice (PRD 8.1).
            */}
            <Link
              href={`/orders/${order.id}`}
              prefetch={false}
              className="font-semibold hover:underline focus-visible:underline"
            >
              {order.patient_name}
            </Link>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              #{shortReference(order.id)}
            </span>
          </div>
          <StatusChip status={order.status} className="shrink-0" />
        </div>

        <p className="text-sm text-muted-foreground">{order.address}</p>

        <div className="flex flex-wrap items-center gap-2">
          {order.payment_status === "unpaid" ? (
            <span className="text-sm font-semibold text-unpaid">
              {t("payment.unpaid")}
              {order.amount_due !== null && `: ${formatMoney(order.amount_due, locale)}`}
            </span>
          ) : (
            <span className="text-sm font-semibold text-paid">
              {order.payment_method
                ? t("payment.paidWith", { method: t(`payment.method.${order.payment_method}`) })
                : t("payment.paid")}
            </span>
          )}

          {order.requires_cooler_bag && (
            <span className="inline-flex items-center gap-1 rounded bg-cooler-soft px-1.5 py-0.5 text-xs font-medium text-cooler">
              <Snowflake className="size-3" aria-hidden />
              {t("order.coolerRequired")}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-0.5">
          {order.sequence_number !== null ? (
            <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {t("order.stop", { number: order.sequence_number })}
            </span>
          ) : (
            <span />
          )}

          {driver ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="size-3.5" aria-hidden />
              {order.status === "completed"
                ? t("order.completedBy", {
                    driver: shortName(driver.first_name, driver.last_name),
                  })
                : t("order.assignedTo", {
                    driver: shortName(driver.first_name, driver.last_name),
                  })}
            </span>
          ) : assignable ? (
            <Button variant="outline" size="sm" className="gap-1.5">
              {t("order.assign")}
              <ChevronDown className="size-3.5" aria-hidden />
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{t("order.unassigned")}</span>
          )}
        </div>
      </div>
    </article>
  );
}
