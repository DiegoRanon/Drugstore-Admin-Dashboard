"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A failed fetch must look deliberate, not like a blank page.
 *
 * `digest` is all Next exposes to the browser for a server-side error — the
 * message itself is scrubbed in production, deliberately, so patient data
 * cannot leak through a stack trace. It is still the handle that ties a user's
 * report to the server logs (PRD 8.3).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="mx-auto max-w-lg rounded-lg border bg-card px-6 py-12 text-center">
      <TriangleAlert className="mx-auto size-8 text-destructive" aria-hidden />
      <h1 className="mt-4 font-semibold">{t("board.loadError")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("board.loadErrorHint")}</p>

      {error.digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          {t("common.requestId", { id: error.digest })}
        </p>
      )}

      <Button className="mt-6" onClick={reset}>
        {t("board.retry")}
      </Button>
    </div>
  );
}
