"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  LoaderCircle,
  Pencil,
  Phone,
  Search,
  TriangleAlert,
  UserCheck,
} from "lucide-react";

import type { Client } from "@/api/types";
import {
  deactivateClientAction,
  reactivateClientAction,
  updateClientAction,
} from "@/app/(dashboard)/clients/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { shortReference } from "@/lib/orders";
import { cn } from "@/lib/utils";

/**
 * The patient directory.
 *
 * Search runs server-side through the URL, but *selection* is local state: the
 * list endpoint already returns every field this panel shows, so clicking rows
 * costs no extra request — and, more importantly, writes no extra
 * `client.detail.read` row into the accountability log (PRD 8.1).
 */
export function ClientsWorkspace({
  clients,
  hasMore,
  pages,
}: {
  clients: Client[];
  hasMore: boolean;
  pages: number;
}) {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const { showFailure, showSuccess } = useActionFeedback();

  const [selectedId, setSelectedId] = useState<string | null>(clients[0]?.id ?? null);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [isPending, startTransition] = useTransition();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [reminder, setReminder] = useState<string | null>(null);

  const includeInactive = params.get("inactive") === "1";
  const selected = clients.find((client) => client.id === selectedId) ?? null;

  // Push the search term into the URL so the server does the filtering.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query) next.set("q", query);
      else next.delete("q");
      next.delete("pages");
      router.push(next.size > 0 ? `/clients?${next.toString()}` : "/clients");
    }, 300);

    return () => clearTimeout(timer);
  }, [query, params, router]);

  function toggleInactive() {
    const next = new URLSearchParams(params.toString());
    if (includeInactive) next.delete("inactive");
    else next.set("inactive", "1");
    next.delete("pages");
    router.push(`/clients?${next.toString()}`);
  }

  function loadMore() {
    const next = new URLSearchParams(params.toString());
    next.set("pages", String(pages + 1));
    router.push(`/clients?${next.toString()}`, { scroll: false });
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateClientAction(selected.id, formData);

      if (!result.ok) {
        showFailure(result);
        return;
      }

      // The server returns `compliance_reminder` whenever the instructions field
      // holds content. Nothing is stripped server-side, so showing it is the
      // control (PRD 5.4).
      setReminder(result.data.complianceReminder);
      showSuccess(t("toast.clientUpdated"));
      router.refresh();
    });
  }

  function setActive(active: boolean) {
    if (!selected) return;

    startTransition(async () => {
      const result = active
        ? await reactivateClientAction(selected.id)
        : await deactivateClientAction(selected.id);

      if (!result.ok) {
        showFailure(result);
        return;
      }

      showSuccess(active ? t("toast.clientReactivated") : t("toast.clientDeactivated"));
      setConfirmDeactivate(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("clients.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("clients.subtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm min-w-[16rem]">
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
          <Button variant="outline" size="sm" onClick={toggleInactive}>
            {includeInactive ? t("clients.hideInactive") : t("clients.showInactive")}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
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
                {clients.map((client) => {
                  const active = client.id === selectedId;
                  return (
                    <tr
                      key={client.id}
                      onClick={() => {
                        setSelectedId(client.id);
                        setReminder(null);
                      }}
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
                        {!client.is_active && (
                          <Badge variant="secondary" className="ml-2">
                            {t("drivers.inactive")}
                          </Badge>
                        )}
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
                            setReminder(null);
                          }}
                        >
                          <Pencil className="size-4 text-primary" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {clients.length === 0 && (
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

          {clients.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t("common.showing", { count: clients.length })}
              </p>
              {hasMore && (
                <Button variant="outline" onClick={loadMore}>
                  {t("common.loadMore")}
                </Button>
              )}
            </div>
          )}
        </div>

        {selected ? (
          <aside className="h-fit rounded-lg border bg-card p-5">
            <form onSubmit={save} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">{selected.name}</h2>
                <p className="font-mono text-sm text-muted-foreground">
                  {shortReference(selected.id)}
                </p>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="name">{t("newDelivery.fullName")}</Label>
                <Input
                  id="name"
                  name="name"
                  key={`name-${selected.id}`}
                  defaultValue={selected.name}
                  maxLength={255}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address">{t("clients.address")}</Label>
                <Input
                  id="address"
                  name="address"
                  key={`address-${selected.id}`}
                  defaultValue={selected.address}
                  maxLength={500}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone_number">{t("clients.primaryContact")}</Label>
                <div className="relative">
                  <Phone
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="phone_number"
                    name="phone_number"
                    key={`phone-${selected.id}`}
                    defaultValue={selected.phone_number}
                    className="pl-9 font-mono"
                    maxLength={50}
                    required
                  />
                </div>
              </div>

              <Separator />

              {/*
                Labelled "Consignes de livraison", not "Notes": the name shapes
                what gets typed into it, and this field must not become a shadow
                medical record. Nothing is stripped server-side, so this screen
                is the actual control (PRD 5.4).
              */}
              <div className="space-y-1.5">
                <Label htmlFor="notes">{t("clients.instructions")}</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  key={`notes-${selected.id}`}
                  defaultValue={selected.notes ?? ""}
                  placeholder={t("clients.instructionsPlaceholder")}
                  rows={4}
                  maxLength={500}
                />
              </div>

              {/* Adjacent to the field and not dismissible — never a toast. */}
              <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden
                />
                {reminder ?? selected.compliance_reminder ?? t("clients.complianceReminder")}
              </p>

              <div className="grid grid-cols-2 gap-3">
                {selected.is_active ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setConfirmDeactivate(true)}
                  >
                    {t("clients.deactivate")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={isPending}
                    onClick={() => setActive(true)}
                  >
                    <UserCheck className="size-4" aria-hidden />
                    {t("clients.reactivate")}
                  </Button>
                )}

                <Button type="submit" className="gap-2" disabled={isPending}>
                  {isPending && (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  )}
                  {t("clients.update")}
                </Button>
              </div>
            </form>
          </aside>
        ) : (
          <aside className="h-fit rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            {t("clients.selectHint")}
          </aside>
        )}
      </div>

      <Dialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clients.deactivateConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("clients.deactivateConfirmBody", { name: selected?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeactivate(false)}
              disabled={isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={() => setActive(false)} disabled={isPending} className="gap-2">
              {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("clients.deactivate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
