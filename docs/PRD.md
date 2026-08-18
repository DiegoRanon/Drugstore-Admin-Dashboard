# PRD — Admin Dashboard (Next.js)

**Product:** Drugstore Delivery App B2B
**Component:** Pharmacy-facing web dashboard
**Status:** Development Planning
**Version:** 0.1 (MVP) — written against server API v1, 30 operations across six route groups

---

## 1. Purpose & Scope

The admin dashboard is the pharmacy's entire interface to the platform. A pharmacist opens it in the morning, enters the day's deliveries, assigns them to drivers, and watches them close. It holds **no business logic**: order rules, state transitions, and access control all live on the server, and the dashboard renders what the API tells it.

MVP §2 names React.js. This document specifies **Next.js (App Router)** instead — the same React, with server-side rendering that lets patient data be fetched and composed on a server inside Canadian infrastructure rather than assembled in the browser from a token the browser has to hold. §4 and §8 explain why that difference carries most of the compliance weight in this project.

### In scope

- Authentication and session management for the `admin` role
- Daily delivery board: create, edit, assign, cancel, and track orders
- Saved patient (client) management
- Driver roster management and invite-code issuance
- Bilingual FR/EN interface, French by default
- Law 25 / PIPEDA controls that fall on the client tier

### Out of scope (MVP)

- The driver interface — that is the React Native app; this dashboard has no driver-role views
- Live driver map, logistical reports, and invoicing — **the server has no endpoints for these yet** (§9). Do not design screens against them.
- Any medical, pharmaceutical, or prescription field. The API has nowhere to put such data and the UI must not invite it (MVP §4).
- Card entry or payment processing of any kind. Drivers collect on a physical POS; the dashboard only ever reads whether money was collected (MVP §5).
- Patient-facing views. Patients receive notifications; they never log in.
- Pharmacy onboarding/signup. Creating an organization is an operator task behind an internal service token, unreachable from any user session.

---

## 2. Architecture & Stack

| Layer        | Choice                           | Notes                                                              |
| ------------ | -------------------------------- | ------------------------------------------------------------------ |
| Framework    | Next.js 15, App Router           | React Server Components; Node runtime only                         |
| Language     | TypeScript, strict               | `noUncheckedIndexedAccess` to match the server repo                |
| API types    | `openapi-typescript`             | Generated from the server's `openapi.json` — never hand-written    |
| Server state | TanStack Query                   | Client-side polling and cache only; RSC handles first paint        |
| Forms        | React Hook Form + Zod            | Zod schemas mirrored from the generated API types                  |
| Styling      | Tailwind CSS                     | With a small token layer so FR/EN text expansion is a class change |
| i18n         | `next-intl`                      | FR default, EN toggle; locale seeded from `organization.locale`    |
| Tables       | TanStack Table (headless)        | Cursor pagination only — see §6.3                                  |
| Session      | `jose` JWE in an httpOnly cookie | Tokens never reach browser JavaScript (§4.2)                       |
| Hosting      | ECS Fargate, **ca-central-1**    | Self-hosted. Not Vercel — see below                                |
| Secrets      | AWS Secrets Manager              | Same mechanism as the server                                       |

### 2.1 Deployment topology and why it is not Vercel

MVP §2 and PRD §8.1 require all personal information to stay in Canadian infrastructure. Next.js renders patient names and addresses **on the server**, which makes the rendering tier an in-scope processor of personal information:

- **Self-host on ECS Fargate in** `ca-central-1`, behind the same ALB as the API. Managed Next.js platforms distribute rendering across a global edge network, which would place PII rendering outside Canada with no per-request control.
- **No Edge Runtime anywhere.** Pin `export const runtime = "nodejs"` and keep middleware in the Node runtime. Edge middleware would perform token exchange at whichever POP served the request.
- **No CDN caching of HTML.** Static assets (`/_next/static`) may be cached at the edge; rendered documents must not be.
- The dashboard calls the API over the internal network. The API's `CORS_ORIGINS` still needs the public dashboard origin for the few browser-direct calls, but the bulk of traffic never leaves the VPC.

