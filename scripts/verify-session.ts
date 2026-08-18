/**
 * Phase 2 acceptance check — session sealing, the refresh lock, and route
 * protection.
 *
 *   npm run verify:session
 *
 * Needs the drugstore-server on API_BASE_URL (seeded) and, for the HTTP
 * section, the dashboard on http://localhost:3001.
 *
 * The centrepiece is the concurrency test. The server rotates refresh tokens
 * and treats replay of a rotated one as theft, revoking the whole family. This
 * proves that N simultaneous requests produce exactly one refresh — and then
 * demonstrates the failure the lock prevents, by deliberately racing without it.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

import { ApiError } from "../src/lib/api/errors";
import { InProcessCoordinator } from "../src/lib/session/coordinator";
import { ensureFreshSession } from "../src/lib/session/refresh";
import { sealSession, unsealSession } from "../src/lib/session/seal";
import {
  accessTokenIsFresh,
  isIdleExpired,
  IDLE_TIMEOUT_MS,
  type Session,
} from "../src/lib/session/types";

const API = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const APP = process.env.APP_BASE_URL ?? "http://localhost:3001";
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@stlaurent.example.ca";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "DevPassword123!";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    return;
  }
  failed += 1;
  const suffix = detail ? `\n        ${detail}` : "";
  console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${suffix}`);
}

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: Session["user"];
};

/**
 * The API rate-limits logins per IP (10 per window). This script legitimately
 * signs in several times, so it waits out a 429 rather than failing — the
 * limiter is the server working correctly, not a defect under test.
 */
async function apiLogin(attempt = 0): Promise<LoginResponse> {
  const response = await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (response.ok) return response.json() as Promise<LoginResponse>;

  const error = await ApiError.fromResponse(response);
  if (error.status === 429 && attempt < 2) {
    const wait = Math.min((error.rateLimitReset ?? 60) + 2, 70);
    console.log(`  \x1b[33m…\x1b[0m  rate limited, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return apiLogin(attempt + 1);
  }

  throw error;
}

async function rawRefresh(token: string): Promise<Response> {
  return fetch(`${API}/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: token }),
  });
}

function sessionFrom(login: LoginResponse, overrides: Partial<Session> = {}): Session {
  return {
    accessToken: login.access_token,
    refreshToken: login.refresh_token,
    accessExpiresAt: Date.now() + login.expires_in * 1000,
    lastSeenAt: Date.now(),
    user: login.user,
    organization: {
      id: login.user.organization_id,
      name: "Test",
      phone: null,
      timezone: "America/Toronto",
      locale: "fr",
    },
    ...overrides,
  };
}

// --- Sealing -----------------------------------------------------------------

async function verifySealing(login: LoginResponse) {
  console.log("Cookie sealing");

  const session = sessionFrom(login);
  const sealed = await sealSession(session);

  check(
    "the sealed cookie is opaque, not readable JSON",
    !sealed.includes(login.refresh_token) && !sealed.includes(login.user.email),
    "the raw token or email appeared in the cookie value",
  );

  const round = await unsealSession(sealed);
  check(
    "seal/unseal round-trips every field",
    round?.accessToken === session.accessToken &&
      round.refreshToken === session.refreshToken &&
      round.user.id === session.user.id &&
      round.organization.timezone === session.organization.timezone,
  );

  // Flip a character in the ciphertext body.
  const parts = sealed.split(".");
  const body = parts[3] ?? "";
  const tampered = [
    ...parts.slice(0, 3),
    body.slice(0, -2) + (body.endsWith("A") ? "B" : "A"),
    parts[4],
  ].join(".");
  check("a tampered cookie is rejected", (await unsealSession(tampered)) === null);

  check("an absent cookie is rejected", (await unsealSession(undefined)) === null);
  check("a garbage cookie is rejected", (await unsealSession("not-a-jwe")) === null);
}

// --- Clocks ------------------------------------------------------------------

function verifyClocks(login: LoginResponse) {
  console.log("\nSession clocks");

  const now = Date.now();

  check(
    "a token expiring in 30s is not considered fresh",
    !accessTokenIsFresh(sessionFrom(login, { accessExpiresAt: now + 30_000 }), now),
  );
  check(
    "a token with 5 minutes left is fresh",
    accessTokenIsFresh(sessionFrom(login, { accessExpiresAt: now + 300_000 }), now),
  );
  check(
    "29 minutes idle is still active",
    !isIdleExpired(sessionFrom(login, { lastSeenAt: now - 29 * 60_000 }), now),
  );
  check(
    "31 minutes idle is expired",
    isIdleExpired(sessionFrom(login, { lastSeenAt: now - 31 * 60_000 }), now),
  );
  check("the idle timeout is 30 minutes", IDLE_TIMEOUT_MS === 30 * 60_000);
}

