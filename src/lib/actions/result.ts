import { ApiError, ApiUnreachableError } from "@/lib/api/errors";

/**
 * What every Server Action returns.
 *
 * Failures travel as data rather than thrown errors so a form can render them
 * inline, and they always carry the server's `code` plus its `request_id` —
 * `code` because prose is not a contract, and `request_id` because it is the
 * handle that ties a user's report to the server logs (PRD 8.3).
 */
export type ActionFailure = {
  ok: false;
  code: string;
  requestId: string | null;
  /** Per-field messages when validation failed before the request was made. */
  fieldErrors?: Record<string, string[]>;
};

export type ActionResult<T = undefined> = { ok: true; data: T } | ActionFailure;

export function succeed<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(code: string, requestId: string | null = null): ActionFailure {
  return { ok: false, code, requestId };
}

export function invalid(fieldErrors: Record<string, string[]>): ActionFailure {
  return { ok: false, code: "VALIDATION_FAILED", requestId: null, fieldErrors };
}

/**
 * Flattens Zod issues into per-field message lists.
 *
 * Zod v4 types `path` as `PropertyKey[]`, so a symbol key is possible in
 * principle; those are folded into a form-level error rather than stringified
 * into something a form field could never match.
 */
type ZodIssueLike = { readonly path: readonly PropertyKey[]; readonly message: string };

export function fieldErrorsOf(error: {
  readonly issues: readonly ZodIssueLike[];
}): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const head = issue.path[0];
    const key = typeof head === "string" || typeof head === "number" ? String(head) : "form";
    fields[key] = [...(fields[key] ?? []), issue.message];
  }

  return fields;
}

/**
 * Normalizes anything thrown inside an action. Never leaks a stack trace or a
 * server message to the browser — those can contain patient data.
 */
export function toFailure(error: unknown): ActionFailure {
  if (error instanceof ApiError) return fail(error.code, error.requestId);
  if (error instanceof ApiUnreachableError) return fail("UNAVAILABLE");
  return fail("UNEXPECTED");
}
