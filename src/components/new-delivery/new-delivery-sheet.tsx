"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, PackagePlus } from "lucide-react";

import { OrderForm } from "@/components/orders/order-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Quick-add: pick a saved patient, confirm the prefill, choose a window, save.
 *
 * Order entry happens both in bulk at opening and throughout the day, so the
 * drawer covers the common case and "Enregistrer et ajouter un autre" keeps it
 * open for the next one. A first-time patient goes to the full page, which can
 * create the patient record first.
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <PackagePlus className="size-5 text-primary" aria-hidden />
            {t("newDelivery.title")}
          </SheetTitle>
          <SheetDescription className="flex items-center justify-between gap-2">
            <span className="sr-only">{t("newDelivery.deliveryInfo")}</span>
            <Link
              href="/orders/new"
              className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
              onClick={() => onOpenChange(false)}
            >
              {t("newDelivery.fullForm")}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </SheetDescription>
        </SheetHeader>

        <OrderForm
          mode="create"
          compact
          defaults={{ deliveryDate: defaultDate }}
          onSaved={({ again }) => {
            // "Save and add another" keeps the drawer open for the next entry.
            if (!again) onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
