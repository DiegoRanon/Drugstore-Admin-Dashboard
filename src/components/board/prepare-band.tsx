"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LoaderCircle, PackageCheck } from "lucide-react";

import { markAllReadyAction } from "@/app/(dashboard)/orders/actions";
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
 * The morning batch, in one tap.
 *
 * Staff pack a counter full of bags and declare them ready together, so the
 * board offers the whole day's `scheduled` orders as a single action. This one
 * *does* confirm first: it releases every one of them to drivers at once, and
 * unlike a single order there is no obvious way to eyeball what is about to
 * change.
 *
 * There is no bulk endpoint behind this — the action issues one request per
 * order and reports how many landed, because half a batch reaching the drivers
 * is exactly the situation staff have to be told about.
 */
export function PrepareBand({ orderIds }: { orderIds: string[] }) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const count = orderIds.length;
  if (count === 0) return null;

  function confirm() {
    startTransition(async () => {
      const result = await markAllReadyAction(orderIds);
      setOpen(false);

      if (!result.ok) {
        showFailure(result);
        router.refresh();
        return;
      }

      const { succeeded, failed } = result.data;

      const firstFailure = failed[0];

      if (firstFailure) {
        // Report the reason the first one gave, and let the refreshed band
        // show what is left: a band still reading "2 to prepare" is a more
        // useful account of a partial batch than any toast could be.
        showFailure({ ok: false, code: firstFailure.code, requestId: null });
      } else {
        showSuccess(t("toast.ordersMarkedReady", { count: succeeded }));
      }

      router.refresh();
    });
  }

  return (
    <>
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-status-scheduled/30 bg-status-scheduled-soft px-4 py-2.5">
        <PackageCheck className="size-4 text-status-scheduled" aria-hidden />
        <p className="text-sm font-semibold text-status-scheduled">
          {t("board.toPrepare", { count })}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-1.5 bg-card"
          onClick={() => setOpen(true)}
          disabled={isPending}
        >
          {isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {t("board.markAllReady")}
        </Button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("board.markAllReadyConfirmTitle", { count })}</DialogTitle>
            <DialogDescription>{t("board.markAllReadyConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button className="gap-2" onClick={confirm} disabled={isPending}>
              {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("board.markAllReady")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
