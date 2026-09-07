import { getTranslations } from "next-intl/server";
import { TriangleAlert } from "lucide-react";

import { PasswordForm } from "@/components/settings/password-form";
import { PharmacyForm } from "@/components/settings/pharmacy-form";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { Separator } from "@/components/ui/separator";
import { getOrganization } from "@/lib/dal/organization";
import { requireSession } from "@/lib/dal/session";

/** Renders the signed-in user's own details behind the session. */
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const t = await getTranslations();
  const { user } = await requireSession();
  const organization = await getOrganization();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">{t("settings.profile")}</h2>
        <Separator className="my-4" />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t("login.email")}</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("drivers.name")}</dt>
            <dd className="font-medium">
              {user.first_name} {user.last_name}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">{t("settings.pharmacy")}</h2>
        <Separator className="my-4" />

        {/*
          The address here is the depot the route optimizer starts from and
          returns to, so this is a routing setting wearing a profile's
          clothes. The form says so rather than leaving an admin to wonder why
          a contact detail lives next to their password.
        */}
        <p className="mb-4 text-sm text-muted-foreground">
          {t("settings.pharmacyIntro")}
        </p>

        <PharmacyForm
          located={organization.latitude !== null}
          defaultValue={{
            address: organization.address ?? "",
            place_id: organization.place_id,
            formatted_address: organization.formatted_address,
            latitude: organization.latitude,
            longitude: organization.longitude,
          }}
        />
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

        <PasswordForm />
      </section>
    </div>
  );
}
