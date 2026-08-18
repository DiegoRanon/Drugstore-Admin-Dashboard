import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { NewClientForm } from "@/components/clients/new-client-form";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { requireSession } from "@/lib/dal/session";

/** Renders patient data: never prerendered, never cached (PRD 8.2). */
export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const t = await getTranslations();
  await requireSession();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {/* A list route, not an audited detail read — safe to prefetch. */}
            <BreadcrumbLink render={<Link href="/clients" />}>
              {t("nav.patients")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("clients.newTitle")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold">{t("clients.newTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("clients.newSubtitle")}</p>
      </div>

      <div className="rounded-lg border bg-card">
        <NewClientForm />
      </div>
    </div>
  );
}
