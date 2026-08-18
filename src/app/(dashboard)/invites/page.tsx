import { getLocale, getTranslations } from "next-intl/server";
import { Plus, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INVITES } from "@/fixtures";
import type { Locale } from "@/i18n/config";
import { intlLocale } from "@/lib/format";

/** Printed on a sheet and typed by hand, so it reads in two groups of four. */
function grouped(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

export default async function InvitesPage() {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const invites = INVITES;

  const date = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("invites.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("invites.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 no-print">
            <Printer className="size-4" aria-hidden />
            {t("invites.print")}
          </Button>
          <Button className="gap-2">
            <Plus className="size-4" aria-hidden />
            {t("invites.generate")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {invites.map((invite) => {
          const redeemed = invite.redeemed_at !== null;
          return (
            <article key={invite.id} className="rounded-lg border bg-card p-5">
              <p className="font-mono text-2xl font-bold tracking-[0.2em] uppercase">
                {grouped(invite.code)}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <Badge variant={redeemed ? "secondary" : invite.is_active ? "default" : "outline"}>
                  {redeemed
                    ? t("invites.redeemed")
                    : invite.is_active
                      ? t("invites.active")
                      : t("invites.revoked")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t("invites.created")} {date.format(new Date(invite.created_at))}
                </span>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {invite.expires_at
                  ? `${t("invites.expires")} ${date.format(new Date(invite.expires_at))}`
                  : t("invites.neverExpires")}
              </p>

              <div className="mt-4 flex gap-2 no-print">
                <Button variant="outline" size="sm">
                  {t("invites.copy")}
                </Button>
                {/*
                  A redeemed code cannot be revoked (409), and revoking would not
                  remove the driver it created — Phase 7 points the admin at the
                  roster instead of showing a button that always fails.
                */}
                {!redeemed && invite.is_active && (
                  <Button variant="outline" size="sm">
                    {t("invites.revoke")}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