---

## 3. Application Structure

App Router, route groups by access:

```
app/
  (public)/
    login/                     — the only unauthenticated screen
  (dashboard)/
    layout.tsx                 — session guard, org header, nav
    page.tsx                   — Today's board (landing)
    orders/
      page.tsx                 — history with filters
      new/page.tsx
      [id]/page.tsx            — detail + timeline
      [id]/edit/page.tsx
    clients/
      page.tsx  [id]/page.tsx  [id]/edit/page.tsx  new/page.tsx
    drivers/
      page.tsx                 — roster
    invites/
      page.tsx
    settings/
      page.tsx                 — profile, password, language
  api/
    auth/login/route.ts
    auth/logout/route.ts
    orders/poll/route.ts       — the board's polling endpoint (§6.4)
middleware.ts                  — session refresh + route protection
```

### 3.1 Server vs client components

Default to Server Components. A component becomes a Client Component only when it needs interactivity, and **PII must not be passed into a Client Component unless that component renders it**. Props to Client Components are serialized into the HTML payload; passing a whole order object to a client-side wrapper that only needs `id` puts a patient's address into the document for no reason.

| Concern                                          | Where it runs                        |
| ------------------------------------------------ | ------------------------------------ |
| Reading orders, clients, drivers for first paint | Server Component                     |
| Create / edit / assign / cancel                  | Server Action                        |
| Login, logout                                    | Route Handler (needs to set cookies) |
| Board polling                                    | Client Component → Route Handler     |
| Filters, dialogs, form state                     | Client Component                     |

---

## 4. Authentication & Session Management

### 4.1 What the server gives us

`POST /v1/auth/login` returns a 15-minute access JWT and a 30-day opaque refresh token. Refresh rotates: each call to `/v1/auth/refresh` invalidates the token presented and issues a new one. **Presenting an already-rotated token is treated as theft and revokes the entire token family**, logging the user out everywhere.

That last rule is the constraint the whole session design has to satisfy.

### 4.2 The session cookie (non-negotiable)

Tokens are **never** exposed to browser JavaScript. No `localStorage`, no `sessionStorage`, no JS-readable cookie.

- On login, the Route Handler calls the API, then seals `{ access_token, refresh_token, expires_at, user, organization }` into a **JWE** (`jose`, `dir` + `A256GCM`) using a key from Secrets Manager.
- The sealed blob is set as a single cookie: `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` matching the refresh TTL.
- Server Components, Server Actions, and Route Handlers unseal it and attach `Authorization: Bearer` server-side.

Rationale: a 30-day refresh token in `localStorage` is a 30-day credential to patient addresses, retrievable by any XSS. Under Law 25 that is a reportable confidentiality incident. An httpOnly cookie removes the entire class.

`SameSite=Lax` rather than `Strict` so a link into the dashboard from an email lands on the intended page instead of a login screen. All mutations go through Server Actions, which carry Next's built-in CSRF protection via the Origin check; any hand-written Route Handler that mutates must verify `Origin` explicitly.

### 4.3 Refresh, and why it needs a lock

Server Components cannot set cookies in the App Router. Refresh therefore runs in **middleware**, which can write cookies onto the response.

Middleware, on every authenticated request:

