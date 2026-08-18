"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Signs out server-side before clearing the cookie. Dropping the cookie alone
 * would leave a valid 30-day refresh token alive on the server (PRD 8.4).
 */
export async function signOutRequest(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
  }).catch(() => {
    // Network failure must not strand the user in a signed-in UI; the redirect
    // still happens and the cookie is cleared on the next proxied request.
  });
}

export function SignOutButton({
  variant = "ghost",
  showLabel = false,
}: {
  variant?: "ghost" | "outline";
  showLabel?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await signOutRequest();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant={variant}
      size={showLabel ? "sm" : "icon"}
      onClick={onClick}
      disabled={pending}
      aria-label={t("nav.signOut")}
      className={showLabel ? "gap-2" : undefined}
    >
      <LogOut className="size-4" aria-hidden />
      {showLabel && t("nav.signOut")}
    </Button>
  );
}
