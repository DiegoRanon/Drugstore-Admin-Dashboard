/**
 * Phase 3 acceptance check — the board's read path and live updates.
 *
 *   npm run verify:board
 *
 * Needs the drugstore-server (seeded) and the dashboard on http://localhost:3001.
 *
 * Creates a few deliveries for today so the board has something to show; they
 * are left in place afterwards, which is what makes the manual walkthrough
 * possible.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

import { ApiError } from "../src/lib/api/errors";

const API = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const APP = process.env.APP_BASE_URL ?? "http://localhost:3001";
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@stlaurent.example.ca";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "DevPassword123!";
const TIMEZONE = "America/Toronto";

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

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());

/** Signs in through the dashboard, yielding both the cookie and the API token. */
async function signIn(): Promise<{ cookie: string; token: string }> {
  const appLogin = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!appLogin.ok) throw new Error(`dashboard login failed: ${appLogin.status}`);
  const cookie = (appLogin.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

  const apiLogin = await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!apiLogin.ok) throw await ApiError.fromResponse(apiLogin);
  const { access_token } = (await apiLogin.json()) as { access_token: string };

  return { cookie, token: access_token };
}

type CreatedOrder = { id: string; patient_name: string; delivery_window: "AM" | "PM" };

async function createOrder(
  token: string,
  clientId: string,
  window: "AM" | "PM",
  extras: Record<string, unknown> = {},
): Promise<CreatedOrder> {
  const response = await fetch(`${API}/v1/orders/`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      client_id: clientId,
      delivery_date: today(),
      delivery_window: window,
      ...extras,
    }),
  });
  if (!response.ok) throw await ApiError.fromResponse(response);
  return (await response.json()) as CreatedOrder;
}

/**
 * `POST /v1/orders` now creates a `scheduled` order, which no driver can see
 * and which sits outside the pharmacy's working day. Seeding a board that
 * looks like a real one therefore takes this second call.
 */
