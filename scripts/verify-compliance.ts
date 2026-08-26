/**
 * Phase 4 compliance gate — prefetch must not forge access-log entries.
 *
 *   npm run verify:compliance
 *
 * PRD 8.1 in one sentence: `GET /v1/orders/{id}` and `GET /v1/clients/{id}` are
 * audit-logged, Next prefetches links on viewport entry, and a board of 50 cards
 * would therefore record 50 accesses that never happened — filling the Law 25
 * accountability record with reads no human performed.
 *
 * Two things make this test meaningful:
 *
 * 1. It runs against a **production build**. `next dev` never prefetches, so a
 *    dev run would pass no matter how the links were written.
 * 2. It includes a **negative control**: a deliberate prefetch-shaped request is
 *    fired at a detail route to prove the audit log is sensitive to prefetching.
 *    Without that, a zero could just mean prefetch never happened at all.
 *
 * Requires Docker (for the audit-log query) and the API running.
 */
import { execFileSync } from "node:child_process";
import { spawn, type ChildProcess } from "node:child_process";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

import { chromium } from "playwright";

const API = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const PORT = Number(process.env.PROD_PORT ?? 3002);
const APP = `http://localhost:${PORT}`;
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@stlaurent.example.ca";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "DevPassword123!";
const DB_CONTAINER = process.env.DB_CONTAINER ?? "drugstore-postgres";

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

/** Counts audit rows of one action written since a cutoff. */
function auditCount(action: string, since: string): number {
  const sql = `SELECT count(*) FROM access_audit_log WHERE action = '${action}' AND occurred_at > '${since}'::timestamptz;`;
  const out = execFileSync(
    "docker",
    ["exec", DB_CONTAINER, "psql", "-U", "drugstore", "-d", "drugstore", "-t", "-A", "-c", sql],
    { encoding: "utf8" },
  );
  return Number(out.trim());
}

function dbNow(): string {
  const out = execFileSync(
    "docker",
    ["exec", DB_CONTAINER, "psql", "-U", "drugstore", "-d", "drugstore", "-t", "-A", "-c", "SELECT now();"],
    { encoding: "utf8" },
  );
  return out.trim();
}

async function waitForServer(url: string, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/login`, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}

async function signIn(): Promise<string> {
  const response = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`login failed: ${response.status}`);
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function anyOrderId(token: string): Promise<string> {
  const response = await fetch(`${API}/v1/orders/?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { data: { id: string }[] };
  const id = body.data[0]?.id;
  if (!id) throw new Error("no orders in the database to test against");
  return id;
}

