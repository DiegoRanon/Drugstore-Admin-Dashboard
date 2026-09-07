"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LoaderCircle, MapPin, TriangleAlert } from "lucide-react";

import { updatePharmacyAddressAction } from "@/app/(dashboard)/settings/actions";
import {
  AddressPicker,
  type AddressValue,
} from "@/components/orders/address-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useActionFeedback } from "@/hooks/use-action-feedback";

/**
 * The pharmacy's address, which is also the depot.
 *
 * WHY THIS SITS IN SETTINGS AND NOT IN ONBOARDING
 *
 * A pharmacy that moves, or one whose address was typed by hand at signup,
 * needs to fix this itself. The consequence of a missing coordinate is not
 * cosmetic — routes are solved as open tours that can start anywhere, and the
 * driver app's ETAs degrade entirely — but nothing in either product says so,
 * which is exactly why the banner below is loud about it.
 */
export function PharmacyForm({
  defaultValue,
  located,
}: {
  defaultValue: AddressValue;
  /** Whether a depot coordinate is stored right now. */
  located: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setFieldErrors({});
      const result = await updatePharmacyAddressAction(formData);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        if (result.code !== "VALIDATION_FAILED") showFailure(result);
        return;
      }

      // Saving an address Google could not place is allowed, but it leaves
      // the depot empty — so it is a different message, not a quieter one.
      showSuccess(
        result.data.located
          ? t("settings.pharmacySaved")
          : t("settings.pharmacySavedUnlocated"),
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {!located && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("settings.pharmacyNoDepot")}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="pharmacy-address">{t("settings.pharmacyAddress")}</Label>
        <AddressPicker
          id="pharmacy-address"
          name="address"
          defaultValue={defaultValue}
          required
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {t("settings.pharmacyAddressHint")}
        </p>
        {fieldErrors.address?.[0] && (
          <p className="text-sm text-destructive" role="alert">
            {t("common.required")}
          </p>
        )}
      </div>

      <Button type="submit" className="w-fit gap-2" disabled={isPending}>
        {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {t("settings.savePharmacy")}
      </Button>
    </form>
  );
}
