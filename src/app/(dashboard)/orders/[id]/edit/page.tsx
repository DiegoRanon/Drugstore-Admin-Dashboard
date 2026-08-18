import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";

import { StatusChip } from "@/components/board/status-chip";
import { OrderForm } from "@/components/orders/order-form";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { getOrder } from "@/lib/dal/orders";
import { requireSession } from "@/lib/dal/session";
import { shortReference } from "@/lib/orders";

/** Renders patient data: never prerendered, never cached (PRD 8.2). */
export const dynamic = "force-dynamic";

async function loadOrder(id: string) {
  try {
    return await getOrder(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export default async function EditOrderPage({ params }: PageProps<"/orders/[id]/edit">) {
  const { id } = await params;
  const t = await getTranslations();
  await requireSession();

  const order = await loadOrder(id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>{t("nav.deliveries")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {/* Already-audited destination; prefetching it would forge a read. */}
            <BreadcrumbLink render={<Link href={`/orders/${order.id}`} prefetch={false} />}>
              #{shortReference(order.id)}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("order.edit")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{t("order.edit")}</h1>
        <StatusChip status={order.status} />
      </div>

      {/*
        The server accepts a PATCH only while the order is `in_pharmacy`. Once a
        driver holds the package, changing the address would mean the delivery in
        progress no longer matches the record of it — so this route refuses to
        render a form at all rather than letting someone submit and collect a 422
        (PRD 5.3).
      */}
      {order.status === "in_pharmacy" ? (
        <div className="rounded-lg border bg-card">
          <OrderForm
            mode="edit"
            orderId={order.id}
            defaults={{
              patientName: order.patient_name,
              address: order.address,
              phoneNumber: order.phone_number,
              deliveryDate: order.delivery_date,
              deliveryWindow: order.delivery_window,
              paymentStatus: order.payment_status,
              amountDue: order.amount_due,
              requiresCoolerBag: order.requires_cooler_bag,
            }}
          />
        </div>
      ) : (
        <div className="rounded-lg border bg-card px-6 py-12 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-4 font-medium">{t("order.editDisabled")}</p>
          <Button
            className="mt-6"
            variant="outline"
            render={<Link href={`/orders/${order.id}`} prefetch={false} />}
          >
            {t("order.breadcrumb")}
          </Button>
        </div>
      )}
    </div>
  );
}
