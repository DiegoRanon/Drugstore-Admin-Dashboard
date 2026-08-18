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
import type { Locale } from "@/i18n/config";
import { ApiError } from "@/lib/api/errors";
import { listDrivers } from "@/lib/dal/drivers";
import { getOrder } from "@/lib/dal/orders";
import { requireSession } from "@/lib/dal/session";
import { formatMoney, formatTimestamp, shortName } from "@/lib/format";
import { hasPaymentDiscrepancy, isTerminal, shortReference } from "@/lib/orders";
import { cn } from "@/lib/utils";

/**
 * Only these transitions belong to an admin. `pickup`, `complete`, and `return`
 * are driver actions — they can appear in `available_transitions` and must
 * still never render a button here.
 */
const ADMIN_TRANSITIONS: OrderTransition[] = ["cancel"];

/** Renders patient data: never prerendered, never cached (PRD 8.2). */
export const dynamic = "force-dynamic";

/**
 * This read is audit-logged server-side — one row per call, recording who saw
 * which patient's information. An unknown id must therefore land on a 404, not
 * on a retry loop that writes the same row repeatedly.
 */
async function loadOrder(id: string) {
  try {
    return await getOrder(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations();
  const session = await requireSession();

  const [order, drivers] = await Promise.all([loadOrder(id), listDrivers()]);
  const driver = order.driver_id
    ? drivers.find((candidate) => candidate.id === order.driver_id)
    : undefined;

  const discrepancy = hasPaymentDiscrepancy(order);
  const editable = order.status === "in_pharmacy";

  /**
   * Status events carry `changed_by_user_id` and nothing else, so the name is
   * resolved against the people we already know: the signed-in admin and the
   * driver roster. A null actor is the order's own creation.
   */
  const resolveActor = (userId: string | null): string => {
    if (!userId) return t("order.timelineCreated");

    if (userId === session.user.id) {
      return t("order.changedBy", {
        actor: `${session.user.first_name} ${session.user.last_name}`,
      });
    }

    const actor = drivers.find((candidate) => candidate.id === userId);
    return t("order.changedBy", {
      actor: actor ? shortName(actor.first_name, actor.last_name) : t("order.system"),
    });
  };

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

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t("nav.drivers")}
                </p>
                <p className="mt-1">
                  {driver
                    ? shortName(driver.first_name, driver.last_name)
                    : t("order.unassigned")}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t("newDelivery.window")}
                </p>
                <p className="mt-1">
                  {order.delivery_window} · {order.delivery_date}
                </p>
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
                    {resolveActor(event.changed_by_user_id)}
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
