"use client";

import { useTranslations } from "next-intl";

import { useOrderUpdates } from "@/hooks/use-order-updates";
import { cn } from "@/lib/utils";

/**
 * The board's live-update indicator.
 *
 * It receives a timestamp and nothing else — no order, no patient. Props to a
 * Client Component are serialized into the HTML payload, so anything handed
 * across this boundary that the component does not render is PII exposed for no
 * reason (PRD 3.1).
 */
export function LiveUpdates({ since }: { since: string }) {
  const t = useTranslations();
  const { state } = useOrderUpdates({ since });

  // "starting" reads as live: it lasts only until the first poll returns.
  let label = t("board.updatesLive");
  if (state === "paused") label = t("board.updatesPaused");
  if (state === "error") label = t("board.updatesError");

  return (
    <p
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      aria-live="polite"
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "watching" && "bg-status-completed",
          state === "paused" && "bg-muted-foreground",
          state === "error" && "bg-destructive",
          state === "starting" && "bg-muted-foreground",
        )}
        aria-hidden
      />
      {label}
    </p>
  );
}
