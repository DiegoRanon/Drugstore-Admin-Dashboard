import { getTranslations } from "next-intl/server";

import { ORG } from "@/fixtures";

export default async function HelpPage() {
  const t = await getTranslations();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("nav.help")}</h1>
      <section className="rounded-lg border bg-card p-5 text-sm">
        <p className="font-medium">{ORG.name}</p>
        <p className="mt-1 font-mono text-muted-foreground">{ORG.phone}</p>
      </section>
    </div>
  );
}
