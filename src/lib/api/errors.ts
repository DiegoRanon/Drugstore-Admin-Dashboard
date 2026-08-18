/**
 * The server's failure envelope, normalized.
 *
 * Verified against the running API: the body is `{ error: { code, message,
 * details } }` and the correlation id arrives as the `x-request-id` *header*,
 * not a body field. `request_id` is what ties a user's report to the server
 * logs, so it is lifted onto the error here and surfaced in every toast.
 *
 * Always branch on `code`. It is a stable contract; `message` is prose and will
 * change without notice.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly requestId: string | null;
  /** Seconds to wait, from `x-ratelimit-reset` when the body carries none. */
  readonly rateLimitReset: number | null;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
    requestId?: string | null;
    rateLimitReset?: number | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? {};
    this.requestId = init.requestId ?? null;
    this.rateLimitReset = init.rateLimitReset ?? null;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const requestId = response.headers.get("x-request-id");
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const rateLimitReset = Number.isFinite(reset) && reset > 0 ? reset : null;
    let code = `HTTP_${response.status}`;
    let message = response.statusText || "Request failed";
    let details: Record<string, unknown> = {};

    try {
      const payload: unknown = await response.json();
      const envelope =
        typeof payload === "object" && payload !== null && "error" in payload
          ? (payload as { error: unknown }).error
          : null;

      if (typeof envelope === "object" && envelope !== null) {
        const record = envelope as Record<string, unknown>;
        if (typeof record.code === "string") code = record.code;
        if (typeof record.message === "string") message = record.message;
        if (typeof record.details === "object" && record.details !== null) {
          details = record.details as Record<string, unknown>;
        }
      }
    } catch {
      // A non-JSON body (gateway error page, truncated response) still has to
      // produce a usable error rather than masking the status.
    }

    return new ApiError({
      code,
      message,
      status: response.status,
      details,
      requestId,
      rateLimitReset,
    });
  }

  /** The session is gone for good — clear the cookie, never retry. */
  get isTerminalAuthFailure(): boolean {
    return (
      this.status === 401 &&
      (this.code === "INVALID_REFRESH_TOKEN" || this.code === "INVALID_TOKEN")
    );
  }
}

/** The API could not be reached at all. Distinct from an error it returned. */
export class ApiUnreachableError extends Error {
  constructor(readonly cause: unknown) {
    super("The delivery API could not be reached");
    this.name = "ApiUnreachableError";
  }
}

/** Codes the UI branches on. Not exhaustive — unknown codes fall through. */
export const ERROR_CODES = {
  invalidCredentials: "INVALID_CREDENTIALS",
  accountDisabled: "ACCOUNT_DISABLED",
  /** Per-email: 5 failures in 15 minutes, then exponential backoff. */
  loginThrottled: "LOGIN_THROTTLED",
  /** Per-IP, and it trips *first* on a shared pharmacy connection. */
  rateLimited: "RATE_LIMITED",
  invalidCursor: "INVALID_CURSOR",
  invalidTransition: "ORDER_INVALID_TRANSITION",
} as const;

/**
 * How long the user must wait, in seconds.
 *
 * Two different limiters answer 429 and they report the wait differently:
 * `LOGIN_THROTTLED` (per email) puts it in `details.retry_after_seconds`, while
 * the per-IP `RATE_LIMITED` sends empty details and only an
 * `x-ratelimit-reset` header. Both must produce a real number of minutes on the
 * login screen — "try again later" generates support calls (PRD 5.1).
 */
export function retryAfterSeconds(error: ApiError): number | null {
  const value = error.details.retry_after_seconds;
  if (typeof value === "number") return value;
  return error.rateLimitReset;
}

export function isThrottled(error: ApiError): boolean {
  return (
    error.status === 429 ||
    error.code === ERROR_CODES.loginThrottled ||
    error.code === ERROR_CODES.rateLimited
  );
}
