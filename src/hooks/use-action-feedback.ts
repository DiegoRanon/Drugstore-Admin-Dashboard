"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import type { ActionFailure } from "@/lib/actions/result";

const KNOWN_CODES = new Set([
  "VALIDATION_FAILED",
  "ORDER_INVALID_TRANSITION",
  "ORDER_NOT_EDITABLE",
  "ORDER_NOT_READY",
  "ORDER_ALREADY_TERMINAL",
  "FAILURE_REASON_REQUIRED",
  "CLIENT_INACTIVE",
  "DRIVER_INACTIVE",
  "UNAVAILABLE",
  "UNEXPECTED",
]);

/**
 * Turns a Server Action failure into something a pharmacist can act on.
 *
 * Switches on `error.code`, never on message text: codes are a stable contract
 * and prose is not. An unrecognised code still produces a real message with the
 * code in it rather than a shrug, and the `request_id` is always shown — it is
 * the handle that ties a user's report to the server logs (PRD 8.3).
 */
export function useActionFeedback() {
  const t = useTranslations();

  const describe = useCallback(
    (failure: ActionFailure): string =>
      KNOWN_CODES.has(failure.code)
        ? t(`errors.${failure.code}`)
        : t("errors.fallback", { code: failure.code }),
    [t],
  );

  const showFailure = useCallback(
    (failure: ActionFailure) => {
      toast.error(describe(failure), {
        description: failure.requestId
          ? t("common.requestId", { id: failure.requestId })
          : undefined,
        duration: 8_000,
      });
    },
    [describe, t],
  );

  const showSuccess = useCallback((message: string) => {
    toast.success(message);
  }, []);

  return { describe, showFailure, showSuccess };
}
