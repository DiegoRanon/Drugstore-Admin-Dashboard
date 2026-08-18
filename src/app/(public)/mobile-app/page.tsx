import { getTranslations } from "next-intl/server";
import { Smartphone } from "lucide-react";

import { SignOutButton } from "@/components/shell/sign-out-button";

/**
 * Where a driver lands if their credentials reach this dashboard. Every admin
 * endpoint would answer 403, so a plain explanation beats a broken UI
 * (PRD 4.4).
 */
export const dynamic = "force-dynamic";

export default async function MobileAppPage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center">
        <Smartphone className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">{t("login.driverTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("login.driverBody")}</p>
        <div className="mt-6 flex justify-center">
          <SignOutButton variant="outline" />
        </div>
      </div>
    </main>
  );
}
