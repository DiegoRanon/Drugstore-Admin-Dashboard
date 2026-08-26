"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { LoaderCircle, Plus, Printer } from "lucide-react";

import { createInviteAction } from "@/app/(dashboard)/invites/actions";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/hooks/use-action-feedback";

/**
 * Generate and print. Printing is the page itself — `.no-print` already hides
 * the shell and the per-card buttons, so the card grid becomes the sheet a
 * driver types codes off.
 */
export function InviteToolbar() {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure, showSuccess } = useActionFeedback();
  const [isPending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await createInviteAction();

      if (!result.ok) {
        showFailure(result);
        return;
      }

      showSuccess(t("toast.inviteCreated"));
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2 no-print">
      <Button variant="outline" className="gap-2" onClick={() => window.print()}>
        <Printer className="size-4" aria-hidden />
        {t("invites.print")}
      </Button>
      <Button className="gap-2" onClick={generate} disabled={isPending}>
        {isPending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        {t("invites.generate")}
      </Button>
    </div>
  );
}
