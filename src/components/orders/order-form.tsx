"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Flag, LoaderCircle, Plus, Snowflake, Trash2 } from "lucide-react";

import type { DeliveryWindow, PackageType, PaymentStatus } from "@/api/types";
import { createOrderAction, updateOrderAction } from "@/app/(dashboard)/orders/actions";
import {
  AddressPicker,
  emptyAddress,
  type AddressValue,
} from "@/components/orders/address-picker";
import type { AssignableDriver } from "@/components/orders/assign-driver-menu";
import { PatientPicker, type PickerClient } from "@/components/orders/patient-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import type { ActionFailure } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

const SECTION = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

const PACKAGE_TYPES: PackageType[] = ["bag", "cooler", "tote", "envelope"];
const MAX_PACKAGES = 50;

export type OrderFormPackage = { labelCode: string; packageType: PackageType };

export type OrderFormDefaults = {
  clientId?: string;
  driverId?: string | null;
  patientName?: string;
  address?: string;
  /** The geocode already stored on the order, when editing one. */
  addressGeocode?: Omit<AddressValue, "address">;
  phoneNumber?: string;
  deliveryDate: string;
  deliveryWindow?: DeliveryWindow;
  requestedTimeStart?: string | null;
  requestedTimeEnd?: string | null;
  paymentStatus?: PaymentStatus;
  amountDue?: number | null;
  requiresCoolerBag?: boolean;
  isPriority?: boolean;
  packages?: OrderFormPackage[];
};

/** A row in the package editor. `key` keeps React stable across removals. */
type PackageRow = OrderFormPackage & { key: string };

/**
 * One form for creating and editing a delivery, shared by the quick-add drawer
 * and the full page so the two cannot drift apart.
 *
 * Patient name, address, and phone are prefilled from the saved patient but stay
 * editable, and the server snapshots them onto the order — editing the patient
 * record later never rewrites where a past package went (PRD 5.3).
 *
 * No medical, pharmaceutical, or prescription field exists here, and that
 * includes the package rows: a label code and a closed type enum, with nowhere
 * to type a medication name (MVP §4, privacy-rules.md §3).
 */
