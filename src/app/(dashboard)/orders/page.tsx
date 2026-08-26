import Link from "next/link";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";

import type { Order, OrderStatus } from "@/api/types";
import { StatusChip } from "@/components/board/status-chip";
import { LoadMore } from "@/components/orders/load-more";
import { OrdersFilters } from "@/components/orders/orders-filters";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/config";
import { listDrivers } from "@/lib/dal/drivers";
import { getOrderHistory, type OrderFilters } from "@/lib/dal/orders";
import { requireSession } from "@/lib/dal/session";
import { formatMoney, formatPlainDate, shortName } from "@/lib/format";
import { indexDrivers, ORDER_STATUSES, shortReference } from "@/lib/orders";

/** Renders patient data: never prerendered, never cached (PRD 8.2). */
export const dynamic = "force-dynamic";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OrderHistoryPage({ searchParams }: PageProps<"/orders">) {
  const t = await getTranslations();
  const params = await searchParams;
  await requireSession();

  // Everything reaching the API is validated here: a hand-edited query string
  // must not turn into a 422 from the server.
  const date = first(params.date);
  const status = first(params.status);
  const driverId = first(params.driver_id);
  const clientId = first(params.client_id);
  const isPriority = first(params.is_priority);
  const pagesParam = Number(first(params.pages) ?? 1);

  const filters: OrderFilters = {
    date: date && PLAIN_DATE.test(date) ? date : undefined,
    status:
      status && ORDER_STATUSES.includes(status as OrderStatus)
        ? (status as OrderStatus)
        : undefined,
    driver_id: driverId && UUID.test(driverId) ? driverId : undefined,
    client_id: clientId && UUID.test(clientId) ? clientId : undefined,
    is_priority: isPriority === "true" || isPriority === "false" ? isPriority : undefined,
  };

  const pages = Number.isFinite(pagesParam) && pagesParam > 0 ? Math.floor(pagesParam) : 1;
  const drivers = await listDrivers();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("history.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("history.subtitle")}</p>
      </div>

      <Suspense fallback={<Skeleton className="h-[4.5rem] w-full rounded-lg" />}>
        <OrdersFilters
          drivers={drivers.map((driver) => ({
            id: driver.id,
            name: `${driver.first_name} ${driver.last_name}`,
          }))}
        />
      </Suspense>

      <Suspense
        key={JSON.stringify({ filters, pages })}
        fallback={<Skeleton className="h-96 w-full rounded-lg" />}
      >
        <HistoryTable filters={filters} pages={pages} />
      </Suspense>
    </div>
  );
}

async function HistoryTable({
  filters,
  pages,
}: {
  filters: OrderFilters;
  pages: number;
}) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;

  const [{ orders, hasMore }, drivers] = await Promise.all([
    getOrderHistory(filters, pages),
    listDrivers(),
  ]);

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-16 text-center">
        <p className="font-medium">{t("history.empty")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("history.emptyHint")}</p>
      </div>
    );
  }

  const driverIndex = indexDrivers(drivers);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        {/*
          No sortable column headers: sorting is fixed server-side (newest
          first) and there is no `?sort=` parameter, so making headers look
          interactive would promise something the API cannot do (PRD 6.3).
        */}
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("history.reference")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("history.date")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("order.patient")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("history.window")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("history.status")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("history.driver")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                {t("history.payment")}
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <HistoryRow
                key={order.id}
                order={order}
                driverName={driverNameFor(order, driverIndex)}
                locale={locale}
                unassignedLabel={t("order.unassigned")}
                paidLabel={t("payment.paid")}
                unpaidLabel={t("payment.unpaid")}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        {/*
          An honest count of what is loaded. Never "247 results": the API
          returns no total, deliberately, so pages stay stable while orders are
          created all day (PRD 6.3).
        */}
        <p className="text-sm text-muted-foreground">
          {t("common.showing", { count: orders.length })}
        </p>
        {hasMore ? <LoadMore pages={pages} /> : (
          <p className="text-sm text-muted-foreground">{t("history.endOfList")}</p>
        )}
      </div>
    </div>
  );
}

function driverNameFor(order: Order, drivers: ReturnType<typeof indexDrivers>) {
  if (!order.driver_id) return null;
  const driver = drivers.get(order.driver_id);
  return driver ? shortName(driver.first_name, driver.last_name) : null;
}

function HistoryRow({
  order,
  driverName,
  locale,
  unassignedLabel,
  paidLabel,
  unpaidLabel,
}: {
  order: Order;
  driverName: string | null;
  locale: Locale;
  unassignedLabel: string;
  paidLabel: string;
  unpaidLabel: string;
}) {
  return (
    <tr className="border-t">
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {/*
          Audit-logged destination: prefetching this on viewport entry would
          record an access no human performed (PRD 8.1).
        */}
        <Link
          href={`/orders/${order.id}`}
          prefetch={false}
          className="hover:underline focus-visible:underline"
        >
          #{shortReference(order.id)}
        </Link>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {formatPlainDate(order.delivery_date, locale, "medium")}
      </td>
      <td className="px-4 py-3">
        {/* The order's own snapshot, not the client record (PRD 5.3). */}
        <span className="font-medium">{order.patient_name}</span>
        <span className="block text-xs text-muted-foreground">{order.address}</span>
      </td>
      <td className="px-4 py-3">{order.delivery_window}</td>
      <td className="px-4 py-3">
        <StatusChip status={order.status} />
      </td>
      <td className="px-4 py-3 text-muted-foreground">{driverName ?? unassignedLabel}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span
          className={
            order.payment_status === "unpaid"
              ? "font-medium text-unpaid"
              : "font-medium text-paid"
          }
        >
          {order.payment_status === "unpaid" ? unpaidLabel : paidLabel}
        </span>
        {order.amount_due !== null && (
          <span className="block text-xs text-muted-foreground">
            {formatMoney(order.amount_due, locale)}
          </span>
        )}
      </td>
    </tr>
  );
}
