/**
 * Route Optimizer acceptance check — address standardization and sequencing.
 *
 *   npm run verify:routes
 *
 * Drives a real browser against the dev server, because the whole point of the
 * feature is a chain that only exists end to end: an employee types, the
 * server brokers Places, the coordinates ride hidden inputs through a Server
 * Action, and the optimizer turns them into the order a driver will follow.
 * Any one of those working in isolation proves nothing.
 *
 * Needs the drugstore-server (seeded) and `npm run dev` running.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

import { chromium, type Page } from "playwright";

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

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

async function apiToken(): Promise<string> {
  const response = await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`api login failed: ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function sessionCookie(): Promise<string> {
  const response = await fetch(`${APP}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`dashboard login failed: ${response.status}`);
  const cookie = response.headers.get("set-cookie") ?? "";
  return cookie.split(";")[0]?.split("=").slice(1).join("=") ?? "";
}

/** The address field is the second combobox on the form; the patient picker is first. */
function addressInput(page: Page) {
  return page.locator("#address");
}

async function main() {
  console.log("\nRoute Optimizer — addresses, time ranges, and sequencing\n");

  const token = await apiToken();
  const cookie = await sessionCookie();

  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: "fr-CA" });
  await context.addCookies([
    {
      name: "dsd_session",
      value: cookie,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();

  try {
    // ------------------------------------------------------- the proxy itself
    console.log("Address suggestions are brokered by the server");

    // Navigate first: a relative fetch needs an origin, and this also proves
    // the session cookie is doing its job before anything else is asserted.
    await page.goto(`${APP}/`, { waitUntil: "networkidle" });

    const suggestions = await page.evaluate(async () => {
      const response = await fetch(
        "/api/places/autocomplete?q=1000%20rue%20Notre-Dame&session_token=verify-1",
        { cache: "no-store" },
      );
      return (await response.json()) as { data: unknown[] };
    });

    check(
      "the same-origin proxy returns suggestions",
      Array.isArray(suggestions.data) && suggestions.data.length > 0,
      `got ${JSON.stringify(suggestions.data).slice(0, 160)}`,
    );

    // The browser must never hold a provider key. If one had leaked into the
    // bundle this is where it would show up.
    const html = await page.content();
    check(
      "no Google API key reaches the browser",
      !/AIza[0-9A-Za-z_-]{20,}/.test(html),
    );

    // ------------------------------------------------------------- the picker
    console.log("\nPicking an address on the delivery form");

    await page.getByRole("button", { name: /Nouvelle livraison/i }).first().click();

    const drawer = page.getByRole("dialog");
    await drawer.waitFor({ state: "visible" });

    // Choose a patient first, so the form is otherwise valid.
    await page.getByRole("combobox").first().click();
    const patient = page.locator("[cmdk-item]").first();
    await patient.waitFor({ state: "visible", timeout: 10_000 });
    await patient.click();

    await addressInput(page).fill("");
    await addressInput(page).type("1000 rue Notre-Dame", { delay: 30 });

    const option = page.getByRole("option").first();
    await option.waitFor({ state: "visible", timeout: 15_000 });
    check("typing an address offers suggestions", await option.isVisible());

    await option.click();

    /*
      Wait on the coordinate, not on the text.

      The picker optimistically shows "<primary>, <secondary>" the instant a
      suggestion is clicked, and that string already ends in "Canada" — so
      waiting for the address text to look standardized returns while the
      resolve call is still in flight. The hidden latitude is the only signal
      that actually means "the round trip finished".
    */
    const latitudeInput = page.locator('input[name="address_latitude"]');
    await page
      .waitForFunction(
        () =>
          ((
            document.querySelector(
              'input[name="address_latitude"]',
            ) as HTMLInputElement | null
          )?.value.length ?? 0) > 0,
        undefined,
        { timeout: 20_000 },
      )
      .catch(() => {});

    const standardized = await addressInput(page).inputValue();
    const latitude = await latitudeInput.inputValue();
    const placeId = await page
      .locator('input[name="address_place_id"]')
      .inputValue();

    check(
      "choosing one fills in the standardized address",
      standardized.includes("Canada"),
      `address="${standardized}"`,
    );
    check(
      "coordinates travel with it",
      latitude.length > 0 && Number.isFinite(Number(latitude)),
      `latitude="${latitude}"`,
    );
    check("a place id travels with it", placeId.length > 0, `place_id="${placeId}"`);

    check(
      "the field says the address was located",
      await drawer.getByText(/Adresse localisée/i).isVisible(),
    );

    // -------------------------------------------------------- the time range
    await page.locator("#requested_time_start").fill("14:00");
    await page.locator("#requested_time_end").fill("16:00");

    const date = today();
    await page.locator("#delivery_date").fill(date);

    await drawer.getByRole("button", { name: /^Enregistrer$/i }).click();
    await page.waitForTimeout(2500);

    // ------------------------------------------------- what actually got saved
    console.log("\nWhat reached the server");

    const orders = (await (
      await fetch(`${API}/v1/orders/?date=${date}&limit=200`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json()) as { data: Record<string, unknown>[] };

    /*
      Found by place id, not by address text. Earlier runs leave orders on the
      same day whose address also ends in "Canada", and matching on that made
      this assert whichever one happened to sort first — which is how a green
      run and a red run could describe the same code.
    */
    const saved = orders.data.find((order) => order.place_id === placeId);

    check("the order saved with its standardized address", saved !== undefined);
    check(
      "the coordinates were persisted",
      saved !== undefined && saved.latitude !== null && saved.longitude !== null,
      saved ? `lat=${saved.latitude} lng=${saved.longitude}` : "",
    );
    check(
      "the place id was persisted",
      saved !== undefined && saved.place_id === placeId,
    );
    check(
      "the time range was persisted",
      saved !== undefined &&
        String(saved.requested_time_start).startsWith("14:00") &&
        String(saved.requested_time_end).startsWith("16:00"),
      saved ? `${saved.requested_time_start} → ${saved.requested_time_end}` : "",
    );

    // ------------------------------------------------------------ the route view
    console.log("\nThe route view");

    // Give the day a driver and enough stops to be worth sequencing.
    const drivers = (await (
      await fetch(`${API}/v1/drivers/`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json()) as { data: { id: string }[] };
    const driverId = drivers.data[0]!.id;

    const clients = (await (
      await fetch(`${API}/v1/clients/?limit=1&is_active=true`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json()) as { data: { id: string }[] };
    const clientId = clients.data[0]!.id;

    const created: string[] = [];
    const fixtures = [
      { address: "3895 Boul Saint-Laurent, Montréal", lat: 45.5155, lng: -73.5772 },
      { address: "1200 Av du Mont-Royal E, Montréal", lat: 45.5266, lng: -73.5786 },
      { address: "4000 Rue Wellington, Verdun", lat: 45.4585, lng: -73.5713 },
    ];

    for (const fixture of fixtures) {
      const response = await fetch(`${API}/v1/orders/`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          driver_id: driverId,
          address: fixture.address,
          place_id: `verify-${fixture.lat}`,
          formatted_address: fixture.address,
          latitude: fixture.lat,
          longitude: fixture.lng,
          delivery_date: date,
          delivery_window: "AM",
        }),
      });
      const order = (await response.json()) as { id: string };
      created.push(order.id);
      await fetch(`${API}/v1/orders/${order.id}/ready`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    }

    await page.goto(`${APP}/routes?date=${date}`, { waitUntil: "networkidle" });

    check(
      "the route view lists the driver's stops",
      (await page.locator("ol > li").count()) >= fixtures.length,
    );

    const optimizeButton = page.getByRole("button", { name: /Optimiser l'itinéraire/i }).first();
    check("an optimize control is offered", await optimizeButton.isVisible());

    check(
      "the run-level range is explained as not overriding a promise",
      await page.getByText(/sans heure promise/i).first().isVisible(),
    );

    await optimizeButton.click();
    await page.waitForTimeout(3000);

    // The server writes sequence_number; the dashboard must reflect it.
    const sequenced = (await (
      await fetch(`${API}/v1/orders/?date=${date}&driver_id=${driverId}&limit=200`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json()) as { data: { id: string; sequence_number: number | null }[] };

    const positions = sequenced.data
      .filter((order) => created.includes(order.id))
      .map((order) => order.sequence_number);

    check(
      "optimizing assigns every stop a position",
      positions.length === fixtures.length && positions.every((p) => p !== null),
      `positions=${JSON.stringify(positions)}`,
    );

    check(
      "positions are unique",
      new Set(positions).size === positions.length,
      `positions=${JSON.stringify(positions)}`,
    );

    // ------------------------------------------------------- hand-typed stays
    console.log("\nA hand-typed address is still allowed");

    await page.goto(`${APP}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Nouvelle livraison/i }).first().click();
    await page.getByRole("dialog").waitFor({ state: "visible" });

    await page.getByRole("combobox").first().click();
    const patient2 = page.locator("[cmdk-item]").first();
    await patient2.waitFor({ state: "visible", timeout: 10_000 });
    await patient2.click();

    await addressInput(page).fill("");
    await addressInput(page).type("Rang 4, Saint-Isidore-de-Nulle-Part", { delay: 10 });
    await page.waitForTimeout(1200);

    check(
      "an unrecognized address is flagged, not blocked",
      await page.getByText(/Adresse non localisée/i).first().isVisible(),
    );
    check(
      "the form can still be submitted",
      await page.getByRole("dialog").getByRole("button", { name: /^Enregistrer$/i }).isEnabled(),
    );
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
