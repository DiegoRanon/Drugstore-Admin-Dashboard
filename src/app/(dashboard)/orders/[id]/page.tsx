import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  History,
  Phone,
  Snowflake,
  Truck,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import type { OrderTransition } from "@/api/types";
import { StatusChip } from "@/components/board/status-chip";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ORDER_DETAIL } from "@/fixtures";
import type { Locale } from "@/i18n/config";
import { requireSession } from "@/lib/dal/session";
import { formatMoney, formatTimestamp } from "@/lib/format";
import { hasPaymentDiscrepancy, isTerminal, shortReference } from "@/lib/orders";
import { cn } from "@/lib/utils";

/**
 * Only these transitions belong to an admin. `pickup`, `complete`, and `return`
 * are driver actions — they can appear in `available_transitions` and must
 * still never render a button here.
 */
const ADMIN_TRANSITIONS: OrderTransition[] = ["cancel"];

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const session = await requireSession();

  // Phase 4 replaces this with `GET /v1/orders/{id}` through the DAL.
  const order = id === ORDER_DETAIL.id ? ORDER_DETAIL : null;
  if (!order) notFound();

  const discrepancy = hasPaymentDiscrepancy(order);
  const editable = order.status === "in_pharmacy";

  // Authoritative: the server owns the state machine, React never re-derives it.
  const actions = order.available_transitions.filter((transition) =>
    ADMIN_TRANSITIONS.includes(transition),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/" />}>
                  {t("nav.deliveries")}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{t("order.breadcrumb")}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold">
              #{shortReference(order.id)}
            </h1>
            <StatusChip status={order.status} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/*
            Editing after pickup would mean the delivery in progress no longer
            matches the record of it, so the control explains itself rather than
            letting the user submit and collect a 422 (PRD 5.3).
          */}
          <Button variant="outline" disabled={!editable} title={editable ? undefined : t("order.editDisabled")}>
            {t("order.edit")}
          </Button>
          {actions.includes("cancel") && (
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/5"
            >
              {t("order.cancel")}
            </Button>
          )}
          {!isTerminal(order.status) && <Button>{t("order.assignDriver")}</Button>}
        </div>
      </div>

      {!editable && (
        <p className="text-sm text-muted-foreground">{t("order.editDisabled")}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="relative overflow-hidden rounded-lg border bg-card">
            <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
            <header className="flex items-center gap-2 border-b px-5 py-3">
              <Truck className="size-5 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold">{t("order.logistics")}</h2>
            </header>

            <div className="grid gap-5 px-5 py-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t("order.patient")}
                </p>
                <p className="mt-1 font-medium">{order.patient_name}</p>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
                  <Phone className="size-3.5" aria-hidden />
                  {order.phone_number}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t("order.deliveryAddress")}
                </p>
                {/* Snapshot on the order — not the client record (PRD 5.3). */}
                <p className="mt-1">{order.address}</p>
              </div>
            </div>

            {order.requires_cooler_bag && (
              <div className="mx-5 mb-4 flex items-start gap-3 rounded-md border bg-muted/50 px-4 py-3">
                <Snowflake className="mt-0.5 size-4 shrink-0 text-cooler" aria-hidden />
                <div className="text-sm">
                  <p className="font-medium">{t("order.coolerRequired")}</p>
                  <p className="text-muted-foreground">{t("order.coolerNote")}</p>
                </div>
              </div>
            )}
          </section>

          <section
            className={cn(
              "relative overflow-hidden rounded-lg border bg-card",
              discrepancy && "border-destructive/30",
            )}
          >
            <span
              className={cn(
                "absolute inset-y-0 left-0 w-1",
                discrepancy ? "bg-destructive" : "bg-muted-foreground/30",
              )}
              aria-hidden
            />
            <header className="flex items-center gap-2 border-b px-5 py-3">
              <Wallet className="size-5 text-muted-foreground" aria-hidden />
              <h2 className="text-lg font-semibold">{t("order.payment")}</h2>
            </header>

            <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm text-muted-foreground">{t("payment.amountDue")}</p>
                <p className="text-2xl font-semibold">
                  {order.amount_due === null
                    ? t("payment.nothingToCollect")
                    : formatMoney(order.amount_due, locale)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">
                  {t("payment.amountCollected")}
                </p>
                <p
                  className={cn(
                    "text-2xl font-semibold",
                    discrepancy ? "text-destructive" : "text-paid",
                  )}
                >
                  {formatMoney(order.amount_collected, locale)}
                </p>
              </div>
            </div>

            {discrepancy && (
              <div className="mx-5 mb-4 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <div className="text-sm">
                  <p className="font-medium text-destructive">
                    {t("payment.discrepancyTitle")}
                  </p>
                  <p className="text-muted-foreground">{t("payment.discrepancyBody")}</p>
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="rounded-lg border bg-card">
          <header className="flex items-center gap-2 border-b px-5 py-3">
            <History className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold">{t("order.timeline")}</h2>
          </header>

          <ol className="space-y-5 px-5 py-4">
            {[...order.status_events].reverse().map((event, index) => (
              <li key={`${event.status}-${event.occurred_at}`} className="flex gap-3">
                <span className="mt-1 flex flex-col items-center" aria-hidden>
                  <span
                    className={cn(
                      "size-3 rounded-full border-2",
                      index === 0
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40 bg-card",
                    )}
                  />
                </span>
                <div className="text-sm">
                  <p className={cn("font-medium", index === 0 && "text-primary")}>
                    {formatTimestamp(
                      event.occurred_at,
                      locale,
                      session.organization.timezone,
                    )}
                  </p>
                  <p className="font-medium">{t(`status.${event.status}`)}</p>
                  <p className="text-muted-foreground">
                    {event.changed_by_user_id
                      ? t("order.changedBy", { actor: t("order.system") })
                      : t("order.timelineCreated")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
