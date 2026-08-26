"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { changePasswordAction } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionFeedback } from "@/hooks/use-action-feedback";

/** Zod carries a code, not prose, so the message stays translatable. */
const FIELD_MESSAGES: Record<string, string> = {
  TOO_SHORT: "settings.passwordTooShort",
  MISMATCH: "settings.passwordMismatch",
  SAME_AS_CURRENT: "settings.passwordSameAsCurrent",
};

export function PasswordForm() {
  const t = useTranslations();
  const router = useRouter();
  const { showFailure } = useActionFeedback();

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setFieldErrors({});
      const result = await changePasswordAction(formData);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        // A wrong current password comes back as INVALID_CREDENTIALS from the
        // server, not as a field error — the toast is where it belongs.
        if (result.code !== "VALIDATION_FAILED") showFailure(result);
        return;
      }

      // Every session is revoked by now, this one included. The cookie was
      // cleared by the action, so there is nothing signed-in left to return to.
      router.replace("/login?reason=password_changed");
      router.refresh();
    });
  }

  function errorFor(field: string) {
    const code = fieldErrors[field]?.[0];
    if (!code) return null;
    const key = FIELD_MESSAGES[code];
    return key ? t(key) : t("common.required");
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="current_password">{t("settings.currentPassword")}</Label>
        <Input
          id="current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
        {errorFor("current_password") && (
          <p className="text-sm text-destructive" role="alert">
            {errorFor("current_password")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new_password">{t("settings.newPassword")}</Label>
        <Input
          id="new_password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          aria-describedby="new-password-hint"
        />
        <p id="new-password-hint" className="text-xs text-muted-foreground">
          {t("settings.passwordHint")}
        </p>
        {errorFor("new_password") && (
          <p className="text-sm text-destructive" role="alert">
            {errorFor("new_password")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm_password">{t("settings.confirmPassword")}</Label>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
        />
        {errorFor("confirm_password") && (
          <p className="text-sm text-destructive" role="alert">
            {errorFor("confirm_password")}
          </p>
        )}
      </div>

      <Button type="submit" className="w-fit gap-2" disabled={isPending}>
        {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {t("settings.changePassword")}
      </Button>
    </form>
  );
}