async function apiToken(): Promise<string> {
  const response = await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`api login failed: ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function main() {
  console.log("\nPhase 4 — prefetch and the access audit log\n");

  let server: ChildProcess | undefined;

  try {
    console.log(`Starting a production server on ${APP}`);
    server = spawn("npx", ["next", "start", "--port", String(PORT)], {
      stdio: "ignore",
      shell: true,
      env: { ...process.env, NODE_ENV: "production" },
    });

    if (!(await waitForServer(APP))) {
      throw new Error(`the production server never became ready — run \`npm run build\` first`);
    }

    const cookie = await signIn();
    const cookieValue = cookie.split("=").slice(1).join("=");
    const token = await apiToken();
    const orderId = await anyOrderId(token);

    // --- Control -------------------------------------------------------------
    // Establishes that the audit log responds to a real read of this route. If
    // it did not, every "zero rows" result below would be meaningless.
    console.log("\nControl (the audit log must be sensitive to a real read)");

    const controlFrom = dbNow();
    await fetch(`${APP}/orders/${orderId}`, { headers: { cookie } });
    await new Promise((r) => setTimeout(r, 500));

    const controlRows = auditCount("order.detail.read", controlFrom);
    check(
      "one normal read of a detail route writes exactly one audit row",
      controlRows === 1,
      `wrote ${controlRows} rows — if this is 0 the assertions below prove nothing`,
    );

    // --- Framework canary ----------------------------------------------------
    /*
     * In Next 16 a prefetch of a dynamic route does not execute the page, so it
     * writes no audit row. That is welcome but explicitly not something to rely
     * on: PRD 8.1 calls it "a subtle framework behaviour that changes between
     * versions and disappears the moment someone removes a loading.tsx". The
     * protection is `prefetch={false}` plus the lint rule; this check is a
     * canary, so if a future version starts executing the page on prefetch,
     * somebody finds out here rather than in a Law 25 audit.
     */
    console.log("\nFramework canary (prefetch must not execute the page)");

    const canaryFrom = dbNow();
    await fetch(`${APP}/orders/${orderId}`, {
      headers: { cookie, RSC: "1", "Next-Router-Prefetch": "1" },
    });
    await new Promise((r) => setTimeout(r, 500));

    const canaryRows = auditCount("order.detail.read", canaryFrom);
    check(
      "a prefetch-shaped request does not reach the page's data fetch",
      canaryRows === 0,
      `wrote ${canaryRows} rows — Next's prefetch behaviour changed; prefetch={false} is now the only thing standing between a scrolled board and a forged audit trail`,
    );

    // --- The real test ------------------------------------------------------
    console.log("\nBrowsing with a real browser (production build)");

    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "dsd_session",
        value: cookieValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();

    // A long list of links to audited detail routes.
    const historyFrom = dbNow();
    await page.goto(`${APP}/orders`, { waitUntil: "networkidle" });

    const rowCount = await page.locator("tbody tr").count();
    check("the history view rendered a long list of orders", rowCount >= 10, `${rowCount} rows`);

    // Scroll the whole list through the viewport: prefetch triggers on entry.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2_500);

    const afterScroll = auditCount("order.detail.read", historyFrom);
    check(
      "scrolling a full list of orders records ZERO detail reads",
      afterScroll === 0,
      `${afterScroll} detail-read rows appeared for ${rowCount} links — prefetch is forging access records`,
    );

    // Hovering is the other trigger people forget about.
    const hoverFrom = dbNow();
    await page.locator("tbody tr a").first().hover();
    await page.waitForTimeout(1_500);
    check(
      "hovering an order link records no detail read",
      auditCount("order.detail.read", hoverFrom) === 0,
    );

    // --- A real human click must be recorded --------------------------------
    console.log("\nA real access is still recorded");

    const clickFrom = dbNow();
    await page.locator("tbody tr a").first().click();
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await page.waitForTimeout(1_000);

    const afterClick = auditCount("order.detail.read", clickFrom);
    check(
      "opening one order records exactly one detail read",
      afterClick === 1,
      `${afterClick} rows — the accountability record must reflect exactly what was opened`,
    );

    // --- The board -----------------------------------------------------------
    console.log("\nThe board");

    const boardFrom = dbNow();
    await page.goto(`${APP}/?date=2026-08-17`, { waitUntil: "networkidle" });
    const cards = await page.locator("article").count();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2_500);

    check("the board rendered its cards", cards >= 5, `${cards} cards`);
    check(
      "scrolling the board records zero detail reads",
      auditCount("order.detail.read", boardFrom) === 0,
      `${auditCount("order.detail.read", boardFrom)} rows for ${cards} cards`,
    );

    // --- The calendar --------------------------------------------------------
    console.log("\nThe calendar");

    /*
      `GET /v1/orders/calendar` returns integers per day and is deliberately
      excluded from `auditPiiRead` — recording it would bury the real accesses
      every time someone pages a month. And the day cells link to the board,
      whose list read *is* audited, so they must not prefetch: a month of cells
      would otherwise forge thirty list reads nobody performed.
    */
    const calendarFrom = dbNow();
    await page.goto(`${APP}/calendar?month=2026-08-01`, { waitUntil: "networkidle" });
    const dayCells = await page.locator('a[href^="/?date="]').count();
    await page.goto(`${APP}/calendar?month=2026-09-01`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2_500);

    check("the calendar rendered its day cells", dayCells >= 5, `${dayCells} cells`);
    check(
      "paging the calendar records zero list reads",
      auditCount("order.list.read", calendarFrom) === 0,
      `${auditCount("order.list.read", calendarFrom)} rows for ${dayCells} day cells`,
    );
    check(
      "paging the calendar records zero detail reads",
      auditCount("order.detail.read", calendarFrom) === 0,
      `${auditCount("order.detail.read", calendarFrom)} rows`,
    );

    await browser.close();
  } finally {
    server?.kill();
    // `next start` runs behind a shell wrapper on Windows; make sure the port
    // is actually released.
    try {
      execFileSync("powershell", [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
      ]);
    } catch {
      // nothing listening
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nVerification aborted:", error);
  process.exit(1);
});