// --- Lock --------------------------------------------------------------------

async function verifyLock() {
  console.log("\nRefresh lock");

  const lock = new InProcessCoordinator();

  const first = await lock.acquire("k", 5_000);
  const second = await lock.acquire("k", 5_000);
  check("only one holder at a time", first !== null && second === null);

  await lock.release("k", "not-the-holder");
  check("a non-holder cannot release the lock", (await lock.acquire("k", 5_000)) === null);

  await lock.release("k", first!);
  const third = await lock.acquire("k", 5_000);
  check("the lock is reusable once released", third !== null);

  const expiring = new InProcessCoordinator();
  await expiring.acquire("e", 40);
  await new Promise((r) => setTimeout(r, 70));
  check(
    "an abandoned lock expires so a session cannot wedge shut",
    (await expiring.acquire("e", 5_000)) !== null,
  );

  await lock.publish("h", "sealed-value", 5_000);
  check("the handoff slot carries the winner's result", (await lock.read("h")) === "sealed-value");
}

// --- Concurrency: the whole reason the lock exists ---------------------------

async function verifyConcurrentRefresh() {
  console.log("\nConcurrent refresh (the family-revocation guard)");

  const login = await apiLogin();
  // An already-expired access token, so every caller wants to refresh at once.
  const stale = sessionFrom(login, { accessExpiresAt: Date.now() - 1_000 });

  const realFetch = globalThis.fetch;
  let refreshCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/v1/auth/refresh")) refreshCalls += 1;
    return realFetch(input, init);
  }) as typeof fetch;

  try {
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () => ensureFreshSession(stale)),
    );

    check(
      "six simultaneous requests trigger exactly one refresh",
      refreshCalls === 1,
      `the server saw ${refreshCalls} refresh calls`,
    );
    check(
      "no request was signed out",
      outcomes.every((o) => o.kind !== "terminal"),
      outcomes.map((o) => o.kind).join(", "),
    );

    const refreshed = outcomes.filter((o) => o.kind === "refreshed");
    check(
      "every request ends up with the same new token",
      refreshed.length > 0 &&
        new Set(refreshed.map((o) => o.session.accessToken)).size === 1,
      `${refreshed.length} refreshed, ${new Set(refreshed.map((o) => o.session.accessToken)).size} distinct tokens`,
    );

    // The real proof: the family survived, so the rotated token still works.
    const latest = refreshed[0];
    if (latest) {
      const response = await rawRefresh(latest.session.refreshToken);
      check(
        "the token family is intact afterwards",
        response.ok,
        `refresh after the race returned ${response.status}`,
      );
    }
  } finally {
    globalThis.fetch = realFetch;
  }
}

/**
 * The counterfactual — what the lock is protecting us from.
 *
 * Measured behaviour, which is subtler than PRD 4.3 implies:
 *
 * - Simultaneous refreshes of one token all *succeed*. The server's
 *   check-and-rotate is not atomic, so a race fans a family out into several
 *   live tokens instead of failing loudly.
 * - Sequential replay of an already-rotated token is detected and revokes the
 *   whole family.
 *
 * Together those are worse than a straight rejection: an unlocked race leaves
 * extra valid tokens behind, only one of which the cookie keeps, and the next
 * request that presents one of the orphans logs the user out everywhere. The
 * lock is what stops the fan-out from happening at all.
 */
async function verifyReplayIsDetected() {
  console.log("\nCounterfactual (what the lock prevents)");

  const login = await apiLogin();

  const raced = await Promise.all(
    Array.from({ length: 4 }, () => rawRefresh(login.refresh_token)),
  );
  const survivors = raced.filter((r) => r.ok).length;
  check(
    "an unlocked race fans one token out into several live ones",
    survivors > 1,
    `${survivors} of ${raced.length} parallel refreshes succeeded`,
  );

  // Now the sequential case: reuse a token that has already been rotated.
  const fresh = await apiLogin();
  const rotated = await rawRefresh(fresh.refresh_token);
  check("the first refresh of a token succeeds", rotated.ok);

  const successor = (await rotated.json()) as { refresh_token: string };

  const replay = await rawRefresh(fresh.refresh_token);
  check(
    "replaying an already-rotated token is rejected",
    replay.status === 401,
    `replay returned ${replay.status}`,
  );

  const familyCheck = await rawRefresh(successor.refresh_token);
  check(
    "the replay revokes the whole family, signing the user out everywhere",
    familyCheck.status === 401,
    `the successor token still worked (${familyCheck.status}) — replay did not revoke the family`,
  );

  const recovered = await apiLogin();
  check("a fresh login recovers afterwards", recovered.access_token.length > 0);
}

