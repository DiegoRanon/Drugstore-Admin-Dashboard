import { getTranslations } from "next-intl/server";
import { TriangleAlert } from "lucide-react";

import { LocaleToggle } from "@/components/shell/locale-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ADMIN } from "@/fixtures";

export default async function SettingsPage() {
  const t = await getTranslations();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">{t("settings.profile")}</h2>
        <Separator className="my-4" />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t("login.email")}</dt>
            <dd className="font-medium">{ADMIN.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("drivers.name")}</dt>
            <dd className="font-medium">
              {ADMIN.first_name} {ADMIN.last_name}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">{t("settings.language")}</h2>
        <Separator className="my-4" />
        <LocaleToggle />
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">{t("settings.password")}</h2>
        <Separator className="my-4" />

        {/*
          Changing a password revokes every session including this one, so the
          warning comes before the form, not after the submit (PRD 5.7).
        */}
        <p className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          {t("settings.passwordWarning")}
        </p>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">{t("settings.currentPassword")}</Label>
            <Input id="current-password" type="password" autoComplete="current-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t("settings.newPassword")}</Label>
            <Input id="new-password" type="password" autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">{t("settings.confirmPassword")}</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" />
          </div>
          <Button className="w-fit">{t("settings.changePassword")}</Button>
        </div>
      </section>
    </div>
  );
}
