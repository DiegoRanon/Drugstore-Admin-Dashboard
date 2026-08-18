import "server-only";

import { cache } from "react";

/**
 * Thrown when a request reaches the data layer without a usable session.
 * Callers redirect to `/login`; they never retry.
 */
export class SessionRequiredError extends Error {
  constructor() {
    super("No active session");
    this.name = "SessionRequiredError";
  }
}

/**
 * The authoritative session check.
 *
 * Proxy only performs an *optimistic* check — it can be skipped by a matcher
 * change, and Server Functions are POSTs to their host route rather than
 * separate routes, so proxy coverage can disappear in a refactor without
 * anyone noticing. Every read and every mutation therefore comes through here.
 *
 * Phase 2 replaces the body with unsealing the JWE session cookie. Until then
 * `DEV_ACCESS_TOKEN` lets the data layer be exercised against the real API.
 *
 * `cache()` dedupes this across a single render pass.
 */
export const requireAccessToken = cache(async (): Promise<string> => {
  const token = process.env.DEV_ACCESS_TOKEN;
  if (!token) throw new SessionRequiredError();
  return token;
});
