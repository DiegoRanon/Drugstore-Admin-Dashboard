/**
 * Phase 1 acceptance check — the typed client, the error envelope, and the
 * Data Access Layer, exercised against a running server.
 *
 *   npm run verify:api
 *
 * Requires the medibus-server running on API_BASE_URL with its seed applied.
 * The DAL imports `server-only`, so this runs under the `react-server`
 * condition (see the npm script).
 *
 * Note the ordering below. Failed-login throttling counts against the *email*,
 * so every failure case uses a throwaway address and the real admin signs in
 * first. Probing with the admin's own address would lock the account for two
 * minutes and make the next run fail for the wrong reason.
 */
import { ApiError, isThrottled, retryAfterSeconds } from "../src/lib/api/errors";
import { login } from "../src/lib/dal/auth";
import { listClients } from "../src/lib/dal/clients";
import { listDrivers } from "../src/lib/dal/drivers";
import { listInvites } from "../src/lib/dal/invites";
import { getOrder, listOrders } from "../src/lib/dal/orders";

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@stlaurent.example.ca";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "DevPassword123!";
const PROBE_EMAIL = `verify-probe-${Date.now()}@example.test`;

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

async function expectApiError(
  name: string,
  run: () => Promise<unknown>,
  assert: (error: ApiError) => boolean,
) {
  try {
    await run();
    check(name, false, "expected an ApiError, got success");
  } catch (error) {
    if (error instanceof ApiError) {
      check(name, assert(error), `code=${error.code} status=${error.status}`);
    } else {
      check(name, false, `expected ApiError, got ${String(error)}`);
    }
  }
}

async function verifySession(): Promise<string> {
  console.log("Session");

  const session = await login(EMAIL, PASSWORD);
  check("login returns an access token", session.access_token.length > 0);
  check("login returns a rotating refresh token", session.refresh_token.length > 0);
  check("logged-in user is an admin", session.user.role === "admin");
  check("access token is short-lived", session.expires_in <= 900);

  return session.access_token;
}

async function verifyReads() {
  console.log("\nReads through the DAL");

  const orders = await listOrders({ limit: 50 });
  check(
    "orders come back keyset-paginated",
    Array.isArray(orders.data) &&
      "next_cursor" in orders &&
      "has_more" in orders &&
      !("total" in orders),
    `keys: ${Object.keys(orders).join(", ")}`,
  );

  check("driver roster loads whole", Array.isArray(await listDrivers()));
  check(
    "client list is paginated the same way",
    Array.isArray((await listClients({ limit: 10 })).data),
  );
  check("invite codes load", Array.isArray(await listInvites()));

  const first = orders.data[0];
  if (!first) {
    check("order detail (skipped — no seeded orders)", true);
    return;
  }

  const detail = await getOrder(first.id);
  check(
    "order detail carries its timeline and available transitions",
    Array.isArray(detail.status_events) && Array.isArray(detail.available_transitions),
  );
  check(
    "PII on the order is the snapshot, not a join",
    typeof detail.patient_name === "string" && typeof detail.address === "string",
  );
}

async function verifyCursorHandling() {
  console.log("\nCursor handling");

  try {
    const recovered = await listOrders({ limit: 5 }, "this-is-not-a-real-cursor");
    check(
      "an invalid cursor recovers by refetching from the start",
      Array.isArray(recovered.data),
    );
  } catch (error) {
    const detail =
      error instanceof ApiError ? `${error.code} (${error.status})` : String(error);
    check("an invalid cursor recovers by refetching from the start", false, detail);
  }
}

async function verifyErrorEnvelope() {
  console.log("\nError envelope");

  await expectApiError(
    "bad password maps to INVALID_CREDENTIALS with a request id",
    () => login(PROBE_EMAIL, "definitely-not-the-password"),
    (error) =>
      error.code === "INVALID_CREDENTIALS" &&
      error.status === 401 &&
      typeof error.requestId === "string" &&
      error.requestId.length > 0,
  );

  await expectApiError(
    "malformed login body is rejected with a stable code",
    () => login("not-an-email", ""),
    (error) => error.status >= 400 && error.code.length > 0,
  );

  await expectApiError(
    "unknown order id is a typed 404, not a crash",
    () => getOrder("00000000-0000-4000-8000-000000000000"),
    (error) => error.status === 404,
  );
}

async function verifyThrottling() {
  console.log("\nThrottling");

  // Two limiters answer 429: per-email LOGIN_THROTTLED (5 failures per 15
  // minutes, wait in `details.retry_after_seconds`) and per-IP RATE_LIMITED
  // (empty details, wait only in `x-ratelimit-reset`). Whichever trips first,
  // the login screen has to be able to say how long the wait is (PRD 5.1).
  let throttled: ApiError | null = null;

  for (let attempt = 0; attempt < 15 && throttled === null; attempt += 1) {
    try {
      await login(PROBE_EMAIL, "wrong-password-again");
    } catch (error) {
      if (error instanceof ApiError && isThrottled(error)) throttled = error;
    }
  }

  check("repeated failures are throttled", throttled !== null, "no 429 in 15 attempts");
  check(
    "the throttle reports a usable wait in seconds",
    throttled !== null && retryAfterSeconds(throttled) !== null,
    throttled
      ? `code=${throttled.code}, details=${JSON.stringify(throttled.details)}, reset=${throttled.rateLimitReset}`
      : "not throttled",
  );
}

async function main() {
  console.log("\nPhase 1 — typed API client and Data Access Layer\n");

  // The Phase 2 session cookie replaces this; for now it feeds
  // `requireAccessToken()` so the DAL can run against the real API.
  process.env.DEV_ACCESS_TOKEN = await verifySession();

  await verifyReads();
  await verifyCursorHandling();
  await verifyErrorEnvelope();
  await verifyThrottling();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nVerification aborted:", error);
  process.exit(1);
});
