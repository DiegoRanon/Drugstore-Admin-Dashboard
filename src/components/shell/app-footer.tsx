import { getTranslations } from "next-intl/server";

export async function AppFooter({ orgName }: { orgName: string }) {
  const t = await getTranslations();

  return (
    <footer className="no-print border-t bg-card px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <p className="font-medium">
          {t("app.footer", { year: new Date().getFullYear(), org: orgName })}
        </p>
        <nav className="ml-auto flex gap-4">
          <span>{t("app.footerLinks.instructions")}</span>
          <span>{t("app.footerLinks.compliance")}</span>
          <span>{t("app.footerLinks.support")}</span>
        </nav>
      </div>
    </footer>
  );
}
