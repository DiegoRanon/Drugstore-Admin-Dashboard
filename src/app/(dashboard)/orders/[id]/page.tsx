import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Flag,
  History,
  Package,
  Phone,
  Snowflake,
  Truck,
  TriangleAlert,
  Undo2,
  UserCheck,
  Wallet,
} from "lucide-react";

import type { OrderTransition } from "@/api/types";
import { StatusChip } from "@/components/board/status-chip";
import { AssignDriverMenu } from "@/components/orders/assign-driver-menu";
import { CancelOrderButton } from "@/components/orders/cancel-order-button";
import { MarkReadyButton } from "@/components/orders/mark-ready-button";
import { PriorityToggle } from "@/components/orders/priority-toggle";
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
import {
  hasPaymentDiscrepancy,
  isAwaitingHandover,
  isEditable,
  isTerminal,
  shortReference,
} from "@/lib/orders";
import { cn } from "@/lib/utils";

/**
 * Only these transitions belong to an admin. `pickup`, `complete`, `return`,
 * and `handover` are driver actions — they can appear in
 * `available_transitions` and must still never render a button here.
 */
const ADMIN_TRANSITIONS: OrderTransition[] = ["mark_ready", "cancel"];

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

  // Only employed drivers can be assigned work (PRD 5.3).
  const assignableDrivers = drivers
    .filter((candidate) => candidate.is_active)
    .map((candidate) => ({
      id: candidate.id,
      name: shortName(candidate.first_name, candidate.last_name),
    }));

  const discrepancy = hasPaymentDiscrepancy(order);
  const editable = isEditable(order.status);
  const open = !isTerminal(order.status);

  // The server accepts a count that disagrees with the order and logs it: the
  // physical bags on the counter are the truth, and a driver standing there
  // with an employee must not be blocked. So this is information, not an error.
  const packageMismatch =
    order.pickup_package_count !== null &&
    order.pickup_package_count !== order.package_count;

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
            {order.is_priority && (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-picked-up-soft px-2 py-0.5 text-xs font-semibold text-status-picked-up">
                <Flag className="size-3 fill-current" aria-hidden />
                {t("order.priority")}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            Editing after pickup would mean the delivery in progress no longer
            matches the record of it, so the control explains itself rather than
            letting the user submit and collect a 422 (PRD 5.3).
          */}
          {editable ? (
            <Button
              variant="outline"
              render={<Link href={`/orders/${order.id}/edit`} prefetch={false} />}
            >
              {t("order.edit")}
            </Button>
          ) : (
            <Button variant="outline" disabled title={t("order.editDisabled")}>
              {t("order.edit")}
            </Button>
          )}

          {open && <PriorityToggle orderId={order.id} isPriority={order.is_priority} size="default" />}

          {/* Rendered from `available_transitions`; never re-derived here. */}
          {actions.includes("mark_ready") && <MarkReadyButton orderId={order.id} />}
          {actions.includes("cancel") && <CancelOrderButton orderId={order.id} />}

          {open && (
            <AssignDriverMenu
              orderId={order.id}
              currentDriverId={order.driver_id}
              drivers={assignableDrivers}
              size="default"
            />
          )}
        </div>
      </div>

      {!editable && (
        <p className="text-sm text-muted-foreground">{t("order.editDisabled")}</p>
      )}

      {/*
        `returned` is not terminal: the delivery failed but the package is in
        the driver's van and the pharmacy is owed a handover. Saying so here is
        the whole reason this status exists separately from
        `returned_to_pharmacy`.
      */}
      {isAwaitingHandover(order.status) && (
        <div className="flex items-start gap-3 rounded-lg border border-status-returned/30 bg-status-returned-soft px-4 py-3">
          <Undo2 className="mt-0.5 size-4 shrink-0 text-status-returned" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-status-returned">
              {t("order.awaitingHandoverTitle")}
            </p>
            <p className="text-muted-foreground">{t("order.awaitingHandoverBody")}</p>
          </div>
        </div>
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
                  {order.requested_delivery_time && (
                    <span className="ml-2 font-mono text-sm text-muted-foreground">
                      {t("order.requestedTime", { time: order.requested_delivery_time })}
                    </span>
                  )}
                </p>
              </div>

              {/*
                Who may take the package at the door. PII, like the name and
                address it sits beside.
              */}
              {order.authorized_recipient && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">
                    {t("order.authorizedRecipient")}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5">
                    <UserCheck className="size-4 text-muted-foreground" aria-hidden />
                    {order.authorized_recipient}
                  </p>
                </div>
              )}
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

          {/*
            The label codes printed on the bags, which the driver checks against
            the counter at pickup. There is no description field here by design:
            a free-text line item is exactly where a medication name would end
            up (privacy-rules.md §3).
          */}
          <section className="relative overflow-hidden rounded-lg border bg-card">
            <span className="absolute inset-y-0 left-0 w-1 bg-muted-foreground/30" aria-hidden />
            <header className="flex items-center gap-2 border-b px-5 py-3">
              <Package className="size-5 text-muted-foreground" aria-hidden />
              <h2 className="text-lg font-semibold">{t("order.packages")}</h2>
              <span className="ml-auto text-sm text-muted-foreground">
                {t("order.packageCount", { count: order.package_count })}
              </span>
            </header>

            {order.packages.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                {t("order.packagesEmpty")}
              </p>
            ) : (
              <ul className="divide-y">
                {order.packages.map((pkg) => (
                  <li key={pkg.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="font-mono font-medium">{pkg.label_code}</span>
                    <span className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t(`packageType.${pkg.package_type}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {packageMismatch && (
              <div className="mx-5 mb-4 flex items-start gap-3 rounded-md border bg-muted/50 px-4 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="text-sm">
                  <p className="font-medium">
                    {t("order.pickupCountMismatch", {
                      counted: order.pickup_package_count ?? 0,
                      expected: order.package_count,
                    })}
                  </p>
                  <p className="text-muted-foreground">{t("order.pickupCountNote")}</p>
                </div>
              </div>
            )}
          </section>

          {/*
            Why the delivery failed, in the driver's words. `failure_note` is
            admin-only and never reaches a driver response (privacy-rules.md §3).
          */}
          {order.failure_reason && (
            <section className="relative overflow-hidden rounded-lg border border-status-returned/30 bg-card">
              <span className="absolute inset-y-0 left-0 w-1 bg-status-returned" aria-hidden />
              <header className="flex items-center gap-2 border-b px-5 py-3">
                <Undo2 className="size-5 text-status-returned" aria-hidden />
                <h2 className="text-lg font-semibold">{t("order.failure")}</h2>
              </header>

              <div className="px-5 py-4">
                <p className="font-medium">
                  {t(`failureReason.${order.failure_reason}`)}
                </p>
                {order.failure_note && (
                  <p className="mt-1 text-sm text-muted-foreground">{order.failure_note}</p>
                )}
              </div>
            </section>
          )}

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

            {/*
              The pharmacy authorised handing the package over without taking
              payment. This is what explains a completed-but-unpaid order, and
              is the field that will feed end-of-shift reconciliation.
            */}
            {order.payment_exception && (
              <div className="mx-5 mb-4 flex items-start gap-3 rounded-md border bg-muted/50 px-4 py-3">
                <UserCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="text-sm">
                  <p className="font-medium">
                    {t(`paymentException.${order.payment_exception}`)}
                  </p>
                  {order.payment_exception_note && (
                    <p className="text-muted-foreground">{order.payment_exception_note}</p>
                  )}
                </div>
              </div>
            )}

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

          {/*
            Every transition timestamp the order carries is already an entry
            here — `ready_at`, `returned_to_pharmacy_at`, and the rest are the
            same moments as their `status_events` rows.
          */}
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
