import { getTranslations } from "next-intl/server";

import { DriverRowActions } from "@/components/drivers/driver-row-actions";
import { Badge } from "@/components/ui/badge";
import { listDrivers } from "@/lib/dal/drivers";
import { requireSession } from "@/lib/dal/session";

/** Reads the roster behind the session: never prerendered, never cached. */
export const dynamic = "force-dynamic";

export default async function DriversPage() {
  const t = await getTranslations();
  await requireSession();

  // Small and rarely changed, so it is fetched whole and deduped per request.
  const drivers = await listDrivers();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{t("drivers.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("drivers.subtitle")}</p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("drivers.name")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("drivers.email")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("drivers.phone")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("drivers.state")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                {t("clients.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((driver) => (
              <tr key={driver.id} className="border-t">
                <td className="px-4 py-3 font-medium">
                  {driver.first_name} {driver.last_name}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{driver.email}</td>
                <td className="px-4 py-3 font-mono text-muted-foreground">
                  {driver.phone ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={driver.is_active ? "default" : "secondary"}>
                    {driver.is_active ? t("drivers.active") : t("drivers.inactive")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <DriverRowActions
                    driverId={driver.id}
                    firstName={driver.first_name}
                    isActive={driver.is_active}
                  />
                </td>
              </tr>
            ))}

            {drivers.length === 0 && (
              <tr className="border-t">
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <p className="font-medium text-foreground">{t("drivers.empty")}</p>
                  <p className="mt-1 text-sm">{t("drivers.emptyHint")}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
