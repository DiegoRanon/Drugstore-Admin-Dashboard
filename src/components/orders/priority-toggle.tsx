"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { Flag } from "lucide-react";

import { setPriorityAction } from "@/app/(dashboard)/orders/actions";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { cn } from "@/lib/utils";

/**
 * Flags a stop the driver should reach first.
 *
 * Optimistic, like assignment: the server refuses this only on a terminal
 * order, and the caller does not render the control there. A failure discards
 * the guess and refetches.
 *
 * The flag reorders the *driver's* queue, not this board — the admin's view is
 * organised around who still needs a driver. Here it is a badge.
 */
export function PriorityToggle({
  orderId,
  isPriority,
  size = "sm",
}: {
  orderId: string;
  isPriority: boolean;
  size?: "sm" | "default";
}) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const [optimisticPriority, setOptimisticPriority] = useOptimistic(isPriority);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !optimisticPriority;

    startTransition(async () => {
      setOptimisticPriority(next);

      const result = await setPriorityAction(orderId, next);

      if (!result.ok) {
        showFailure(result);
        // Discard the optimistic guess and re-read the truth.
        router.refresh();
        return;
      }

      showSuccess(t(next ? "toast.priorityOn" : "toast.priorityOff"));
      router.refresh();
    });
  }

  return (
    <Button
      variant="outline"
      size={size}
      aria-pressed={optimisticPriority}
      title={t(optimisticPriority ? "order.priorityRemove" : "order.priorityAdd")}
      disabled={isPending}
      onClick={toggle}
      className={cn(
        "gap-1.5",
        optimisticPriority && "border-status-picked-up/40 text-status-picked-up",
      )}
    >
      <Flag
        className={cn(optimisticPriority && "fill-current")}
        aria-hidden
      />
      {t("order.priority")}
    </Button>
  );
}
