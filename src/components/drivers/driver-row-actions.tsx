"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { setDriverActiveAction } from "@/app/(dashboard)/drivers/actions";
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
 * The only interactive part of the roster.
 *
 * The table itself stays a Server Component; this takes the three fields it
 * actually renders rather than the whole driver, so nothing extra is serialized
 * into the document (PRD 3.1).
 */
export function DriverRowActions({
  driverId,
  firstName,
  isActive,
}: {
  driverId: string;
  firstName: string;
  isActive: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const [confirming, setConfirming] = useState(false);
  /**
   * Set only after a deactivation that left deliveries assigned. The count is
   * on the PATCH response and nowhere else — the roster endpoint does not carry
   * it — so this prompt cannot be shown before the change is made.
   */
  const [strandedOrders, setStrandedOrders] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function apply(nextActive: boolean) {
    startTransition(async () => {
      const result = await setDriverActiveAction(driverId, nextActive);

      if (!result.ok) {
        showFailure(result);
        return;
      }

      setConfirming(false);
      showSuccess(
        nextActive
          ? t("toast.driverActivated", { name: firstName })
          : t("toast.driverDeactivated", { name: firstName }),
      );

      if (!nextActive && result.data.activeOrderCount > 0) {
        setStrandedOrders(result.data.activeOrderCount);
      }

      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => (isActive ? setConfirming(true) : apply(true))}
      >
        {isActive ? t("drivers.deactivate") : t("drivers.activate")}
      </Button>

      {/*
        The consequence is stated before the button does anything: this signs
        the driver out of the mobile app immediately (PRD 5.5).
      */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("drivers.deactivateTitle", { name: firstName })}</DialogTitle>
            <DialogDescription className="flex items-start gap-2 pt-1 text-left">
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-hidden
              />
              {t("drivers.deactivateBody", { name: firstName })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => apply(false)}
              disabled={isPending}
            >
              {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("drivers.deactivate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivation is not blocked by open deliveries, but leaving them
          stranded is the likely mistake — so it is raised straight after. */}
      <Dialog
        open={strandedOrders !== null}
        onOpenChange={(open) => !open && setStrandedOrders(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("drivers.deactivateTitle", { name: firstName })}</DialogTitle>
            <DialogDescription className="pt-1 text-left">
              {t("drivers.activeOrders", { count: strandedOrders ?? 0 })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStrandedOrders(null)}>
              {t("common.close")}
            </Button>
            <Button render={<Link href={`/orders?driver_id=${driverId}`} />}>
              {t("drivers.reassignPrompt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
