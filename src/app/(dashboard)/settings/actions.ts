"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  fieldErrorsOf,
  invalid,
  succeed,
  toFailure,
  type ActionResult,
} from "@/lib/actions/result";
import { changePassword } from "@/lib/dal/auth";
import { updateOrganizationAddress } from "@/lib/dal/organization";
import { requireSession } from "@/lib/dal/session";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/session/cookie";
import {
  changePasswordSchema,
  passwordFormFromFormData,
} from "@/lib/schemas/password";
import {
  pharmacyAddressSchema,
  pharmacyFormFromFormData,
} from "@/lib/schemas/organization";

/**
 * Changing a password revokes **every** session, including this one (PRD 5.7).
 *
 * So on success the cookie it is holding is already worthless: the refresh
 * token inside it was revoked by the same call. Clearing it here is what stops
 * the next navigation from landing on a signed-in shell whose every fetch
 * answers 401. The caller then navigates to `/login`.
 *
 * `POST /v1/auth/logout` is deliberately *not* called afterwards — the server
 * has already revoked the family, so it would only answer 401.
 */
export async function changePasswordAction(
  formData: FormData,
): Promise<ActionResult<undefined>> {
  await requireSession();

  const parsed = changePasswordSchema.safeParse(passwordFormFromFormData(formData));
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));

  try {
    await changePassword(parsed.data.current_password, parsed.data.new_password);
  } catch (error) {
    return toFailure(error);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });

  return succeed(undefined);
}

/**
 * Sets the pharmacy address, and with it the depot every route is solved
 * around.
 *
 * `organizations.latitude/longitude` is the start and end location the route
 * optimizer sends to Google, and the origin the driver app measures ETAs
 * from. Both silently fall back — an unanchored open tour, a degraded ETA —
 * so until this form existed a missing depot was invisible from the product.
 *
 * Revalidates `/routes` as well as this page: the next optimize run reads the
 * new coordinate, and the stale sequence on screen was solved without it.
 */
export async function updatePharmacyAddressAction(
  formData: FormData,
): Promise<ActionResult<{ located: boolean }>> {
  await requireSession();

  const parsed = pharmacyAddressSchema.safeParse(
    pharmacyFormFromFormData(formData),
  );
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));

  try {
    const organization = await updateOrganizationAddress(parsed.data);
    revalidatePath("/settings");
    revalidatePath("/routes");
    return succeed({ located: organization.latitude !== null });
  } catch (error) {
    return toFailure(error);
  }
}
