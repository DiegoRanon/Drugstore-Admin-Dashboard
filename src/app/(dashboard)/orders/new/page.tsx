import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserPlus } from "lucide-react";

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
import { listDrivers } from "@/lib/dal/drivers";
import { requireSession } from "@/lib/dal/session";
import { shortName, todayIn } from "@/lib/format";

/** Renders patient data: never prerendered, never cached (PRD 8.2). */
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const t = await getTranslations();
  const session = await requireSession();

  // Only employed drivers can be assigned work (PRD 5.3).
  const drivers = await listDrivers();
  const assignableDrivers = drivers
    .filter((driver) => driver.is_active)
    .map((driver) => ({
      id: driver.id,
      name: shortName(driver.first_name, driver.last_name),
    }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>{t("nav.deliveries")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("newDelivery.title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("newDelivery.title")}</h1>
        {/*
          The API requires a `client_id`, so a first-time patient has to exist as
          a saved record before a delivery can reference them.
        */}
        <Button variant="outline" className="gap-2" render={<Link href="/clients/new" />}>
          <UserPlus className="size-4" aria-hidden />
          {t("clients.new")}
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <OrderForm
          mode="create"
          drivers={assignableDrivers}
          defaults={{ deliveryDate: todayIn(session.organization.timezone) }}
        />
      </div>
    </div>
  );
}
