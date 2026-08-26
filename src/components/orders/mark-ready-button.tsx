"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { LoaderCircle, PackageCheck } from "lucide-react";

import { markReadyAction } from "@/app/(dashboard)/orders/actions";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/hooks/use-action-feedback";

/**
 * "The bags are packed and on the counter": `scheduled` -> `in_pharmacy`.
 *
 * This is the step that makes an order visible to a driver at all — a
 * `scheduled` order is excluded from every driver query, so without this tap
 * nothing else in the lifecycle can happen.
 *
 * No confirmation dialog: staff run through a counter full of orders one at a
 * time and a modal per order would fight that rhythm. The action is also cheap
 * to undo — an order marked ready by mistake can still be cancelled or edited.
 * The bulk version does ask, because it releases the whole batch at once.
 */
export function MarkReadyButton({
  orderId,
  size = "default",
}: {
  orderId: string;
  size?: "sm" | "default";
}) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();
  const [isPending, startTransition] = useTransition();

  function markReady() {
    startTransition(async () => {
      const result = await markReadyAction(orderId);

      if (!result.ok) {
        showFailure(result);
        // Whatever the order is now, show that.
        router.refresh();
        return;
      }

      showSuccess(t("toast.orderMarkedReady"));
      router.refresh();
    });
  }

  return (
    <Button variant="default" size={size} className="gap-1.5" disabled={isPending} onClick={markReady}>
      {isPending ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : (
        <PackageCheck aria-hidden />
      )}
      {t("order.markReady")}
    </Button>
  );
}
