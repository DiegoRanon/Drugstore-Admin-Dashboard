"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { ChevronDown, LoaderCircle, User, UserMinus } from "lucide-react";

import { assignDriverAction } from "@/app/(dashboard)/orders/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionFeedback } from "@/hooks/use-action-feedback";

export type AssignableDriver = { id: string; name: string };

/**
 * Assigning is the main action of the morning, and the one place an optimistic
 * update belongs: the server has no rule that refuses a reassignment of an open
 * order, so the card can move immediately (PRD 6.5).
 *
 * If the request does fail, the optimistic value is discarded and the board is
 * refetched — the UI shows what actually happened rather than what was hoped.
 */
export function AssignDriverMenu({
  orderId,
  currentDriverId,
  drivers,
  size = "sm",
}: {
  orderId: string;
  currentDriverId: string | null;
  /** Already filtered to `is_active` by the caller. */
  drivers: AssignableDriver[];
  size?: "sm" | "default";
}) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const [optimisticDriverId, setOptimisticDriverId] = useOptimistic(currentDriverId);
  const [isPending, startTransition] = useTransition();

  const assigned = drivers.find((driver) => driver.id === optimisticDriverId);

  function assign(driverId: string | null) {
    startTransition(async () => {
      setOptimisticDriverId(driverId);

      const result = await assignDriverAction(orderId, driverId);

      if (!result.ok) {
        showFailure(result);
        // Discard the optimistic guess and re-read the truth.
        router.refresh();
        return;
      }

      const driver = drivers.find((candidate) => candidate.id === result.data.driverId);
      showSuccess(
        driver
          ? t("toast.driverAssigned", { driver: driver.name })
          : t("toast.driverUnassigned"),
      );
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size={size} className="gap-1.5" />}
        disabled={isPending}
      >
        {isPending ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <User className="size-3.5" aria-hidden />
        )}
        {assigned ? assigned.name : t("order.assign")}
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {drivers.map((driver) => (
          <DropdownMenuItem
            key={driver.id}
            disabled={driver.id === optimisticDriverId}
            onClick={() => assign(driver.id)}
          >
            <User className="size-4" aria-hidden />
            {driver.name}
          </DropdownMenuItem>
        ))}

        {drivers.length === 0 && (
          <DropdownMenuItem disabled>{t("drivers.empty")}</DropdownMenuItem>
        )}

        {optimisticDriverId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => assign(null)}>
              <UserMinus className="size-4" aria-hidden />
              {t("order.unassign")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
