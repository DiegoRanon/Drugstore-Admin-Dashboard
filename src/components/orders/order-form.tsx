"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { LoaderCircle, Snowflake } from "lucide-react";

import type { DeliveryWindow, PaymentStatus } from "@/api/types";
import { createOrderAction, updateOrderAction } from "@/app/(dashboard)/orders/actions";
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

export type OrderFormDefaults = {
  clientId?: string;
  patientName?: string;
  address?: string;
  phoneNumber?: string;
  deliveryDate: string;
  deliveryWindow?: DeliveryWindow;
  paymentStatus?: PaymentStatus;
  amountDue?: number | null;
  requiresCoolerBag?: boolean;
};

/**
 * One form for creating and editing a delivery, shared by the quick-add drawer
 * and the full page so the two cannot drift apart.
 *
 * Patient name, address, and phone are prefilled from the saved patient but stay
 * editable, and the server snapshots them onto the order — editing the patient
 * record later never rewrites where a past package went (PRD 5.3).
 *
 * No medical, pharmaceutical, or prescription field exists here. The API has
 * nowhere to put such data and the UI must not invite it (MVP §4).
 */
export function OrderForm({
  mode,
  orderId,
  defaults,
  onSaved,
  compact = false,
}: {
  mode: "create" | "edit";
  orderId?: string;
  defaults: OrderFormDefaults;
  /** Called after a successful save. `again` keeps the form open for the next one. */
  onSaved?: (result: { again: boolean; patientName: string }) => void;
  compact?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState<PickerClient | null>(
    defaults.clientId
      ? {
          id: defaults.clientId,
          name: defaults.patientName ?? "",
          address: defaults.address ?? "",
          phone_number: defaults.phoneNumber ?? "",
        }
      : null,
  );

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    defaults.paymentStatus ?? "unpaid",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  // Bumping this key remounts the prefilled inputs when a different patient is
  // chosen, so `defaultValue` actually takes effect.
  const [formGeneration, setFormGeneration] = useState(0);

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
            <Input
              id="address"
              name="address"
              key={`address-${formGeneration}`}
              defaultValue={selected?.address ?? defaults.address ?? ""}
              maxLength={500}
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
              defaultChecked={defaults.requiresCoolerBag ?? false}
            />
            <Snowflake className="size-4 text-cooler" aria-hidden />
            {t("newDelivery.coolerBag")}
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
