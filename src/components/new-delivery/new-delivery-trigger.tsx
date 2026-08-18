"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { NewDeliverySheet } from "@/components/new-delivery/new-delivery-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NewDeliveryTrigger({
  defaultDate,
  className,
}: {
  /** The pharmacy's today, resolved server-side in its own timezone. */
  defaultDate: string;
  className?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button className={cn("gap-2", className)} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {t("nav.newDelivery")}
      </Button>
      {/* Mounted only once opened, so nothing is fetched until it is wanted. */}
      {open && (
        <NewDeliverySheet open={open} onOpenChange={setOpen} defaultDate={defaultDate} />
      )}
    </>
  );
}
