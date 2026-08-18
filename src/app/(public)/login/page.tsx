import { getTranslations } from "next-intl/server";

import { LocaleToggle } from "@/components/shell/locale-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORG } from "@/fixtures";

/** The only unauthenticated screen. Phase 2 wires it to `/api/auth/login`. */
export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xl font-semibold text-primary">{ORG.name}</p>
          <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-xs">
          <h1 className="text-lg font-semibold">{t("login.title")}</h1>

          <form className="mt-5 grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            <Button type="submit" className="mt-1 w-full">
              {t("login.submit")}
            </Button>
          </form>
        </div>

        <div className="mt-6 flex justify-center">
          <LocaleToggle />
        </div>
      </div>
    </main>
  );
}
