import { getTranslations } from "next-intl/server";
import { CarFront, HelpCircle, KeyRound, Settings, Truck, Users } from "lucide-react";

import { NavLink } from "@/components/shell/nav-link";
import { NewDeliveryTrigger } from "@/components/new-delivery/new-delivery-trigger";
import { Separator } from "@/components/ui/separator";

export async function Sidebar({ orgName }: { orgName: string }) {
  const t = await getTranslations();
  const iconProps = { className: "size-[18px]", strokeWidth: 2 };

  return (
    <aside className="no-print flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="px-4 py-5">
        <p className="text-base leading-tight font-semibold text-sidebar-primary">
          {orgName}
        </p>
        <p className="text-xs text-muted-foreground">{t("app.subtitle")}</p>
      </div>

      <div className="px-4 pb-4">
        <NewDeliveryTrigger className="w-full" />
      </div>

      <nav aria-label={t("nav.deliveries")} className="flex flex-col gap-1 px-3">
        <NavLink href="/" exact label={t("nav.deliveries")} icon={<Truck {...iconProps} />} />
        <NavLink href="/clients" label={t("nav.patients")} icon={<Users {...iconProps} />} />
        <NavLink href="/drivers" label={t("nav.drivers")} icon={<CarFront {...iconProps} />} />
        <NavLink href="/invites" label={t("nav.codes")} icon={<KeyRound {...iconProps} />} />
      </nav>

      <div className="mt-auto px-3 pb-4">
        <Separator className="mb-3" />
        <div className="flex flex-col gap-1">
          <NavLink
            href="/settings"
            label={t("nav.settings")}
            icon={<Settings {...iconProps} />}
          />
          <NavLink
            href="/help"
            label={t("nav.help")}
            icon={<HelpCircle {...iconProps} />}
          />
        </div>
      </div>
    </aside>
  );
}
