"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginFailure = {
  code?: string;
  retry_after_seconds?: number | null;
};

/** Only same-site paths, so `?next=` cannot bounce the user off-site. */
function safeNext(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reason = params.get("reason");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });

      if (response.ok) {
        const { role } = (await response.json()) as { role: string };
        // Proxy redirects a driver to the mobile-app screen; send them straight
        // there instead of bouncing through the board.
        router.replace(role === "admin" ? safeNext(params.get("next")) : "/mobile-app");
        router.refresh();
        return;
      }

      setError(messageFor(await response.json().catch(() => ({}))));
    } catch {
      setError(t("login.genericError"));
    } finally {
      setPending(false);
    }
  }

  function messageFor(failure: LoginFailure): string {
    switch (failure.code) {
      case "INVALID_CREDENTIALS":
        // Deliberately identical for a wrong password and an unknown address:
        // the difference would confirm which accounts exist.
        return t("login.invalidCredentials");
      case "ACCOUNT_DISABLED":
        return t("login.accountDisabled");
      case "LOGIN_THROTTLED":
      case "RATE_LIMITED": {
        // Say how long. "Try again later" generates support calls (PRD 5.1).
        const seconds = failure.retry_after_seconds ?? 0;
        return t("login.throttled", { minutes: Math.max(1, Math.ceil(seconds / 60)) });
      }
      default:
        return t("login.genericError");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 grid gap-4" noValidate>
      {reason && !error && (
        <p
          role="status"
          className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
        >
          {reason === "idle" ? t("login.idleNotice") : t("login.expiredNotice")}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">{t("login.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t("login.password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" className="mt-1 w-full" disabled={pending}>
        {pending ? t("login.submitting") : t("login.submit")}
      </Button>
    </form>
  );
}
