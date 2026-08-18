"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Phone, Search, TriangleAlert } from "lucide-react";

import type { Client } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { shortReference } from "@/lib/orders";
import { cn } from "@/lib/utils";

/**
 * The instructions field is the compliance boundary. Nothing is stripped
 * server-side, so this screen is the actual control that keeps it from becoming
 * a shadow medical record — hence the label, the placeholder, and a reminder
 * pinned next to the field rather than shown in a toast that gets dismissed
 * (PRD 5.4).
 */
export function ClientsWorkspace({ clients }: { clients: Client[] }) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(clients[0]?.id ?? null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(needle) ||
        client.phone_number.toLowerCase().includes(needle),
    );
  }, [clients, query]);

  const selected = clients.find((client) => client.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("clients.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("clients.subtitle")}</p>
        </div>

        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("clients.search")}
            aria-label={t("clients.search")}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("clients.nameAndId")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("clients.address")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("clients.phone")}
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  {t("clients.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((client) => {
                const active = client.id === selectedId;
                return (
                  <tr
                    key={client.id}
                    onClick={() => setSelectedId(client.id)}
                    aria-selected={active}
                    className={cn(
                      "cursor-pointer border-t transition-colors",
                      active ? "bg-accent/60" : "hover:bg-muted/40",
                    )}
                  >
                    <td className="relative px-4 py-3">
                      {active && (
                        <span
                          className="absolute inset-y-0 left-0 w-1 bg-primary"
                          aria-hidden
                        />
                      )}
                      <span className="font-medium">{client.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {shortReference(client.id)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{client.address}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {client.phone_number}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("clients.editAria", { name: client.name })}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(client.id);
                        }}
                      >
                        <Pencil className="size-4 text-primary" />
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {visible.length === 0 && (
                <tr className="border-t">
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="font-medium text-foreground">{t("clients.empty")}</p>
                    <p className="mt-1 text-sm">{t("clients.emptyHint")}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected ? (
          <aside className="h-fit rounded-lg border bg-card p-5">
            <h2 className="text-xl font-bold">{selected.name}</h2>
            <p className="font-mono text-sm text-muted-foreground">
              {shortReference(selected.id)}
            </p>

            <Separator className="my-4" />

            <p className="text-xs font-semibold text-muted-foreground uppercase">
              {t("clients.primaryContact")}
            </p>
            <p className="mt-1 flex items-center gap-2 font-mono">
              <Phone className="size-4 text-muted-foreground" aria-hidden />
              {selected.phone_number}
            </p>

            <Separator className="my-4" />

            <label
              htmlFor="client-instructions"
              className="text-xs font-semibold text-muted-foreground uppercase"
            >
              {t("clients.instructions")}
            </label>
            <Textarea
              id="client-instructions"
              key={selected.id}
              defaultValue={selected.notes ?? ""}
              placeholder={t("clients.instructionsPlaceholder")}
              rows={4}
              className="mt-2"
            />

            <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              {selected.compliance_reminder ?? t("clients.complianceReminder")}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {/* Soft delete: the server flips `is_active`, so the word is "Deactivate". */}
              <Button variant="outline">{t("clients.deactivate")}</Button>
              <Button>{t("clients.update")}</Button>
            </div>
          </aside>
        ) : (
          <aside className="h-fit rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            {t("clients.selectHint")}
          </aside>
        )}
      </div>
    </div>
  );
}
