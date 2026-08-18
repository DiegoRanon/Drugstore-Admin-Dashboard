"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { cancelOrderAction } from "@/app/(dashboard)/orders/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActionFeedback } from "@/hooks/use-action-feedback";

/**
 * Cancel asks first, and is deliberately **not** optimistic.
 *
 * The server may legitimately refuse with `409 ORDER_INVALID_TRANSITION` because
 * a driver picked the package up while this dialog was open. In that case the
 * order is refetched and the real state shown — guessing would tell the
 * pharmacist a delivery was cancelled when it is out for delivery (PRD 6.5).
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await cancelOrderAction(orderId);

      if (!result.ok) {
        showFailure(result);
        setOpen(false);
        // Whatever the order is now, show that.
        router.refresh();
        return;
      }

      showSuccess(t("toast.orderCancelled"));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/5"
        onClick={() => setOpen(true)}
      >
        {t("order.cancel")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("order.cancelConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("order.cancelConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {t("order.keep")}
            </Button>
            <Button
              className="gap-2 bg-destructive text-white hover:bg-destructive/90"
              onClick={confirm}
              disabled={isPending}
            >
              {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("order.cancelConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
