import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { UserPlus } from "lucide-react";

import { ClientsWorkspace } from "@/components/clients/clients-workspace";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getClientDirectory } from "@/lib/dal/clients";
import { requireSession } from "@/lib/dal/session";

/** Renders patient data: never prerendered, never cached (PRD 8.2). */
export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const t = await getTranslations();
  const params = await searchParams;
  await requireSession();

  const search = first(params.q)?.trim() || undefined;
  const includeInactive = first(params.inactive) === "1";
  const requested = Number(first(params.pages) ?? 1);
  const pages = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button className="gap-2" render={<Link href="/clients/new" />}>
          <UserPlus className="size-4" aria-hidden />
          {t("clients.new")}
        </Button>
      </div>

      <Suspense
        key={`${search ?? ""}-${includeInactive}-${pages}`}
        fallback={<Skeleton className="h-96 w-full rounded-lg" />}
      >
        <Directory search={search} includeInactive={includeInactive} pages={pages} />
      </Suspense>
    </div>
  );
}

async function Directory({
  search,
  includeInactive,
  pages,
}: {
  search: string | undefined;
  includeInactive: boolean;
  pages: number;
}) {
  const { clients, hasMore } = await getClientDirectory({ search, includeInactive }, pages);

  return <ClientsWorkspace clients={clients} hasMore={hasMore} pages={pages} />;
}
