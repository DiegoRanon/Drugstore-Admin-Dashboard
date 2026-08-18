"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronsUpDown,
  LoaderCircle,
  PackagePlus,
  Search,
  Snowflake,
} from "lucide-react";

import type { DeliveryWindow, PaymentStatus } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const SECTION = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

/** Only what the picker renders. `notes` deliberately stays on the server. */
type PickerClient = {
  id: string;
  name: string;
  address: string;
  phone_number: string;
};

/**
 * Quick-add for the common case: pick a saved patient, confirm the prefill,
 * choose a window, save.
 *
 * The patient list is fetched when the drawer opens rather than preloaded, so
 * patient data does not sit in the HTML payload of every page that shows the
 * trigger (PRD 3.1).
 *
 * Phase 5 wires the two save buttons to a Server Action against
 * `POST /v1/orders`; the fields below are presentational until then.
 */
export function NewDeliverySheet({
  open,
  onOpenChange,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
}) {
  const t = useTranslations();

  const [clients, setClients] = useState<PickerClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PickerClient | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [window, setWindow] = useState<DeliveryWindow>("AM");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");

  // Search server-side: the roster can be long, and the API already indexes
  // name and phone.
  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setLoading(true);
        fetch(`/api/clients/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          cache: "no-store",
        })
          .then((response) => (response.ok ? response.json() : { data: [] }))
          .then((payload: { data: PickerClient[] }) => setClients(payload.data))
          .catch(() => {})
          .finally(() => setLoading(false));
      },
      query ? 250 : 0,
    );

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, query]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <PackagePlus className="size-5 text-primary" aria-hidden />
            {t("newDelivery.title")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("newDelivery.deliveryInfo")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-2">
            <p className={SECTION}>{t("newDelivery.patient")}</p>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="w-full justify-between font-normal"
                  />
                }
              >
                <span className="flex items-center gap-2 truncate">
                  <Search className="size-4 text-muted-foreground" aria-hidden />
                  {selected ? selected.name : t("newDelivery.patientSearch")}
                </span>
                <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[var(--radix-popover-trigger-width)] p-0"
              >
                {/* Filtering happens on the server, so cmdk must not also filter. */}
                <Command shouldFilter={false}>
                  <CommandInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder={t("newDelivery.patientSearch")}
                  />
                  <CommandList>
                    {loading && (
                      <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin" aria-hidden />
                        {t("common.loading")}
                      </div>
                    )}
                    {!loading && <CommandEmpty>{t("newDelivery.patientEmpty")}</CommandEmpty>}
                    <CommandGroup>
                      {clients.map((client) => (
                        <CommandItem
                          key={client.id}
                          value={client.id}
                          onSelect={() => {
                            setSelected(client);
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "size-4",
                              client.id === selected?.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="flex flex-col">
                            <span>{client.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {client.address}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </section>

          <Separator />

          {/*
            Prefilled from the saved patient but editable, and snapshotted onto
            the order at creation — editing the patient later never rewrites a
            past delivery (PRD 5.3).
          */}
          <section className="space-y-4">
            <p className={SECTION}>{t("newDelivery.deliveryInfo")}</p>

            <div className="space-y-1.5">
              <Label htmlFor="qa-name">{t("newDelivery.fullName")}</Label>
              <Input
                id="qa-name"
                key={`n-${selected?.id ?? "none"}`}
                defaultValue={selected?.name ?? ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qa-address">{t("newDelivery.address")}</Label>
              <Input
                id="qa-address"
                key={`a-${selected?.id ?? "none"}`}
                defaultValue={selected?.address ?? ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qa-phone">{t("newDelivery.phone")}</Label>
              <Input
                id="qa-phone"
                inputMode="tel"
                className="font-mono"
                key={`p-${selected?.id ?? "none"}`}
                defaultValue={selected?.phone_number ?? ""}
              />
            </div>
          </section>

          <Separator />

          <section className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qa-date">{t("newDelivery.deliveryDate")}</Label>
              <Input id="qa-date" type="date" defaultValue={defaultDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-window">{t("newDelivery.window")}</Label>
              <Select
                value={window}
                onValueChange={(value) => setWindow(value as DeliveryWindow)}
              >
                <SelectTrigger id="qa-window" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">{t("newDelivery.windowAm")}</SelectItem>
                  <SelectItem value="PM">{t("newDelivery.windowPm")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <p className={SECTION}>{t("newDelivery.paymentOptions")}</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("newDelivery.paymentStatus")}</Label>
                <div
                  role="group"
                  className="grid grid-cols-2 rounded-md border bg-background p-0.5"
                >
                  {(["unpaid", "paid"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={paymentStatus === value}
                      onClick={() => setPaymentStatus(value)}
                      className={cn(
                        "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                        paymentStatus === value
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`payment.${value}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="qa-amount">
                  {t("newDelivery.amount", { currency: "$ CA" })}
                </Label>
                <Input
                  id="qa-amount"
                  inputMode="decimal"
                  className="text-right font-mono"
                  placeholder="0,00"
                  disabled={paymentStatus === "paid"}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-md border bg-background px-3 py-3 text-sm">
              <Checkbox id="qa-cooler" />
              <Snowflake className="size-4 text-cooler" aria-hidden />
              {t("newDelivery.coolerBag")}
            </label>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" disabled>
            {t("newDelivery.saveAndAddAnother")}
          </Button>
          <Button disabled>{t("newDelivery.save")}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
