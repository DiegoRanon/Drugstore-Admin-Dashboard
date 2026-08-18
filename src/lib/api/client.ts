import "server-only";

import { ApiError, ApiUnreachableError } from "./errors";

/**
 * The single path from this app to the delivery API.
 *
 * `server-only` is the enforcement: importing this from a Client Component is a
 * build error, so a bearer token can never be bundled into browser JavaScript
 * and patient data can never be fetched from the browser (PRD 4.2, 6.2).
 */
const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";

type QueryValue = string | number | boolean | null | undefined;

export type ApiRequest = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** Bearer token. Omitted for login/refresh, which authenticate by body. */
  token?: string | null;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Replay protection for mutations the server accepts a key on. */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

function buildUrl(path: string, query: ApiRequest["query"]): string {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const { method = "GET", token, query, body, idempotencyKey, signal } = request;

  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      // Everything here carries patient data or authorizes access to it.
      // Nothing may enter a shared cache (PRD 8.2).
      cache: "no-store",
    });
  } catch (cause) {
    throw new ApiUnreachableError(cause);
  }

  if (!response.ok) throw await ApiError.fromResponse(response);

  // 204 on logout, invite revocation, and client deactivation.
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return (await response.json()) as T;
}
