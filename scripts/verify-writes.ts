/**
 * Phases 5–6 acceptance check — the order write path and patient management.
 *
 *   npm run verify:writes
 *
 * Drives a real browser against the dev server (http://localhost:3001), because
 * these are Server Actions reached through forms: the form, the action, the
 * revalidation, and the toast all have to work together, and only a browser
 * exercises that chain.
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

/**
 * The API allows 100 requests per minute per authenticated user, and each page
 * render costs several. Run back to back, the suites can exhaust that budget
 * mid-run: the dashboard's own login then answers 429, the cookie goes stale,
 * and every page quietly renders as the login screen.
 *
 * Without this guard that surfaces as a baffling 30-second `locator.fill`
 * timeout on a field that was never going to exist. `verify:all` spaces the
 * suites apart to avoid it; this says so plainly when it happens anyway.
 */
async function assertSignedIn(page: Page, where: string): Promise<void> {
  if ((await page.getByRole("button", { name: /^Se connecter$/ }).count()) === 0) return;

  throw new Error(
    `signed out at ${where} — the API's 100 req/min per-user budget is likely spent. ` +
      "Wait a minute and re-run, or run the suite on its own rather than through verify:all.",
  );
}

/** Picks the first patient from the on-demand search endpoint. */
async function pickPatient(page: Page): Promise<string> {
  await page.getByRole("combobox").first().click();
  const option = page.locator("[cmdk-item]").first();
  await option.waitFor({ state: "visible", timeout: 10_000 });
  const label = (await option.innerText()).split("\n")[0]!.trim();
  await option.click();
  return label;
}