export function OrderForm({
  mode,
  orderId,
  defaults,
  drivers,
  onSaved,
  compact = false,
}: {
  mode: "create" | "edit";
  orderId?: string;
  defaults: OrderFormDefaults;
  /**
   * Offered at creation so dispatch can assign while entering the order.
   * Omitted by the quick-add drawer, where assignment stays on the board.
   */
  drivers?: AssignableDriver[];
  /** Called after a successful save. `again` keeps the form open for the next one. */
  onSaved?: (result: { again: boolean; patientName: string }) => void;
  compact?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const formRef = useRef<HTMLFormElement>(null);

  // Row keys only have to be unique within this list. Seeded rows take their
  // index; rows added later take a counter that is only ever touched from an
  // event handler, never during render.
  const nextRowId = useRef(0);
  const addedRow = (row: OrderFormPackage): PackageRow => ({
    ...row,
    key: `added-${nextRowId.current++}`,
  });

  const [selected, setSelected] = useState<PickerClient | null>(
    defaults.clientId
      ? {
          id: defaults.clientId,
          name: defaults.patientName ?? "",
          address: defaults.address ?? "",
          phone_number: defaults.phoneNumber ?? "",
          place_id: defaults.addressGeocode?.place_id ?? null,
          formatted_address: defaults.addressGeocode?.formatted_address ?? null,
          latitude: defaults.addressGeocode?.latitude ?? null,
          longitude: defaults.addressGeocode?.longitude ?? null,
        }
      : null,
  );

  /**
   * The address the picker opens on, and the geocode that goes with it.
   *
   * A freshly chosen patient wins over the order's own defaults, which is what
   * makes selecting a patient prefill the field. Both are read at the same
   * time so the text and its coordinates can never come from different places
   * — an address from the patient with a coordinate from the order would route
   * the delivery somewhere the address does not say.
   */
  const addressDefault: AddressValue = selected
    ? {
        address: selected.address,
        place_id: selected.place_id,
        formatted_address: selected.formatted_address,
        latitude: selected.latitude,
        longitude: selected.longitude,
      }
    : {
        ...emptyAddress(defaults.address ?? ""),
        ...(defaults.addressGeocode ?? {}),
      };

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    defaults.paymentStatus ?? "unpaid",
  );
  const [requiresCooler, setRequiresCooler] = useState(defaults.requiresCoolerBag ?? false);
  const [packages, setPackages] = useState<PackageRow[]>(() =>
    (defaults.packages ?? []).map((row, index) => ({ ...row, key: `seed-${index}` })),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  // Bumping this key remounts the prefilled inputs when a different patient is
  // chosen, so `defaultValue` actually takes effect.
  const [formGeneration, setFormGeneration] = useState(0);

  /**
   * A cooler package forces `requires_cooler_bag` on the server, so the
   * checkbox follows rather than letting the two appear to disagree. The
   * disabled control submits nothing, which is fine: the schema applies the
   * same rule to the payload.
   */
  const coolerForced = packages.some((row) => row.packageType === "cooler");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>, again: boolean) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      setFieldErrors({});

      const reject = (failure: ActionFailure) => {
        setFieldErrors(failure.fieldErrors ?? {});
        showFailure(failure);
      };

      if (mode === "edit" && orderId) {
        const result = await updateOrderAction(orderId, formData);
        if (!result.ok) return reject(result);

        showSuccess(t("toast.orderUpdated"));
        router.push(`/orders/${orderId}`);
        router.refresh();
        return;
      }

      const result = await createOrderAction(formData);
      if (!result.ok) return reject(result);

      const { patientName } = result.data;
      showSuccess(t("toast.orderCreated", { patient: patientName }));

      if (again) {
        // Keep going: the morning run is a sequence of near-identical entries.
        form.reset();
        setSelected(null);
        setPaymentStatus("unpaid");
        setRequiresCooler(false);
        // `form.reset()` cannot clear rows that only exist in state.
        setPackages([]);
        setFormGeneration((generation) => generation + 1);
      }

      router.refresh();
      onSaved?.({ again, patientName });
    });
  }

  const errorFor = (field: string) => fieldErrors[field]?.[0];

  return (
    <form
      ref={formRef}
      onSubmit={(event) => handleSubmit(event, false)}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <div className={cn("flex-1 space-y-6 overflow-y-auto", compact ? "px-6 py-5" : "p-6")}>
        {mode === "create" && (
          <>
            <section className="space-y-2">
              <p className={SECTION}>{t("newDelivery.patient")}</p>
              <PatientPicker
                selected={selected}
                onSelect={(client) => {
                  setSelected(client);
                  setFormGeneration((generation) => generation + 1);
                }}
              />
              <input type="hidden" name="client_id" value={selected?.id ?? ""} />
              {errorFor("client_id") && (
                <p className="text-sm text-destructive">{t("common.required")}</p>
              )}
            </section>
            <Separator />
          </>
        )}

        <section className="space-y-4">
          <p className={SECTION}>{t("newDelivery.deliveryInfo")}</p>

          <Field
            id="patient_name"
            label={t("newDelivery.fullName")}
            error={errorFor("patient_name")}
          >
            <Input
              id="patient_name"
              name="patient_name"
              key={`name-${formGeneration}`}
              defaultValue={selected?.name ?? defaults.patientName ?? ""}
              maxLength={255}
              required
            />
          </Field>

          <Field id="address" label={t("newDelivery.address")} error={errorFor("address")}>
            {/*
              Remounted on formGeneration like the other prefilled fields: the
              picker holds the typed text and its geocode in state, so choosing
              a different patient has to reset both together.
            */}
            <AddressPicker
              id="address"
              name="address"
              key={`address-${formGeneration}`}
              defaultValue={addressDefault}
              required
            />
          </Field>

          <Field id="phone_number" label={t("newDelivery.phone")} error={errorFor("phone_number")}>
            <Input
              id="phone_number"
              name="phone_number"
              inputMode="tel"
              className="font-mono"
              key={`phone-${formGeneration}`}
              defaultValue={selected?.phone_number ?? defaults.phoneNumber ?? ""}
              maxLength={50}
              required
            />
          </Field>
        </section>

        <Separator />

        <section className="grid grid-cols-2 gap-4">
          <Field
            id="delivery_date"
            label={t("newDelivery.deliveryDate")}
            error={errorFor("delivery_date")}
          >
            <Input
              id="delivery_date"
              name="delivery_date"
              type="date"
              defaultValue={defaults.deliveryDate}
              required
            />
          </Field>

          <div className="space-y-1.5">
            <Label htmlFor="delivery_window">{t("newDelivery.window")}</Label>
            <Select name="delivery_window" defaultValue={defaults.deliveryWindow ?? "AM"}>
              <SelectTrigger id="delivery_window" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">{t("newDelivery.windowAm")}</SelectItem>
                <SelectItem value="PM">{t("newDelivery.windowPm")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {/*
          Optional, and narrower than the AM/PM window when the pharmacy has
          promised a patient something more specific. The route optimizer
          treats it as a constraint, so a range entered here actually moves the
          stop — which is also why leaving it blank is the right default: a
          made-up window is a promise nobody made.
        */}
        <section className="space-y-2">
          <p className={SECTION}>{t("newDelivery.timeRange")}</p>
          <div className="grid grid-cols-2 gap-4">
            <Field
              id="requested_time_start"
              label={t("newDelivery.timeRangeStart")}
              error={errorFor("requested_time_start")}
            >
              <Input
                id="requested_time_start"
                name="requested_time_start"
                type="time"
                defaultValue={defaults.requestedTimeStart ?? ""}
              />
            </Field>
            <Field
              id="requested_time_end"
              label={t("newDelivery.timeRangeEnd")}
              error={errorFor("requested_time_end")}
            >
              <Input
                id="requested_time_end"
                name="requested_time_end"
                type="time"
                defaultValue={defaults.requestedTimeEnd ?? ""}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("newDelivery.timeRangeHint")}
          </p>
        </section>

        {/*
          Dispatch usually knows who is driving the run while the order is being
          entered, so offering it here saves a second pass over the board. The
          board's own assign menu remains the place to change it later.
        */}
        {mode === "create" && drivers && drivers.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="driver_id">{t("order.assignDriver")}</Label>
            <Select
              name="driver_id"
              defaultValue=""
              items={{
                "": t("order.unassigned"),
                ...Object.fromEntries(drivers.map((driver) => [driver.id, driver.name])),
              }}
            >
              <SelectTrigger id="driver_id" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("order.unassigned")}</SelectItem>
                {drivers.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Separator />

        {/*
          The label codes printed on the bags. The driver checks these against
          the counter at pickup, which is the only reason they exist — there is
          deliberately no free-text field beside them.
        */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className={SECTION}>{t("order.packages")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={packages.length >= MAX_PACKAGES}
              onClick={() =>
                setPackages((rows) => [...rows, addedRow({ labelCode: "", packageType: "bag" })])
              }
            >
              <Plus aria-hidden />
              {t("order.addPackage")}
            </Button>
          </div>

          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("order.packagesEmptyHint")}</p>
          ) : (
            <ul className="space-y-2">
              {packages.map((row, index) => (
                <li key={row.key} className="flex items-center gap-2">
                  <Input
                    name="package_label_code"
                    aria-label={t("order.labelCode")}
                    placeholder={t("order.labelCodePlaceholder")}
                    className="font-mono"
                    maxLength={32}
                    defaultValue={row.labelCode}
                  />
                  <Select
                    name="package_type"
                    value={row.packageType}
                    onValueChange={(value) =>
                      setPackages((rows) =>
                        rows.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? { ...candidate, packageType: value as PackageType }
                            : candidate,
                        ),
                      )
                    }
                    items={Object.fromEntries(
                      PACKAGE_TYPES.map((value) => [value, t(`packageType.${value}`)]),
                    )}
                  >
                    <SelectTrigger aria-label={t("order.packageType")} className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PACKAGE_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`packageType.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("order.removePackage")}
                    onClick={() =>
                      setPackages((rows) => rows.filter((candidate) => candidate.key !== row.key))
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {errorFor("packages") && (
            <p className="text-sm text-destructive">{t("order.packagesInvalid")}</p>
          )}
        </section>

        <Separator />

        <section className="space-y-4">
          <p className={SECTION}>{t("newDelivery.paymentOptions")}</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("newDelivery.paymentStatus")}</Label>
              <div
                role="group"
                aria-label={t("newDelivery.paymentStatus")}
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
              <input type="hidden" name="payment_status" value={paymentStatus} />
            </div>

            <Field
              id="amount_due"
              label={t("newDelivery.amount", { currency: "$ CA" })}
              error={errorFor("amount_due")}
            >
              <Input
                id="amount_due"
                name="amount_due"
                inputMode="decimal"
                className="text-right font-mono"
                placeholder="0,00"
                key={`amount-${formGeneration}`}
                defaultValue={defaults.amountDue?.toString() ?? ""}
                // Nothing is owed at the door on an order already paid for.
                disabled={paymentStatus === "paid"}
              />
            </Field>
          </div>

          <label className="flex items-center gap-3 rounded-md border bg-background px-3 py-3 text-sm">
            <Checkbox
              id="requires_cooler_bag"
              name="requires_cooler_bag"
              checked={requiresCooler || coolerForced}
              disabled={coolerForced}
              onCheckedChange={(checked) => setRequiresCooler(checked === true)}
            />
            <Snowflake className="size-4 text-cooler" aria-hidden />
            {t("newDelivery.coolerBag")}
            {coolerForced && (
              <span className="ml-auto text-xs text-muted-foreground">
                {t("order.coolerForced")}
              </span>
            )}
          </label>

          <label className="flex items-center gap-3 rounded-md border bg-background px-3 py-3 text-sm">
            <Checkbox
              id="is_priority"
              name="is_priority"
              defaultChecked={defaults.isPriority ?? false}
            />
            <Flag className="size-4 text-status-picked-up" aria-hidden />
            {t("order.priorityAdd")}
          </label>
        </section>
      </div>

      <div
        className={cn(
          "flex items-center justify-end gap-2 border-t",
          compact ? "px-6 py-4" : "p-6",
        )}
      >
        {mode === "create" && (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              const form = formRef.current;
              if (!form) return;
              // Re-dispatch through the same handler with `again` set.
              handleSubmit(
                {
                  preventDefault: () => {},
                  currentTarget: form,
                } as unknown as React.FormEvent<HTMLFormElement>,
                true,
              );
            }}
          >
            {t("newDelivery.saveAndAddAnother")}
          </Button>
        )}

        <Button type="submit" className="gap-2" disabled={isPending}>
          {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {isPending ? t("order.saving") : t("newDelivery.save")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