// --- HTTP: route protection ---------------------------------------------------

async function verifyRouteProtection() {
  console.log("\nRoute protection (HTTP)");

  const reachable = await fetch(`${APP}/login`, { redirect: "manual" })
    .then((r) => r.status < 500)
    .catch(() => false);

  if (!reachable) {
    console.log("  \x1b[33mSKIP\x1b[0m  dashboard not running on " + APP);
    return;
  }

  const anonymous = await fetch(`${APP}/`, { redirect: "manual" });
  check(
    "an anonymous visitor is redirected to /login",
    anonymous.status >= 300 &&
      anonymous.status < 400 &&
      (anonymous.headers.get("location") ?? "").includes("/login"),
    `status ${anonymous.status}, location ${anonymous.headers.get("location")}`,
  );

  const noOrigin = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check(
    "login without an Origin header is refused (CSRF)",
    noOrigin.status === 403,
    `status ${noOrigin.status}`,
  );

  const crossOrigin = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check("login from another origin is refused", crossOrigin.status === 403);

  const badCreds = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP },
    body: JSON.stringify({ email: EMAIL, password: "wrong-password" }),
  });
  const badBody = (await badCreds.json()) as { code?: string };
  check(
    "wrong credentials return INVALID_CREDENTIALS",
    badCreds.status === 401 && badBody.code === "INVALID_CREDENTIALS",
    `status ${badCreds.status}, code ${badBody.code}`,
  );

  const ok = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setCookie = ok.headers.get("set-cookie") ?? "";
  check("a valid login succeeds", ok.status === 200);
  check(
    "the session cookie is HttpOnly, SameSite=Lax, Path=/",
    /httponly/i.test(setCookie) &&
      /samesite=lax/i.test(setCookie) &&
      /path=\//i.test(setCookie),
    setCookie.split(";").slice(1).join(";").trim(),
  );

  const cookie = setCookie.split(";")[0] ?? "";
  const sealedValue = cookie.split("=").slice(1).join("=");

  check(
    "the cookie carries no readable token",
    !sealedValue.includes(EMAIL) && sealedValue.length > 100,
  );

  const session = await unsealSession(decodeURIComponent(sealedValue));
  check("the server can unseal its own cookie", session !== null);

  const board = await fetch(`${APP}/`, { headers: { cookie }, redirect: "manual" });
  check("a signed-in admin reaches the board", board.status === 200, `status ${board.status}`);

  const loginWhileSignedIn = await fetch(`${APP}/login`, {
    headers: { cookie },
    redirect: "manual",
  });
  check(
    "/login redirects away when already signed in",
    loginWhileSignedIn.status >= 300 && loginWhileSignedIn.status < 400,
  );

  const tampered = cookie.slice(0, -3) + "xyz";
  const withTampered = await fetch(`${APP}/clients`, {
    headers: { cookie: tampered },
    redirect: "manual",
  });
  check(
    "a tampered cookie is sent back to /login",
    withTampered.status >= 300 &&
      (withTampered.headers.get("location") ?? "").includes("/login"),
    `status ${withTampered.status}`,
  );

  // Logout must revoke server-side, not merely drop the cookie (PRD 8.4).
  const refreshTokenBefore = session?.refreshToken ?? "";
  const loggedOut = await fetch(`${APP}/api/auth/logout`, {
    method: "POST",
    headers: { cookie, origin: APP, "content-type": "application/json" },
  });
  check("logout succeeds", loggedOut.status === 200);
  check(
    "logout clears the cookie",
    /dsd_session=;/.test(loggedOut.headers.get("set-cookie") ?? "") ||
      /max-age=0/i.test(loggedOut.headers.get("set-cookie") ?? ""),
    loggedOut.headers.get("set-cookie") ?? "",
  );

  const afterLogout = await rawRefresh(refreshTokenBefore);
  check(
    "logout revoked the refresh token on the server",
    afterLogout.status === 401,
    `refresh after logout returned ${afterLogout.status} — the credential is still alive`,
  );
}

async function main() {
  console.log("\nPhase 2 — session, refresh lock, and route protection\n");

  const login = await apiLogin();

  await verifySealing(login);
  verifyClocks(login);
  await verifyLock();
  await verifyConcurrentRefresh();
  await verifyRouteProtection();
  await verifyReplayIsDetected();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nVerification aborted:", error);
  process.exit(1);
});
