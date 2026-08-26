"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Flag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { ORDER_STATUSES } from "@/lib/orders";
import { cn } from "@/lib/utils";

const ANY = "any";

type DriverOption = { id: string; name: string };
type PatientOption = { id: string; name: string };

/**
 * Filters live in the URL, so the server does the filtering and a filtered view
 * is a shareable link. Changing any filter resets pagination — accumulating
 * pages from a previous filter set would mix two result sets together.
 */
export function OrdersFilters({ drivers }: { drivers: DriverOption[] }) {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const date = params.get("date") ?? "";
  const status = params.get("status") ?? ANY;
  const driverId = params.get("driver_id") ?? ANY;
  const clientId = params.get("client_id");
  // The API takes the string enum "true"/"false", not a boolean.
  const priority = params.get("is_priority") === "true";

  const apply = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === ANY) next.delete(key);
      else next.set(key, value);
    }

    // A new filter set starts at page one.
    next.delete("pages");

    const query = next.toString();
    startTransition(() => router.push(query ? `/orders?${query}` : "/orders"));
  };

  const hasFilters =
    Boolean(date) || status !== ANY || driverId !== ANY || Boolean(clientId) || priority;

  // Base UI Select shows the raw value unless `items` maps values → labels.
  const statusItems: Record<string, string> = {
    [ANY]: t("history.anyStatus"),
    ...Object.fromEntries(ORDER_STATUSES.map((value) => [value, t(`status.${value}`)])),
  };
  const driverItems: Record<string, string> = {
    [ANY]: t("history.anyDriver"),
    ...Object.fromEntries(drivers.map((driver) => [driver.id, driver.name])),
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="filter-date" className="shrink-0 text-xs">
          {t("history.date")}
        </Label>
        <Input
          id="filter-date"
          type="date"
          value={date}
          onChange={(event) => apply({ date: event.target.value })}
          className="w-[11rem]"
        />
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="filter-status" className="shrink-0 text-xs">
          {t("history.status")}
        </Label>
        <Select
          value={status}
          onValueChange={(value) => apply({ status: value })}
          items={statusItems}
        >
          <SelectTrigger id="filter-status" className="w-[12rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{statusItems[ANY]}</SelectItem>
            {ORDER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {statusItems[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="filter-driver" className="shrink-0 text-xs">
          {t("history.driver")}
        </Label>
        <Select
          value={driverId}
          onValueChange={(value) => apply({ driver_id: value })}
          items={driverItems}
        >
          <SelectTrigger id="filter-driver" className="w-[12rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{driverItems[ANY]}</SelectItem>
            {drivers.map((driver) => (
              <SelectItem key={driver.id} value={driver.id}>
                {driver.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PatientFilter
        selectedId={clientId}
        onSelect={(id) => apply({ client_id: id })}
      />

      <Button
        variant={priority ? "secondary" : "outline"}
        size="sm"
        aria-pressed={priority}
        className="gap-1.5"
        onClick={() => apply({ is_priority: priority ? null : "true" })}
      >
        <Flag className="size-3.5" aria-hidden />
        {t("history.priorityOnly")}
      </Button>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            apply({
              date: null,
              status: null,
              driver_id: null,
              client_id: null,
              is_priority: null,
            })
          }
        >
          <X className="size-3.5" aria-hidden />
          {t("history.clear")}
        </Button>
      )}
    </div>
  );
}

/**
 * Patients are searched on demand rather than listed up front: the roster can be
 * long, and preloading it would put patient names into this page's payload
 * whether or not the filter is ever used (PRD 3.1).
 */
function PatientFilter({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PatientOption[]>([]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        fetch(`/api/clients/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          cache: "no-store",
        })
          .then((response) => (response.ok ? response.json() : { data: [] }))
          .then((payload: { data: PatientOption[] }) => setOptions(payload.data))
          .catch(() => {});
      },
      query ? 250 : 0,
    );

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, query]);

  const selected = options.find((option) => option.id === selectedId);

  return (
    <div className="flex items-center gap-2">
      <Label className="shrink-0 text-xs">{t("history.patient")}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" role="combobox" className="w-[14rem] justify-between font-normal" />
          }
        >
          <span className="truncate">
            {selected?.name ?? (selectedId ? t("history.patient") : t("history.anyPatient"))}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[16rem] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t("clients.search")}
            />
            <CommandList>
              <CommandEmpty>{t("newDelivery.patientEmpty")}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={ANY}
                  onSelect={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("size-4", selectedId ? "opacity-0" : "opacity-100")}
                  />
                  {t("history.anyPatient")}
                </CommandItem>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => {
                      onSelect(option.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        option.id === selectedId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {option.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
