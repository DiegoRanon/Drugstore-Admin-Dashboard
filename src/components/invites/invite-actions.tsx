"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Check, Copy, LoaderCircle } from "lucide-react";

import { revokeInviteAction } from "@/app/(dashboard)/invites/actions";
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
 * Copy and revoke for one code.
 *
 * The code is displayed in two groups of four because it gets typed by hand off
 * a printed sheet, but the clipboard gets it unspaced — a driver pasting
 * "ABCD EFGH" into the app would fail a comparison that the eye would pass.
 */
export function InviteActions({
  inviteId,
  code,
  canRevoke,
}: {
  inviteId: string;
  code: string;
  canRevoke: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();

  const [copied, setCopied] = useState(false);
  /** A code redeemed between render and click. Revoking it is a 409. */
  const [alreadyRedeemed, setAlreadyRedeemed] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      showSuccess(t("invites.copied"));
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard access can be refused outright; the code is on screen anyway.
    }
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeInviteAction(inviteId);

      if (!result.ok) {
        // Revoking would not remove a driver the code already created, so the
        // admin is pointed at the roster instead (PRD 5.6).
        if (result.code === "INVITE_CODE_REDEEMED") {
          setAlreadyRedeemed(true);
          return;
        }
        showFailure(result);
        return;
      }

      showSuccess(t("toast.inviteRevoked"));
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
        {copied ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {t("invites.copy")}
      </Button>

      {canRevoke && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={revoke}
          disabled={isPending}
        >
          {isPending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
          {t("invites.revoke")}
        </Button>
      )}

      <Dialog open={alreadyRedeemed} onOpenChange={setAlreadyRedeemed}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invites.revoke")}</DialogTitle>
            <DialogDescription className="pt-1 text-left">
              {t("invites.revokeRedeemed")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlreadyRedeemed(false)}>
              {t("common.close")}
            </Button>
            <Button render={<Link href="/drivers" />}>{t("invites.goToDrivers")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
