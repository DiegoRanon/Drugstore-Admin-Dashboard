import { getLocale, getTranslations } from "next-intl/server";

import { InviteActions } from "@/components/invites/invite-actions";
import { InviteToolbar } from "@/components/invites/invite-toolbar";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/config";
import { listInvites } from "@/lib/dal/invites";
import { requireSession } from "@/lib/dal/session";
import { intlLocale } from "@/lib/format";

/** Behind the session, so never prerendered and never cached. */
export const dynamic = "force-dynamic";

/** Printed on a sheet and typed by hand, so it reads in two groups of four. */
function grouped(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

export default async function InvitesPage() {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  await requireSession();

  const invites = await listInvites();

  const date = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("invites.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("invites.subtitle")}</p>
        </div>
        <InviteToolbar />
      </div>

      {invites.length === 0 && (
        <div className="rounded-lg border bg-card px-6 py-12 text-center">
          <p className="font-medium">{t("invites.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("invites.emptyHint")}</p>
        </div>
      )}

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

              {/*
                A redeemed code cannot be revoked, and revoking would not remove
                the driver it created — so the control is hidden rather than
                shown and left to fail (PRD 5.6).
              */}
              <div className="mt-4 flex gap-2 no-print">
                <InviteActions
                  inviteId={invite.id}
                  code={invite.code}
                  canRevoke={!redeemed && invite.is_active}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
