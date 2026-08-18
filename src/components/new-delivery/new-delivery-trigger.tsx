"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { NewDeliverySheet } from "@/components/new-delivery/new-delivery-sheet";
import { Button } from "@/components/ui/button";
// Phase 0 only. Phase 5 passes the client list down from a Server Component so
// patient data crosses the client boundary once, deliberately, and only the
// fields the drawer actually renders.
import { CLIENTS, TODAY } from "@/fixtures";
import { cn } from "@/lib/utils";

export function NewDeliveryTrigger({ className }: { className?: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button className={cn("gap-2", className)} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {t("nav.newDelivery")}
      </Button>
      <NewDeliverySheet
        open={open}
        onOpenChange={setOpen}
        clients={CLIENTS}
        defaultDate={TODAY}
      />
    </>
  );
}
