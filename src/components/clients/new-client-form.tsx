"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { createClientAction } from "@/app/(dashboard)/clients/actions";
import { AddressPicker } from "@/components/orders/address-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/hooks/use-action-feedback";

export function NewClientForm() {
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
      const result = await createClientAction(formData);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        showFailure(result);
        return;
      }

      showSuccess(t("toast.clientCreated", { name: result.data.name }));
      router.push("/clients");
      router.refresh();
    });
  }

  const errorFor = (field: string) => fieldErrors[field]?.[0];

  return (
    <form onSubmit={submit} className="space-y-4 p-6" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="name">{t("newDelivery.fullName")}</Label>
        <Input id="name" name="name" maxLength={255} required autoFocus />
        {errorFor("name") && (
          <p className="text-sm text-destructive" role="alert">
            {t("common.required")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">{t("clients.address")}</Label>
        {/*
          Standardizing here is what makes every future order for this patient
          routable without the employee re-picking the address each time.
        */}
        <AddressPicker id="address" name="address" required />
        {errorFor("address") && (
          <p className="text-sm text-destructive" role="alert">
            {t("common.required")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone_number">{t("clients.phone")}</Label>
        <Input
          id="phone_number"
          name="phone_number"
          inputMode="tel"
          className="font-mono"
          maxLength={50}
          required
        />
        {errorFor("phone_number") && (
          <p className="text-sm text-destructive" role="alert">
            {t("common.required")}
          </p>
        )}
      </div>

      <Separator />

      {/*
        "Consignes de livraison", never "Notes". The label shapes what gets typed
        in, and nothing is stripped server-side — this is the control (PRD 5.4).
      */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">{t("clients.instructions")}</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={500}
          placeholder={t("clients.instructionsPlaceholder")}
        />
      </div>

      <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        {t("clients.complianceReminder")}
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" className="gap-2" disabled={isPending}>
          {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {t("clients.create")}
        </Button>
      </div>
    </form>
  );
}
