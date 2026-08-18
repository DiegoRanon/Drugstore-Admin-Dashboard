import "server-only";

import { cache } from "react";

import type { Organization, SessionUser } from "@/api/types";
import { apiFetch } from "@/lib/api/client";

import { requireAccessToken } from "./session";

export type LoginResult = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SessionUser;
};

/** Authenticates by body, not by bearer — no session exists yet. */
export async function login(email: string, password: string): Promise<LoginResult> {
  return apiFetch<LoginResult>("/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

/**
 * Rotating: the presented token is invalidated and a new one issued. Presenting
 * an already-rotated token looks like theft to the server and revokes the whole
 * family — which is why exactly one refresh may be in flight per session
 * (PRD 4.3). The lock lives in Phase 2, around this call.
 */
export async function refresh(refreshToken: string): Promise<LoginResult> {
  return apiFetch<LoginResult>("/v1/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

/**
 * Revokes server-side. Clearing the cookie alone would leave a valid 30-day
 * credential alive (PRD 8.4).
 */
export async function logout(refreshToken: string): Promise<void> {
  await apiFetch<void>("/v1/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

export type CurrentUser = {
  user: SessionUser & { phone: string | null };
  organization: Organization;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const token = await requireAccessToken();
  return apiFetch<CurrentUser>("/v1/auth/me", { token });
});

/**
 * Same call, for a token that is not in a cookie yet — login has to resolve the
 * organization (name, timezone, locale) before it can seal the session, since
 * `/v1/auth/login` returns only `organization_id`.
 */
export async function fetchCurrentUserWithToken(token: string): Promise<CurrentUser> {
  return apiFetch<CurrentUser>("/v1/auth/me", { token });
}

/** Revokes every session, including the current one. Warn before calling. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const token = await requireAccessToken();
  await apiFetch<void>("/v1/auth/password/change", {
    method: "POST",
    token,
    body: { current_password: currentPassword, new_password: newPassword },
  });
}
