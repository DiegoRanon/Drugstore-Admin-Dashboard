import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { LocaleToggle } from "@/components/shell/locale-toggle";

/** The only unauthenticated screen. */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xl font-semibold text-primary">{t("login.title")}</p>
          <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-xs">
          {/* `useSearchParams` needs a boundary in a server-rendered page. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <div className="mt-6 flex justify-center">
          <LocaleToggle />
        </div>
      </div>
    </main>
  );
}