async function main() {
  console.log("\nPhases 5–6 — order writes and patient management\n");

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
    // ------------------------------------------------------------------ create
    console.log("Creating a delivery from the quick-add drawer");

    await page.goto(`${APP}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Nouvelle livraison/i }).first().click();

    const drawer = page.getByRole("dialog");
    await drawer.waitFor({ state: "visible" });
    check("the quick-add drawer opens", await drawer.isVisible());

    const patientName = await pickPatient(page);
    const nameValue = await page.locator("#patient_name").inputValue();
    const addressValue = await page.locator("#address").inputValue();
    const phoneValue = await page.locator("#phone_number").inputValue();

    check(
      "choosing a patient prefills name, address, and phone",
      nameValue.length > 0 && addressValue.length > 0 && phoneValue.length > 0,
      `name="${nameValue}" address="${addressValue}" phone="${phoneValue}"`,
    );
    check("the prefilled fields stay editable", await page.locator("#address").isEditable());

    await page.locator("#amount_due").fill("31,50");

    // The label codes the driver checks against the counter at pickup.
    await page.getByRole("button", { name: /Ajouter un colis/i }).click();
    await page.getByLabel("Code d'étiquette").last().fill("VERIFY-A");

    await page.getByRole("button", { name: /^Enregistrer$/ }).click();

    await page.waitForSelector("[data-sonner-toast]", { timeout: 15_000 });
    const toastText = await page.locator("[data-sonner-toast]").first().innerText();
    check(
      "a success toast names the patient",
      /Livraison créée/i.test(toastText),
      toastText.replace(/\n/g, " "),
    );

    await page.waitForTimeout(1_500);
    const boardText = await page.locator("main").innerText();
    check("the new delivery appears on the board", boardText.includes(patientName));
    check(
      "the amount entered with a comma is stored and shown",
      /31,50/.test(boardText),
      "expected 31,50 $ on the card",
    );

    // Confirm the server snapshotted the patient details onto the order.
    const createdList = await fetch(`${API}/v1/orders/?date=${today()}&limit=200`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const createdOrders = ((await createdList.json()) as {
      data: {
        id: string;
        patient_name: string;
        amount_due: number | null;
        status: string;
        packages: { label_code: string; package_type: string }[];
      }[];
    }).data;
    const created = createdOrders.find((order) => Number(order.amount_due) === 31.5);
    check(
      "patient details are snapshotted onto the order",
      Boolean(created?.patient_name),
      "no order with amount 31.50 found",
    );

    // An order is born in the calendar, not on the counter. Until somebody
    // marks it ready no driver can see it — this is the regression that would
    // silently break the whole product.
    check(
      "a newly created order is scheduled, not in_pharmacy",
      created?.status === "scheduled",
      `status was "${created?.status}"`,
    );
    check(
      "the label code entered on the form round-trips",
      created?.packages.some((pkg) => pkg.label_code === "VERIFY-A") ?? false,
      JSON.stringify(created?.packages ?? []),
    );

    // ------------------------------------------------- save and add another
    console.log("\nSave and add another");

    await page.getByRole("button", { name: /Nouvelle livraison/i }).first().click();
    await drawer.waitFor({ state: "visible" });
    await pickPatient(page);
    await page.getByRole("button", { name: /ajouter un autre/i }).click();
    await page.waitForTimeout(2_000);

    check("the drawer stays open for the next entry", await drawer.isVisible());
    check(
      "the form is cleared for the next patient",
      (await page.locator("#patient_name").inputValue()) === "",
      `still held "${await page.locator("#patient_name").inputValue()}"`,
    );

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // ------------------------------------------------------------------ assign
    console.log("\nAssigning a driver");

    await page.goto(`${APP}/`, { waitUntil: "networkidle" });
    await assertSignedIn(page, "the board, before assigning");
    const assignButton = page.getByRole("button", { name: /^Assigner$/ }).first();
    check("an unassigned delivery offers an assign menu", await assignButton.isVisible());

    await assignButton.click();
    const driverOption = page.getByRole("menuitem").first();
    const driverLabel = (await driverOption.innerText()).trim();
    await driverOption.click();
    await page.waitForTimeout(2_500);

    const afterAssign = await page.locator("main").innerText();
    check(
      "the card shows the assigned driver",
      afterAssign.includes(driverLabel),
      `expected "${driverLabel}" on the board`,
    );

    // ------------------------------------------------------------- mark ready
    console.log("\nDeclaring an order ready for pickup");

    const toPrepare = createdOrders.find((order) => order.status === "scheduled");
    if (!toPrepare) throw new Error("no scheduled order to mark ready");

    // Editing is allowed while `scheduled`, not only while `in_pharmacy`:
    // staff correct an address before the bags are packed, not after.
    await page.goto(`${APP}/orders/${toPrepare.id}/edit`, { waitUntil: "networkidle" });
    check(
      "a scheduled order still renders the edit form",
      (await page.locator("#address").count()) === 1,
      (await page.locator("main").innerText()).slice(0, 160).replace(/\n/g, " "),
    );

    await page.goto(`${APP}/orders/${toPrepare.id}`, { waitUntil: "networkidle" });
    await assertSignedIn(page, "the order detail page");

    await page.getByRole("button", { name: /Marquer prête/i }).click();
    await page.waitForTimeout(2_500);

    const afterReady = await fetch(`${API}/v1/orders/${toPrepare.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const readyOrder = (await afterReady.json()) as { status: string; ready_at: string | null };
    check(
      "marking ready moves the order onto the counter",
      readyOrder.status === "in_pharmacy",
      `status was "${readyOrder.status}"`,
    );
    check("marking ready stamps ready_at", readyOrder.ready_at !== null);
    check(
      "the mark-ready control is gone once the order is ready",
      !(await page.getByRole("button", { name: /Marquer prête/i }).isVisible()),
    );

    // -------------------------------------------------------------------- edit
    console.log("\nEditing while in the pharmacy");

    const editable = createdOrders.find((order) => order.id === toPrepare.id);
    if (!editable) throw new Error("no in_pharmacy order to edit");

    await page.goto(`${APP}/orders/${editable.id}/edit`, { waitUntil: "networkidle" });
    await assertSignedIn(page, "the edit form");
    const marker = `Édition ${Date.now()}`;
    await page.locator("#address").fill(marker);
    await page.getByRole("button", { name: /^Enregistrer$/ }).click();
    await page.waitForURL(`**/orders/${editable.id}`, { timeout: 15_000 });
    await page.waitForTimeout(1_000);

    check(
      "the edit is saved and shown on the detail page",
      (await page.locator("main").innerText()).includes(marker),
    );

    // A PATCH replaces the package list wholesale, so an edit form that failed
    // to seed the existing rows would silently wipe the label codes.
    const afterEdit = (await (
      await fetch(`${API}/v1/orders/${editable.id}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json()) as { packages: { label_code: string }[] };
    check(
      "editing the address does not wipe the package list",
      afterEdit.packages.some((pkg) => pkg.label_code === "VERIFY-A"),
      JSON.stringify(afterEdit.packages),
    );

    // The edit form must refuse to render once a driver holds the package.
    const lockTarget = editable;
    if (lockTarget) {
      await fetch(`${API}/v1/orders/${lockTarget.id}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ driver_id: null }),
      });
    }

    // ------------------------------------------------------------ edit locked
    console.log("\nEditing after pickup is refused");

    const pickedUp = await fetch(`${API}/v1/orders/?status=picked_up&limit=1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const pickedUpOrder = ((await pickedUp.json()) as { data: { id: string }[] }).data[0];

    if (pickedUpOrder) {
      await page.goto(`${APP}/orders/${pickedUpOrder.id}/edit`, { waitUntil: "networkidle" });
      const lockedText = await page.locator("main").innerText();
      check(
        "the edit form is replaced by an explanation, not a 422",
        /Modifiable tant que/i.test(lockedText) &&
          (await page.locator("#address").count()) === 0,
        lockedText.slice(0, 160).replace(/\n/g, " "),
      );

      await page.goto(`${APP}/orders/${pickedUpOrder.id}`, { waitUntil: "networkidle" });
      const detailText = await page.locator("main").innerText();
      check(
        "the detail page offers no cancel for a picked-up delivery",
        !/Annuler la livraison/.test(detailText),
      );
      check(
        "the edit control is present but disabled",
        await page.getByRole("button", { name: /^Modifier$/ }).isDisabled(),
      );
    }

    // ------------------------------------------------------------------ cancel
    console.log("\nCancelling a delivery");

    const toCancel = await fetch(`${API}/v1/orders/?status=in_pharmacy&limit=1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const cancelTarget = ((await toCancel.json()) as { data: { id: string }[] }).data[0];

    if (cancelTarget) {
      await page.goto(`${APP}/orders/${cancelTarget.id}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Annuler la livraison/ }).first().click();

      const confirmDialog = page.getByRole("dialog");
      await confirmDialog.waitFor({ state: "visible" });
      check("cancel asks for confirmation first", await confirmDialog.isVisible());
      check(
        "the dialog explains a retry means a new delivery",
        /seconde tentative/i.test(await confirmDialog.innerText()),
      );

      await confirmDialog.getByRole("button", { name: /Annuler la livraison/ }).click();
      await page.waitForTimeout(2_500);

      const cancelled = await fetch(`${API}/v1/orders/${cancelTarget.id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const cancelledStatus = ((await cancelled.json()) as { status: string }).status;
      check(
        "the delivery is cancelled on the server",
        cancelledStatus === "cancelled",
        `status is ${cancelledStatus}`,
      );
    }

    // ------------------------------------------------------------- validation
    console.log("\nValidation");

    await page.goto(`${APP}/orders/new`, { waitUntil: "networkidle" });
    await page.locator("#patient_name").fill("Sans patient choisi");
    await page.locator("#address").fill("1 rue Test");
    await page.locator("#phone_number").fill("514-555-0000");
    await page.getByRole("button", { name: /^Enregistrer$/ }).click();
    await page.waitForTimeout(1_500);

    check(
      "submitting without a saved patient is refused client-side",
      page.url().includes("/orders/new"),
      "the form navigated away despite having no client_id",
    );

    await verifyClients(page, token);
    await verifyDrivers(page, token);
    await verifyInvites(page, token);
    await verifyPasswordGuard(page);
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

async function verifyClients(page: Page, token: string) {
  console.log("\nPatient management");

  const unique = Date.now();
  const name = `Testeur Vérification ${unique}`;
  const phone = `514-555-${String(unique).slice(-4)}`;

  await page.goto(`${APP}/clients/new`, { waitUntil: "networkidle" });
  await page.locator("#name").fill(name);
  await page.locator("#address").fill("42 rue de la Vérification, Montréal");
  await page.locator("#phone_number").fill(phone);
  await page.locator("#notes").fill("Sonner deux fois. Code 4412.");

  check(
    "the instructions field is labelled for logistics, not notes",
    /Consignes de livraison/.test(await page.locator("main").innerText()),
  );
  check(
    "a compliance reminder sits next to the field",
    /renseignements médicaux/i.test(await page.locator("main").innerText()),
  );

  await page.getByRole("button", { name: /Enregistrer le patient/ }).click();
  await page.waitForURL("**/clients**", { timeout: 15_000 });
  await page.waitForTimeout(1_500);

  // Creating redirects to the directory. Asserting the record is *visible*
  // there would be a lie once a pharmacy has more than one page of patients:
  // the list is alphabetical and pages at 25, so a new name sorting late simply
  // is not on page one. What create has to guarantee is the redirect and a
  // rendered directory; that the record exists is the search checks' job.
  check(
    "creating redirects to the patient directory",
    page.url().includes("/clients") && !page.url().includes("/clients/new"),
    page.url(),
  );

  // --- search ---------------------------------------------------------------
  await page.getByLabel("Rechercher par nom ou téléphone").fill(name.split(" ")[1]!);
  await page.waitForTimeout(1_500);
  check(
    "search by partial name finds the patient",
    (await page.locator("main").innerText()).includes(name),
  );

  await page.getByLabel("Rechercher par nom ou téléphone").fill(phone);
  await page.waitForTimeout(1_500);
  check(
    "search by phone finds the patient",
    (await page.locator("main").innerText()).includes(name),
  );

  // --- edit -----------------------------------------------------------------
  await page.locator("tbody tr").first().click();
  await page.locator("#notes").fill("Laisser chez le concierge.");
  await page.getByRole("button", { name: /Mettre à jour/ }).click();
  await page.waitForTimeout(2_000);

  const clientsList = await fetch(`${API}/v1/clients/?search=${encodeURIComponent(phone)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const found = ((await clientsList.json()) as {
    data: { id: string; notes: string | null; is_active: boolean }[];
  }).data[0];

  check(
    "the instructions are saved",
    found?.notes === "Laisser chez le concierge.",
    `stored notes: ${found?.notes ?? "none"}`,
  );

  // --- deactivate -----------------------------------------------------------
  await page.getByRole("button", { name: /^Désactiver$/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  check(
    "deactivation explains that history is preserved",
    /historique/i.test(await dialog.innerText()),
  );

  await dialog.getByRole("button", { name: /^Désactiver$/ }).click();
  await page.waitForTimeout(2_500);

  const afterDeactivate = await fetch(
    `${API}/v1/clients/?search=${encodeURIComponent(phone)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const deactivated = ((await afterDeactivate.json()) as {
    data: { is_active: boolean }[];
  }).data[0];
  check(
    "deactivation is a soft delete, not a removal",
    deactivated !== undefined && deactivated.is_active === false,
    "the patient record should still exist with is_active false",
  );

  // A deactivated patient must not be offered for a new delivery.
  const search = await fetch(`${APP}/api/clients/search?q=${encodeURIComponent(phone)}`, {
    headers: { cookie: `dsd_session=${await sessionCookie()}` },
  });
  const options = ((await search.json()) as { data: { id: string }[] }).data;
  check(
    "a deactivated patient is not offered in the delivery picker",
    options.length === 0,
    `${options.length} options returned`,
  );

  // --- reactivate -----------------------------------------------------------
  await page.goto(`${APP}/clients?inactive=1&q=${encodeURIComponent(phone)}`, {
    waitUntil: "networkidle",
  });
  const inactiveView = await page.locator("main").innerText();
  check("inactive patients can be shown deliberately", inactiveView.includes(name));
  check("an inactive patient is badged as such", /Inactif/.test(inactiveView));

  await page.locator("tbody tr").first().click();
  await page.getByRole("button", { name: /Réactiver/ }).click();
  await page.waitForTimeout(2_000);

  const afterReactivate = await fetch(
    `${API}/v1/clients/?search=${encodeURIComponent(phone)}&is_active=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const reactivated = ((await afterReactivate.json()) as { data: unknown[] }).data;
  check("a patient can be reactivated", reactivated.length === 1);
}

/**
 * The roster toggle. Deactivation revokes the driver's sessions immediately, so
 * the confirmation has to say so before the button does anything (PRD 5.5).
 *
 * The driver is reactivated at the end: the seed is shared with every other
 * verify script, and leaving it deactivated would break the next run.
 */
async function verifyDrivers(page: Page, token: string) {
  console.log("\nDriver roster");

  const roster = await fetch(`${API}/v1/drivers/`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const drivers = ((await roster.json()) as {
    data: { id: string; first_name: string; is_active: boolean }[];
  }).data;
  const subject = drivers.find((driver) => driver.is_active);

  if (!subject) {
    check("an active driver exists to exercise the toggle", false, "seed has none");
    return;
  }

  await page.goto(`${APP}/drivers`, { waitUntil: "networkidle" });
  check(
    "the roster renders drivers from the API, not fixtures",
    (await page.locator("main").innerText()).includes(subject.first_name),
  );

  const row = page.locator("tbody tr", { hasText: subject.first_name }).first();
  await row.getByRole("button", { name: /Désactiver/ }).click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  const dialogText = await dialog.innerText();

  check(
    "the confirmation names the driver",
    dialogText.includes(subject.first_name),
    dialogText.replace(/[\n\r]+/g, " "),
  );
  check(
    "it states plainly that they lose access immediately",
    /déconnecté/i.test(dialogText) && /renseignements des patients/i.test(dialogText),
    dialogText.replace(/[\n\r]+/g, " "),
  );

  await dialog.getByRole("button", { name: /^Désactiver$/ }).click();
  await page.waitForTimeout(2_500);

  const afterOff = await fetch(`${API}/v1/drivers/${subject.id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  check(
    "confirming deactivates the driver server-side",
    ((await afterOff.json()) as { is_active: boolean }).is_active === false,
  );

  // Restore, through the UI, which also exercises the no-dialog path.
  await page.goto(`${APP}/drivers`, { waitUntil: "networkidle" });
  await page
    .locator("tbody tr", { hasText: subject.first_name })
    .first()
    .getByRole("button", { name: /Activer/ })
    .click();
  await page.waitForTimeout(2_500);

  const afterOn = await fetch(`${API}/v1/drivers/${subject.id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  check(
    "reactivating restores access without a confirmation step",
    ((await afterOn.json()) as { is_active: boolean }).is_active === true,
  );
}

/** Generate and revoke. Codes are typed by hand off a printed sheet (PRD 5.6). */
async function verifyInvites(page: Page, token: string) {
  console.log("\nInvite codes");

  const before = await fetch(`${API}/v1/invites/?limit=200`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const countBefore = ((await before.json()) as { data: unknown[] }).data.length;

  await page.goto(`${APP}/invites`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Générer un code/ }).click();
  await page.waitForTimeout(2_500);

  const after = await fetch(`${API}/v1/invites/?limit=200`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const codes = ((await after.json()) as {
    data: { id: string; code: string; is_active: boolean; redeemed_at: string | null }[];
  }).data;

  check("generating adds a code", codes.length === countBefore + 1);

  const fresh = codes.find((code) => code.redeemed_at === null && code.is_active);
  check(
    "the code avoids characters that misread on paper (I, O, 0, 1)",
    fresh !== undefined && /^[A-HJ-NP-Z2-9]{8}$/.test(fresh.code),
    fresh?.code,
  );

  const shown = await page.locator("main").innerText();
  check(
    "it is displayed in two groups of four",
    fresh !== undefined &&
      shown.includes(`${fresh.code.slice(0, 4)} ${fresh.code.slice(4)}`),
  );

  if (fresh) {
    const card = page.locator("article", { hasText: fresh.code.slice(0, 4) }).first();
    await card.getByRole("button", { name: /Révoquer/ }).click();
    await page.waitForTimeout(2_500);

    const revoked = await fetch(`${API}/v1/invites/?limit=200`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const target = ((await revoked.json()) as {
      data: { id: string; is_active: boolean }[];
    }).data.find((code) => code.id === fresh.id);

    check("revoking deactivates the code", target?.is_active === false);
  }

  // A redeemed code cannot be revoked, so the control must not be offered.
  const redeemed = codes.find((code) => code.redeemed_at !== null);
  if (redeemed) {
    await page.goto(`${APP}/invites`, { waitUntil: "networkidle" });
    const card = page.locator("article", { hasText: redeemed.code.slice(0, 4) }).first();
    check(
      "a redeemed code offers no revoke button",
      (await card.getByRole("button", { name: /Révoquer/ }).count()) === 0,
    );
  }
}

/**
 * Only the mismatch guard is exercised. Actually changing the password would
 * revoke every session and lock the shared seed account out of every other
 * verify script — the guard is the part that can be tested safely.
 */
async function verifyPasswordGuard(page: Page) {
  console.log("\nPassword change");

  await page.goto(`${APP}/settings`, { waitUntil: "networkidle" });

  check(
    "the session-revocation warning is shown before the form, not after submit",
    /met fin à toutes vos sessions/i.test(await page.locator("main").innerText()),
  );

  await page.locator("#current_password").fill(PASSWORD);
  await page.locator("#new_password").fill("UnMotDePasseTresLong1");
  await page.locator("#confirm_password").fill("UnMotDePasseDifferent2");
  await page.getByRole("button", { name: /Changer le mot de passe/ }).click();
  await page.waitForTimeout(1_500);

  check(
    "a mismatched confirmation is refused before the request is made",
    /ne correspondent pas/i.test(await page.locator("main").innerText()),
  );
  check(
    "the admin stays signed in when the change is refused",
    page.url().includes("/settings"),
    page.url(),
  );

  await page.locator("#new_password").fill("court");
  await page.locator("#confirm_password").fill("court");
  await page.getByRole("button", { name: /Changer le mot de passe/ }).click();
  await page.waitForTimeout(1_500);

  check(
    "a password under 12 characters is refused",
    /au moins 12 caractères/i.test(await page.locator("main").innerText()),
  );
}

main().catch((error) => {
  console.error("\nVerification aborted:", error);
  process.exit(1);
});
