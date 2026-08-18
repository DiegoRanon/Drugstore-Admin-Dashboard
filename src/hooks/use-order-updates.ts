"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Watches for order changes and refreshes the board when there are any.
 *
 * The transport is deliberately behind this hook. The server has no WebSocket
 * layer yet (PRD 9.2); when it grows one, only this file changes and the board
 * never learns the difference.
 *
 * Budget: 6 requests/minute against a 100/minute per-user limit, and only while
 * the tab is visible.
 */

const DEFAULT_INTERVAL_MS = 10_000;

/**
 * How long after the last interaction polling keeps going.
 *
 * `GET /v1/orders` is audit-logged server-side, so **every poll writes a row**
 * to `access_audit_log` — measured, with `record_count = 0`. Left ungated, a
 * board open on a counter all day writes ~2,900 rows of reads no human
 * performed, which is precisely what PRD 8.1 says destroys the accountability
 * record's evidentiary value.
 *
 * Visibility alone is not enough: an unattended tab is still visible. So the
 * board watches while someone is actually working and goes quiet otherwise; any
 * interaction resumes it immediately. The real fix belongs on the server — a
 * change-feed endpoint that is not audited, or an audit exemption for
 * `updated_since` polls. Raised as a gap.
 */
const ACTIVE_WINDOW_MS = 10 * 60_000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "focus"] as const;

export type UpdatesState = "starting" | "watching" | "paused" | "error";

type PollResponse = { changed: number; at: string };

export function useOrderUpdates({
  since,
  intervalMs = DEFAULT_INTERVAL_MS,
}: {
  /** Server render time. Anything updated after this is news. */
  since: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<UpdatesState>("starting");

  const lastSeen = useRef(since);
  const inFlight = useRef(false);
  const lastActivity = useRef(0);

  // A new server render restarts the window, otherwise the same change would
  // be reported again and refresh in a loop.
  useEffect(() => {
    lastSeen.current = since;
  }, [since]);

  const poll = useCallback(async () => {
    if (inFlight.current || document.visibilityState !== "visible") return;

    // Each poll costs an audit row, so only spend one while someone is working.
    if (Date.now() - lastActivity.current > ACTIVE_WINDOW_MS) {
      setState("paused");
      return;
    }

    inFlight.current = true;

    try {
      const response = await fetch(
        `/api/orders/poll?since=${encodeURIComponent(lastSeen.current)}`,
        { cache: "no-store" },
      );

      if (response.status === 401) {
        // The session died underneath us. A full navigation lets proxy decide
        // where to send the user rather than guessing here.
        window.location.reload();
        return;
      }

      if (!response.ok) {
        setState("error");
        return;
      }

      const { changed, at } = (await response.json()) as PollResponse;
      lastSeen.current = at;
      setState("watching");

      // Re-render the board on the server. Nothing about the change is
      // reconstructed in the browser.
      if (changed > 0) router.refresh();
    } catch {
      setState("error");
    } finally {
      inFlight.current = false;
    }
  }, [router]);

  useEffect(() => {
    let timer: number | undefined;
    let firstCheck: number | undefined;

    // Loading the board is itself an interaction: someone just navigated here.
    lastActivity.current = Date.now();

    const markActive = () => {
      const wasQuiet = Date.now() - lastActivity.current > ACTIVE_WINDOW_MS;
      lastActivity.current = Date.now();
      // Coming back from quiet should show current data at once, not in 10s.
      if (wasQuiet) void poll();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }

    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => void poll(), intervalMs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Resume with an immediate fetch: whatever happened while the tab was
        // hidden should appear straight away, not up to 10s later.
        void poll();
        start();
      } else {
        setState("paused");
        window.clearInterval(timer);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    // The first check is scheduled rather than awaited here: calling it inline
    // would run `setState` synchronously inside the effect and cascade a render.
    if (document.visibilityState === "visible") {
      firstCheck = window.setTimeout(() => void poll(), 0);
      start();
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive);
      }
      window.clearInterval(timer);
      window.clearTimeout(firstCheck);
    };
  }, [poll, intervalMs]);

  return { state };
}
