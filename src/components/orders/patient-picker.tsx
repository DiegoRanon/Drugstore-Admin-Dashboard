"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, LoaderCircle, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * What the picker renders, plus the geocode it hands to the order form.
 *
 * `notes` deliberately stays on the server. The coordinates come along because
 * an order created from a saved patient should inherit the address they
 * already standardized — re-picking it from Places would bill a second lookup
 * to learn something we know.
 */
export type PickerClient = {
  id: string;
  name: string;
  address: string;
  phone_number: string;
  place_id: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Searches saved patients on demand.
 *
 * Fetched when opened rather than preloaded: the trigger appears on every screen
 * via the sidebar, and preloading would serialize the patient list into the HTML
 * payload of pages that never open it (PRD 3.1). The endpoint returns active
 * patients only — a deactivated one must not become the target of a new
 * delivery.
 */
export function PatientPicker({
  selected,
  onSelect,
}: {
  selected: PickerClient | null;
  onSelect: (client: PickerClient) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<PickerClient[]>([]);
  const [loading, setLoading] = useState(false);

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className="flex items-center gap-2 truncate">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          {selected?.name || t("newDelivery.patientSearch")}
        </span>
        <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
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
                    onSelect(client);
                    setOpen(false);
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
                    <span className="text-xs text-muted-foreground">{client.address}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