1. Unseal the cookie. Missing or undecryptable → redirect to `/login`.
2. If the access token has more than 60 seconds left, continue.
3. Otherwise acquire a **Redis lock** keyed on the session id (reuse the API's ElastiCache cluster), call `/v1/auth/refresh`, re-seal the cookie, release.
4. If another request holds the lock, wait briefly for the refreshed value rather than issuing a second refresh.

The lock is the point. Without it, a page issuing three parallel Server Component fetches, or a user with two tabs, triggers concurrent refreshes with the same token — the second one looks exactly like a stolen-token replay, and the server revokes the family. The user is logged out for doing nothing wrong. **Exactly one refresh may be in flight per session.**

A `401 INVALID_REFRESH_TOKEN` is terminal: clear the cookie, redirect to login. Never retry.

### 4.4 Route protection

Middleware guards `(dashboard)` wholesale — no per-page checks to forget. The dashboard is admin-only; if a `driver` token ever reaches it, show a plain "use the mobile app" screen rather than a broken UI, since every admin endpoint will answer `403`.

### 4.5 Organization scoping

The dashboard **never sends an organization id**. The server resolves it from the token and filters at the data layer. There is no org selector, no org field on any form, and no UI that implies a user can act across pharmacies.

---

## 5. Functional Requirements

### 5.1 Login (MVP §3)

Single form, email + password. On success, route by `user.role` — `admin` to the board, `driver` to the "use the mobile app" screen.

Error handling maps directly to server codes:

| Code                  | Message shown                                                                     |
| --------------------- | --------------------------------------------------------------------------------- |
| `INVALID_CREDENTIALS` | "Incorrect email or password." — identical for both causes, deliberately          |
| `ACCOUNT_DISABLED`    | "This account has been deactivated. Contact your administrator."                  |
| `LOGIN_THROTTLED`     | "Too many attempts. Try again in _N_ minutes." from `details.retry_after_seconds` |

The throttle counts against the email, so the correct password is also refused once the limit is hit. Say how long the wait is; a generic "try again later" will generate support calls.

### 5.2 Today's board — landing screen

The primary screen and the one that must feel effortless. Default view: today's orders, grouped into **AM** and **PM** columns, each order a card showing patient name, address, driver, and payment state.

- Status is encoded in form as well as text — a colour stripe or chip — so a pharmacist can scan the board without reading.
- Exceptions surface at the top: returned orders, orders completed while still `unpaid`, and `cooler_bag_confirmed = null` on an order that required one.
- Unassigned orders are visually distinct; assigning is the main action of the morning.
- Date stepper for yesterday/tomorrow. Data source: `GET /v1/orders?date=YYYY-MM-DD`.

`delivery_date` is a calendar date, not a timestamp. Do not run it through a timezone conversion — parse and render it as a plain date, or a Montreal pharmacy will see deliveries shift a day.

### 5.3 Order management (MVP §6)

| Action         | Endpoint                      | UI rule                                                                         |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| Create         | `POST /v1/orders`             | Patient picked from saved clients; name/address/phone prefill and stay editable |
| List / history | `GET /v1/orders`              | Filters: date, status, driver, client                                           |
| Detail         | `GET /v1/orders/{id}`         | Includes `status_events` timeline and `available_transitions`                   |
| Edit           | `PATCH /v1/orders/{id}`       | **Only when** `status === "in_pharmacy"`                                        |
| Assign         | `POST /v1/orders/{id}/assign` | Dropdown from the driver roster, filtered to `is_active`                        |
| Cancel         | `POST /v1/orders/{id}/cancel` | Only from `in_pharmacy`; confirm first                                          |

Three rules that must be honoured or the UI will lie to the user:

1. **Render action buttons from** `available_transitions`**.** Do not reimplement the state machine in React. The array is authoritative and stays correct as rules change.
2. **Edit is disabled outside** `in_pharmacy`**.** Once a driver holds the package, changing the address would mean the delivery in progress no longer matches the record of it. Disable the control and explain why rather than letting the user submit and collect a `422`.
3. **Show order PII from the order, not the client.** Name, address, and phone are snapshotted at creation. Editing a patient never rewrites past deliveries, and the history view must reflect where the package actually went.

`amount_collected` differing from `amount_due` is an exception worth flagging on the order detail — the server returns both but draws no conclusion.

### 5.4 Client management (MVP §4)

Full CRUD over `/v1/clients`, with search by name or phone.

Delete is a **soft delete**: the server sets `is_active = false` and history is preserved. Label the control "Deactivate", not "Delete" — the UI must not promise something the server will not do.

The `notes` field is a compliance boundary. It exists for logistics ("buzz code 4412", "leave with concierge") and must not become a shadow medical record. When it holds content the API returns `compliance_reminder`; render that text adjacent to the field, not in a dismissed toast. Nothing is stripped server-side, so **this UI is the actual control**. Label the field "Delivery instructions" rather than "Notes" — the name shapes what gets typed into it.

### 5.5 Driver roster (MVP §6 — User Management)

`GET /v1/drivers` backs both the roster page and the assign dropdown. Fetch once per session and cache; it is small and changes rarely.

`PATCH /v1/drivers/{id}` toggles employment status. Deactivation revokes the driver's sessions immediately, so the confirmation dialog must say so plainly: _"Marc will be signed out of the mobile app and will lose access to patient information immediately."_

The response returns `active_order_count`. When it is above zero, follow the confirmation with a prompt to reassign those orders — deactivation is not blocked by them, by design, but leaving them stranded is the likely mistake.

Employment status is the only editable field. Names, email, and password belong to the driver.

### 5.6 Invite codes (MVP §3)

Generate, list, and revoke. Codes are eight characters from an alphabet omitting I, O, 0, and 1, because drivers type them by hand off a printed sheet.

- Render uppercase, monospace, spaced in two groups of four.
- Provide copy-to-clipboard and a print view.
- Show redemption state; a redeemed code cannot be revoked (`409`), and revoking would not remove the driver it created — direct the admin to the roster instead.

### 5.7 Settings

Password change (`POST /v1/auth/password/change`) and language toggle. Changing a password revokes **every** session including the current one — warn before submitting, then redirect to login.

### 5.8 Bilingual FR/EN

Quebec-facing commercial software. French is the default and must be complete, not a partial translation of an English-first UI.

- Initial locale from `organization.locale`; user override persisted in a preference cookie.
- French UI strings run 15–30% longer than English — build layouts that tolerate it rather than truncating.
- Dates and numbers formatted per locale; `fr-CA` for French.
- Patient-entered data is never translated.

---

## 6. Data Fetching & State

### 6.1 Types come from the server

`openapi-typescript` against the server's `openapi.json`, committed to the dashboard repo and regenerated whenever the server's route schemas change. Hand-written request or response interfaces are not permitted — that is the drift the generated spec exists to prevent.

```bash
npx openapi-typescript ../drugstore-server/openapi.json -o src/api/schema.d.ts
```

### 6.2 Fetch layer

One typed client wrapping `fetch`, used only from server-side code. It attaches the bearer token, sets `cache: "no-store"` for anything carrying PII, and normalizes the error envelope into a typed `ApiError` carrying `code`, `message`, `details`, and `request_id`.

Switch on `error.code`, never on message text. Codes are a stable contract; prose is not.

### 6.3 Pagination is keyset — this constrains the UI

The API returns `{ data, next_cursor, has_more }`. There are **no page numbers and no total count**, deliberately: pages stay stable while orders are being created all day.

Consequences the design must absorb:

- No "Page 3 of 12" control, and no jump-to-page.
- Use "Load more" or infinite scroll; next/prev is acceptable if backward cursors are held in client state.
- Do not display "247 results". If a count is genuinely needed on the board, count what is loaded and label it honestly ("showing 50").
- Cursors are opaque. Never parse or construct one. An invalid cursor returns `INVALID_CURSOR` — recover by dropping it and refetching from the start.

Sorting is fixed server-side (orders newest-first, clients and drivers alphabetical). There is no `?sort=` parameter, so column headers must not appear sortable unless sorting the loaded page client-side is genuinely acceptable for that table.

### 6.4 Live updates: polling, not sockets

The server has **no WebSocket layer** (§9). The documented approach is polling `GET /v1/orders?updated_since=`, and every write bumps `updated_at` through a database trigger, so it cannot miss a change.

- A Client Component on the board polls a thin Route Handler every **10 seconds** while the tab is visible, passing the timestamp of the last successful fetch.
- Pause on `visibilitychange`; resume with an immediate fetch.
- Merge deltas into the TanStack Query cache rather than refetching the board.
- Budget: 6 requests/minute against a 100/minute per-user limit, leaving ample headroom for the user's actual work.

Build this behind a small `useOrderUpdates()` hook so the transport can be swapped for a socket in Phase 4 without touching the board.

### 6.5 Mutations

Server Actions, with `revalidatePath` on the affected routes. Optimistic updates are appropriate for assignment; they are **not** appropriate for cancel or any state transition, where the server may legitimately refuse (`409 ORDER_INVALID_TRANSITION`) because the state moved underneath the user. Refetch the order and show what actually happened.

---

## 7. Design & Accessibility

| Requirement     | Target                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| Accessibility   | WCAG 2.1 AA — keyboard-operable throughout, visible focus, 4.5:1 contrast    |
| Status encoding | Never colour alone; pair with text or shape (colour-blind pharmacists exist) |
| Responsive      | 1280px+ primary; usable at 768px for counter tablets                         |
| Browsers        | Evergreen Chrome, Edge, Safari, Firefox                                      |
| Motion          | Honour `prefers-reduced-motion`                                              |
| Density         | Information-dense over spacious — this is a working tool used all day        |

The board is scanned and operated, not read. Surface exceptions before detail, encode state in form as well as number, and make interactive things look interactive.

---

## 8. Privacy & Security (client tier)

The server enforces access control; the dashboard's job is to avoid widening the exposure surface the server carefully narrowed.

### 8.1 Prefetch corrupts the audit trail

`GET /v1/orders/{id}` and `GET /v1/clients/{id}` are **audit-logged** — each read writes a row to an append-only `access_audit_log` recording who accessed which patient's information, for Law 25 accountability.

Next.js `<Link>` prefetches on viewport entry by default. How much it prefetches depends on the route: for a dynamic route the default fetches only as far as the nearest `loading.tsx` boundary, so a correctly-placed boundary may spare the page's own data fetch — but that is a subtle framework behaviour that changes between versions and disappears the moment someone removes a `loading.tsx` or marks a route static.

The failure mode if it does prefetch: a board with 50 order cards records **50 accesses that never happened**, filling the accountability record with reads no human performed and destroying its evidentiary value.

**Set** `prefetch={false}` **explicitly on every link to an audited detail route**, and do not rely on boundary placement to prevent the fetch. This is a compliance requirement, not a performance preference — add a lint rule, and assert it in a test (§10). Verify the actual behaviour once against `access_audit_log` in a dev environment: scroll a full board, then confirm no `order.detail.read` rows appeared.

### 8.2 Caching

- Every route rendering PII is dynamic. Reading the session cookie forces this, but set `export const dynamic = "force-dynamic"` explicitly so it survives refactoring.
- Fetches carrying PII use `cache: "no-store"`. Never `revalidate`.
- Configure `staleTimes` so the client Router Cache does not serve a previous patient's detail on back-navigation.
- Response headers on dashboard documents: `Cache-Control: no-store, private`.
- No PII in `localStorage`, `sessionStorage`, IndexedDB, or a service worker cache.

### 8.3 Logging and error reporting

No PII in browser console output, and none in error-tracking payloads. Configure Sentry (or equivalent) scrubbing **before first deploy**, not after: `beforeSend` must drop request bodies and strip `patient_name`, `address`, `phone_number`, and `email`. The server already redacts these at its logger; the dashboard must not reintroduce them from the other side.

Surface `request_id` in error toasts. It is the handle that ties a user's report to the server logs.

### 8.4 Session hygiene

- Idle timeout at **30 minutes** with a warning at 28. Pharmacy workstations are shared and sit at a counter.
- "Sign out" calls `POST /v1/auth/logout` to revoke the refresh token server-side, then clears the cookie. Clearing the cookie alone leaves a valid 30-day credential alive on the server.
- No "remember me" that extends the refresh window beyond the server's 30 days.

### 8.5 Content Security Policy

Strict CSP with a per-request nonce, no `unsafe-inline`, no `unsafe-eval`. The dashboard renders patient data; script injection here is a confidentiality incident, and CSP is the last line of defence behind React's escaping.

---

## 9. Server Contract Dependencies

### 9.1 Ready now

Auth, orders, clients, drivers, and invites are complete and verified — 183 server tests and 163 HTTP smoke checks green. The dashboard can be built against the running API today.

### 9.2 Not built — do not design against these

| MVP requirement          | Server state                                                | Dashboard implication                                 |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| Live driver map (§6)     | No location ingest, no WebSocket, no Mapbox adapter         | No map screen in v1. Largest remaining server effort. |
| Reports & analytics (§6) | No endpoints; source data complete in `order_status_events` | No analytics screen. Aggregation work, not modelling. |
| Invoicing (§6)           | Tables and per-pharmacy rate exist; no generation code      | No billing screen.                                    |
| Patient SMS (§7)         | No Twilio integration                                       | No notification status column on orders.              |

Leave navigation space for these, but ship no placeholder screens — a disabled "Reports" tab teaches pharmacists the product is unfinished.

### 9.3 Gaps to raise with the server team

1. **Driver names on orders.** Orders carry `driver_id` only; the dashboard joins client-side against the cached roster. Fine at current scale, worth revisiting if the roster grows past a few dozen.
2. **No bulk assign.** Assigning twenty morning orders is twenty requests. If that is the real morning workflow, a batch endpoint is worth requesting before the UI is built around single assignment.
3. **No health/version endpoint the dashboard can show.** `/health` is a static string and does not check the database, so it cannot back a status indicator.

---

## 10. Non-Functional Requirements

| Requirement                  | Target                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| LCP on the board (p75)       | < 2.0 s                                                                                                                                          |
| Interaction to Next Paint    | < 200 ms                                                                                                                                         |
| Board poll interval          | 10 s while visible; paused when hidden                                                                                                           |
| Availability                 | Matches the API — 99.5% during pharmacy hours (07:00–21:00 ET)                                                                                   |
| Bundle (initial JS, gzipped) | < 200 KB                                                                                                                                         |
| Accessibility                | WCAG 2.1 AA, verified with axe in CI                                                                                                             |
| Test coverage                | Non-negotiable: session/refresh logic, `available_transitions` button rendering, the edit-disabled rule, and prefetch-disabled on audited routes |
| Observability                | Error tracking with PII scrubbing; `request_id` surfaced in every error                                                                          |

---

## 11. Suggested Build Sequence

1. **Foundation** — Next.js scaffold, generated API types, typed fetch client, error envelope handling, Tailwind tokens, CI.
2. **Session** — login, JWE cookie, middleware refresh with Redis lock, route protection, idle timeout. _Get this right before building screens; it is the hardest part to retrofit._
3. **Orders read path** — board, history, detail with timeline. Establishes RSC patterns and PII handling.
4. **Orders write path** — create, edit, assign, cancel via Server Actions, driven by `available_transitions`.
5. **Clients & drivers** — CRUD, roster, invites.
6. **Polish** — FR/EN, accessibility pass, exception surfacing, empty and error states.
7. **Later phases** — live map, reports, invoicing, as the server ships them.

---

## 12. Open Questions

1. **Order volume per pharmacy per day?** Fifteen orders and two hundred are different products — the second needs bulk assignment and a denser board, and the answer should be known before §5.2 is designed.
2. **Is the morning workflow bulk or incremental?** Whether a pharmacist enters all deliveries at 8am or throughout the day changes whether create should be a full page or an always-available quick-add.
3. **Do multiple staff use one shared workstation login?** If so, the audit trail attributes every read to one account, which weakens Law 25 accountability. Per-user accounts would require lifting the one-admin-per-organization constraint on the server.
4. **Should the board show driver locations once §9.2 ships, or is a status list sufficient?** Real-time tracking is the headline competitive feature (MVP §1) but the most expensive thing left to build.
5. **Print requirements?** Pharmacies often want a paper manifest per driver. Nothing in MVP §6 asks for it, but it is a common counter workflow and cheap to add early.
6. **Idle timeout of 30 minutes — acceptable operationally?** Shorter is safer for a shared counter machine; longer is less irritating. Needs a real pharmacist's input.