async function markReady(token: string, orderId: string): Promise<void> {
  const response = await fetch(`${API}/v1/orders/${orderId}/ready`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await ApiError.fromResponse(response);
}

/**
 * `html` is the raw response; `dom` has `<script>` blocks removed.
 *
 * Always assert content against `dom`. `next-intl` serialises the entire message
 * catalogue into the RSC payload, so grepping raw HTML finds every translated
 * string whether or not it was rendered — which quietly turns "is this button
 * shown?" into "does this word exist in French?".
 */
async function fetchPage(
  cookie: string,
  path: string,
): Promise<{ status: number; html: string; dom: string }> {
  const response = await fetch(`${APP}${path}`, { headers: { cookie }, redirect: "manual" });
  const html = await response.text();
  return {
    status: response.status,
    html,
    dom: html.replace(/<script[\s\S]*?<\/script>/gi, ""),
  };
}

/** Extracts every `#REF` link target from a rendered history table. */
function rowRefs(html: string): string[] {
  return [...html.matchAll(/\/orders\/([0-9a-f-]{36})"/g)].map((match) => match[1]!);
}

async function verifyHistory(cookie: string, token: string, driverId: string | undefined) {
  console.log("\nHistory view");

  const firstPage = await fetchPage(cookie, "/orders");
  check("the history view renders", firstPage.status === 200, `status ${firstPage.status}`);

  const pageOne = new Set(rowRefs(firstPage.dom));
  check("it loads a full page of rows", pageOne.size >= 10, `${pageOne.size} rows`);
  check(
    "it reports an honest count of what is loaded, not a total",
    firstPage.dom.includes(`${pageOne.size} affichées`) ||
      firstPage.dom.includes(`${pageOne.size} shown`),
    `expected “${pageOne.size} affichées”`,
  );
  check(
    "it makes no promise of page numbers",
    !/Page\s+\d+\s+(of|de)\s+\d+/i.test(firstPage.dom),
  );

  const pageTwo = await fetchPage(cookie, "/orders?pages=2");
  const accumulated = rowRefs(pageTwo.dom);
  const unique = new Set(accumulated);

  check(
    "“load more” appends rather than replacing",
    unique.size > pageOne.size,
    `page 1 had ${pageOne.size}, two pages have ${unique.size}`,
  );
  check(
    "no row is duplicated across accumulated pages",
    unique.size === accumulated.length,
    `${accumulated.length} rows but only ${unique.size} distinct`,
  );
  check(
    "no row from page one is dropped",
    [...pageOne].every((id) => unique.has(id)),
  );

  // --- Filters ---------------------------------------------------------------
  const returned = await fetchPage(cookie, "/orders?status=returned");
  const returnedIds = rowRefs(returned.dom);
  const returnedCheck = await Promise.all(
    returnedIds.slice(0, 5).map(async (id) => {
      const response = await fetch(`${API}/v1/orders/${id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      return ((await response.json()) as { status: string }).status;
    }),
  );
  check(
    "a status filter returns only that status",
    returnedIds.length > 0 && returnedCheck.every((status) => status === "returned"),
    `statuses seen: ${returnedCheck.join(", ") || "none"}`,
  );

  if (driverId) {
    const byDriver = await fetchPage(cookie, `/orders?driver_id=${driverId}`);
    const driverIds = rowRefs(byDriver.dom);
    const owners = await Promise.all(
      driverIds.slice(0, 5).map(async (id) => {
        const response = await fetch(`${API}/v1/orders/${id}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        return ((await response.json()) as { driver_id: string | null }).driver_id;
      }),
    );
    check(
      "a driver filter returns only that driver's deliveries",
      owners.every((owner) => owner === driverId),
      `owners seen: ${owners.join(", ") || "none"}`,
    );
  }

  const combined = await fetchPage(cookie, "/orders?status=cancelled&date=2026-09-18");
  check(
    "filters compose (status plus date)",
    combined.status === 200 && rowRefs(combined.dom).length > 0,
    "expected the seeded cancelled day to return rows",
  );

  const contradictory = await fetchPage(cookie, "/orders?status=returned&date=2026-09-18");
  check(
    "a filter combination with no matches shows the empty state",
    contradictory.dom.includes("Aucune livraison ne correspond") ||
      contradictory.dom.includes("No deliveries match"),
  );

  const badFilter = await fetchPage(cookie, "/orders?status=not-a-status&driver_id=nope");
  check(
    "invalid filter values are ignored rather than passed to the API",
    badFilter.status === 200,
    `status ${badFilter.status}`,
  );
}

async function verifyTransitions(cookie: string, token: string) {
  console.log("\nAction buttons follow available_transitions");

  const statuses = [
    "scheduled",
    "in_pharmacy",
    "picked_up",
    "completed",
    "returned",
    "returned_to_pharmacy",
    "cancelled",
  ] as const;

  for (const status of statuses) {
    const list = await fetch(`${API}/v1/orders/?status=${status}&limit=1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const order = ((await list.json()) as { data: { id: string }[] }).data[0];
    if (!order) {
      check(`${status}: no seeded order to check (skipped)`, true);
      continue;
    }

    const detailResponse = await fetch(`${API}/v1/orders/${order.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const detail = (await detailResponse.json()) as { available_transitions: string[] };
    const page = await fetchPage(cookie, `/orders/${order.id}`);

    const cancelShown =
      page.dom.includes("Annuler la livraison") || page.dom.includes("Cancel delivery");
    const cancelAllowed = detail.available_transitions.includes("cancel");

    check(
      `${status}: cancel is shown only when the server allows it`,
      cancelShown === cancelAllowed,
      `transitions=[${detail.available_transitions.join(", ")}] but cancel ${cancelShown ? "was" : "was not"} rendered`,
    );

    const readyShown = /Marquer prête|Mark ready/.test(page.dom);
    const readyAllowed = detail.available_transitions.includes("mark_ready");

    check(
      `${status}: mark-ready is shown only when the server allows it`,
      readyShown === readyAllowed,
      `transitions=[${detail.available_transitions.join(", ")}] but mark-ready ${readyShown ? "was" : "was not"} rendered`,
    );

    // pickup / complete / return / handover belong to the driver app and must
    // never appear here, even when the server lists them as available.
    check(
      `${status}: no driver-only action leaks into the admin UI`,
      !/Ramasser|Confirmer la livraison|Retourner le colis|Remettre à la pharmacie/.test(page.dom),
    );
  }
}

/**
 * The calendar an order is born into.
 *
 * `GET /v1/orders/calendar` returns integers per day and is deliberately not
 * audit-logged, so the page can be paged freely — the counting check that
 * proves it lives in `verify-compliance.ts`.
 */
async function verifyCalendar(cookie: string, token: string) {
  console.log("\nCalendar");

  const page = await fetchPage(cookie, "/calendar");
  check("the calendar renders for a signed-in admin", page.status === 200, `status ${page.status}`);

  const month = `${today().slice(0, 7)}-01`;
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);

  const api = await fetch(`${API}/v1/orders/calendar?from=${month}&to=${lastDay}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await api.json()) as {
    days: { delivery_date: string; total: number; by_status: Record<string, number> }[];
  };
  check("the calendar endpoint answers for the visible month", api.status === 200);

  const raw = JSON.stringify(body);
  check(
    "the calendar payload carries no patient data",
    !/patient_name|address|phone_number/.test(raw),
  );
  check(
    "every day is a whole-number count",
    body.days.every((day) => Number.isInteger(day.total)),
  );

  const todaysCount = body.days.find((day) => day.delivery_date === today())?.total ?? 0;
  check(
    "today's total is shown on the grid",
    todaysCount === 0 || page.dom.includes(String(todaysCount)),
    `expected today's cell to show ${todaysCount}`,
  );

  // The board behind a day link is audit-logged, so prefetch must be off.
  check(
    "day links do not prefetch the audit-logged board",
    !/<link[^>]+rel="prefetch"[^>]+\/\?date=/.test(page.html),
  );

  const garbage = await fetchPage(cookie, "/calendar?month=not-a-month");
  check("an invalid month falls back to today instead of erroring", garbage.status === 200);
}

async function verifySnapshotIntegrity(cookie: string, token: string) {
  console.log("\nOrder PII is a snapshot, not a join");

  const list = await fetch(`${API}/v1/orders/?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const order = ((await list.json()) as {
    data: { id: string; client_id: string; address: string }[];
  }).data[0];

  if (!order) {
    check("no order available to test (skipped)", true);
    return;
  }

  const clientResponse = await fetch(`${API}/v1/clients/${order.client_id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const client = (await clientResponse.json()) as { address: string };
  const marker = `999 rue Témoin ${Date.now()}`;

  await fetch(`${API}/v1/clients/${order.client_id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ address: marker }),
  });

  try {
    const detail = await fetchPage(cookie, `/orders/${order.id}`);
    check(
      "editing a patient does not rewrite where a past package went",
      detail.dom.includes(order.address) && !detail.dom.includes(marker),
      "the order detail showed the patient's new address instead of the delivery snapshot",
    );
  } finally {
    // Put the patient record back the way it was.
    await fetch(`${API}/v1/clients/${order.client_id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ address: client.address }),
    });
  }
}

async function main() {
  console.log("\nPhases 3–4 — orders read path, history, and live updates\n");

  const { cookie, token } = await signIn();

  // --- Seed today ------------------------------------------------------------
  console.log("Seeding today's deliveries");

  const clientsResponse = await fetch(`${API}/v1/clients/?limit=5&is_active=true`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const clients = ((await clientsResponse.json()) as { data: { id: string; name: string }[] }).data;
  check("the organization has saved patients to deliver to", clients.length >= 2);

  const first = clients[0]!;
  const second = clients[1] ?? first;

  const drivers = (
    (await (
      await fetch(`${API}/v1/drivers/?is_active=true`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json()) as { data: { id: string; first_name: string; last_name: string }[] }
  ).data;

  const morning = await createOrder(token, first.id, "AM", {
    amount_due: 24.5,
    payment_status: "unpaid",
    requires_cooler_bag: true,
  });
  const afternoon = await createOrder(token, second.id, "PM", { payment_status: "paid" });
  const assigned = await createOrder(token, first.id, "AM", { amount_due: 12 });

  // Two of the three go onto the counter; `scheduled` stays behind so the
  // board has one order in each half of the new lifecycle.
  await markReady(token, morning.id);
  await markReady(token, afternoon.id);

  if (drivers[0]) {
    await fetch(`${API}/v1/orders/${assigned.id}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ driver_id: drivers[0].id }),
    });
  }
  check("three deliveries created for today", Boolean(morning.id && afternoon.id && assigned.id));

  // --- The board renders them ------------------------------------------------
  console.log("\nBoard rendering");

  const board = await fetchPage(cookie, "/");
  check("the board renders for a signed-in admin", board.status === 200, `status ${board.status}`);
  check(
    "today's patients appear on the board",
    board.dom.includes(morning.patient_name) && board.dom.includes(afternoon.patient_name),
  );

  // Counts are checked against what the API actually holds, so the assertion
  // survives repeated runs of this script rather than assuming a fresh day.
  const todaysOrders = (
    (await (
      await fetch(`${API}/v1/orders/?date=${today()}&limit=200`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json()) as { data: { delivery_window: "AM" | "PM" }[] }
  ).data;

  const amCount = todaysOrders.filter((o) => o.delivery_window === "AM").length;
  const pmCount = todaysOrders.filter((o) => o.delivery_window === "PM").length;

  /** Mirrors the ICU plural in `board.count` (fr). */
  const frCount = (n: number) =>
    n === 0 ? "aucune livraison" : n === 1 ? "1 livraison" : `${n} livraisons`;

  check(
    "each column's count matches the API",
    board.dom.includes(frCount(amCount)) && board.dom.includes(frCount(pmCount)),
    `expected AM=${amCount} (“${frCount(amCount)}”) and PM=${pmCount} (“${frCount(pmCount)}”)`,
  );
  check(
    "the cooler-bag flag is shown",
    board.dom.includes("Sac isotherme") || board.dom.includes("Cooler bag"),
  );
  check(
    "the assigned driver's name is joined onto the card",
    drivers[0] ? board.dom.includes(drivers[0].first_name) : true,
  );
  check(
    "the live-update indicator is present",
    board.dom.includes("Mise à jour automatique") || board.dom.includes("Updating automatically"),
  );

  // --- Dates -----------------------------------------------------------------
  console.log("\nCalendar dates");

  check(
    "the heading shows the pharmacy's own today, not a shifted date",
    // fr-CA full date for today, e.g. "mardi 18 août 2026"
    board.dom.includes(
      new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeZone: "UTC" }).format(
        new Date(`${today()}T00:00:00Z`),
      ),
    ),
    "the rendered date did not match the organization's calendar day",
  );

  const yesterday = new Date(`${today()}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  const past = await fetchPage(cookie, `/?date=${yesterdayIso}`);
  check("a past date loads its own board", past.status === 200);

  const future = await fetchPage(cookie, "/?date=2031-01-01");
  check(
    "a day with no deliveries shows a deliberate empty state",
    future.dom.includes("Aucune livraison") || future.dom.includes("No deliveries"),
  );

  const garbage = await fetchPage(cookie, "/?date=not-a-date");
  check("an invalid date falls back to today instead of erroring", garbage.status === 200);

  // --- Exceptions ------------------------------------------------------------
  console.log("\nExceptions");

  // The seed puts returned and completed-unpaid orders on 2026-08-17.
  const seeded = await fetchPage(cookie, "/?date=2026-08-17");
  const hasBand =
    seeded.dom.includes("À vérifier") || seeded.dom.includes("Needs attention");
  check(
    "a day with returned deliveries surfaces the exceptions band",
    hasBand,
    "no exceptions band found on the seeded day",
  );

  // --- Polling ---------------------------------------------------------------
  console.log("\nLive updates");

  const since = new Date().toISOString();

  const quiet = await fetch(`${APP}/api/orders/poll?since=${encodeURIComponent(since)}`, {
    headers: { cookie },
  });
  const quietBody = (await quiet.json()) as { changed: number; at: string };
  check("polling with nothing new reports no changes", quiet.status === 200 && quietBody.changed === 0, `changed=${quietBody.changed}`);
  check("polling returns a timestamp to continue from", typeof quietBody.at === "string");

  // Something changes on the server...
  await createOrder(token, second.id, "PM");

  const busy = await fetch(`${APP}/api/orders/poll?since=${encodeURIComponent(since)}`, {
    headers: { cookie },
  });
  const busyBody = (await busy.json()) as { changed: number };
  check("polling detects a new delivery", busy.status === 200 && busyBody.changed >= 1, `changed=${busyBody.changed}`);

  const rawBusy = JSON.stringify(busyBody);
  check(
    "the poll response carries no patient data",
    !rawBusy.includes(first.name) && !rawBusy.includes(second.name),
    rawBusy,
  );

  const noSession = await fetch(`${APP}/api/orders/poll?since=${encodeURIComponent(since)}`);
  check("polling without a session is refused", noSession.status === 401);

  const badSince = await fetch(`${APP}/api/orders/poll?since=yesterday-ish`, {
    headers: { cookie },
  });
  check("polling with an unparseable timestamp is rejected", badSince.status === 400);

  // --- Order detail ----------------------------------------------------------
  console.log("\nOrder detail");

  const detail = await fetchPage(cookie, `/orders/${morning.id}`);
  check("an order detail page renders", detail.status === 200, `status ${detail.status}`);
  check("it shows the snapshotted patient name", detail.dom.includes(morning.patient_name));
  check(
    "it shows the status timeline",
    detail.dom.includes("Historique des statuts") || detail.dom.includes("Status history"),
  );
  check(
    "an in_pharmacy order offers cancel",
    detail.dom.includes("Annuler la livraison") || detail.dom.includes("Cancel delivery"),
  );
  check(
    "no driver-only action is offered to an admin",
    !detail.dom.includes("Ramasser") && !detail.dom.includes("Proof of delivery"),
  );

  // The step without which nothing else in the lifecycle can happen.
  const scheduledDetail = await fetchPage(cookie, `/orders/${assigned.id}`);
  check(
    "a scheduled order offers mark-ready",
    scheduledDetail.dom.includes("Marquer prête") || scheduledDetail.dom.includes("Mark ready"),
  );
  check(
    "an order already on the counter does not offer mark-ready again",
    !detail.dom.includes("Marquer prête") && !detail.dom.includes("Mark ready"),
  );
  check(
    "a scheduled order is still editable",
    scheduledDetail.dom.includes("Modifier") || scheduledDetail.dom.includes("Edit"),
  );
  check(
    "the board offers to mark the day's scheduled orders ready in one go",
    board.dom.includes("Tout marquer prêt") || board.dom.includes("Mark all ready"),
  );

  const missing = await fetchPage(cookie, "/orders/00000000-0000-4000-8000-000000000000");
  check("an unknown order id is a 404", missing.status === 404, `status ${missing.status}`);

  await verifyHistory(cookie, token, drivers[0]?.id);
  await verifyTransitions(cookie, token);
  await verifyCalendar(cookie, token);
  await verifySnapshotIntegrity(cookie, token);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  console.log(`Today's board now has deliveries: ${APP}/\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nVerification aborted:", error);
  process.exit(1);
});
