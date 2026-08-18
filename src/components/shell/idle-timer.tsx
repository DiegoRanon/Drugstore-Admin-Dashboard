"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { signOutRequest } from "@/components/shell/sign-out-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from "@/lib/session/types";

/** How often to compare the clock against the thresholds. */
const TICK_MS = 15_000;
/** Don't send a keepalive more than this often, however busy the user is. */
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "focus"] as const;

/**
 * Signs out an unattended session after 30 minutes, warning at 28.
 *
 * The authority is `lastSeenAt` inside the sealed cookie, which only `proxy.ts`
 * writes — this component cannot extend a session on its own. It mirrors the
 * same clock so the user gets a warning instead of losing work silently, and
 * sends a heartbeat while they are genuinely active so that working without
 * navigating does not look idle to the server.
 */
export function IdleTimer() {
  const t = useTranslations();
  const router = useRouter();

  // Seeded on mount, not during render: `Date.now()` in a render body is
  // impure and would produce a different clock on every re-render.
  const lastActivity = useRef(0);
  const lastHeartbeat = useRef(0);
  const [warning, setWarning] = useState(false);

  const signOut = useCallback(async () => {
    await signOutRequest();
    router.replace("/login?reason=idle");
    router.refresh();
  }, [router]);

  const markActive = useCallback(() => {
    lastActivity.current = Date.now();

    if (Date.now() - lastHeartbeat.current > HEARTBEAT_INTERVAL_MS) {
      lastHeartbeat.current = Date.now();
      // Proxy re-seals the cookie with a fresh `lastSeenAt` on the way through.
      void fetch("/api/session/heartbeat", { cache: "no-store" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    lastActivity.current = Date.now();
    lastHeartbeat.current = Date.now();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }

    const timer = window.setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= IDLE_TIMEOUT_MS) {
        void signOut();
      } else if (idleFor >= IDLE_WARNING_MS) {
        setWarning(true);
      }
    }, TICK_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive);
      }
      window.clearInterval(timer);
    };
  }, [markActive, signOut]);

  function staySignedIn() {
    setWarning(false);
    lastActivity.current = Date.now();
    lastHeartbeat.current = Date.now();
    void fetch("/api/session/heartbeat", { cache: "no-store" }).catch(() => {});
  }

  return (
    <Dialog open={warning} onOpenChange={(open) => !open && staySignedIn()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("idle.title")}</DialogTitle>
          <DialogDescription>{t("idle.body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => void signOut()}>
            {t("nav.signOut")}
          </Button>
          <Button onClick={staySignedIn}>{t("idle.stay")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
