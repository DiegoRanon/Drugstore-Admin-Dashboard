"use server";

import { revalidatePath } from "next/cache";

import {
  clientFormFromFormData,
  clientSchema,
  updateClientSchema,
} from "@/lib/schemas/client";
import {
  fieldErrorsOf,
  invalid,
  succeed,
  toFailure,
  type ActionResult,
} from "@/lib/actions/result";
import { createClient, deactivateClient, updateClient } from "@/lib/dal/clients";
import { requireSession } from "@/lib/dal/session";

/** Patient records. Every action re-verifies the session before acting. */

function revalidateClientViews() {
  revalidatePath("/clients");
  // The quick-add picker and the history filter both read the patient list.
  revalidatePath("/");
  revalidatePath("/orders");
}

export async function createClientAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; name: string }>> {
  await requireSession();

  const parsed = clientSchema.safeParse(clientFormFromFormData(formData));
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));

  try {
    const client = await createClient(parsed.data);
    revalidateClientViews();
    return succeed({ id: client.id, name: client.name });
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateClientAction(
  clientId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string; complianceReminder: string | null }>> {
  await requireSession();

  const parsed = updateClientSchema.safeParse(clientFormFromFormData(formData));
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));

  try {
    const client = await updateClient(clientId, parsed.data);
    revalidateClientViews();
    // The server returns `compliance_reminder` whenever the instructions field
    // holds content. Nothing is stripped server-side, so surfacing it is the
    // control (PRD 5.4).
    return succeed({
      id: client.id,
      complianceReminder: client.compliance_reminder ?? null,
    });
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * A soft delete: the server sets `is_active = false` and keeps history. The
 * control says "Désactiver" because that is what actually happens — the UI must
 * not promise a deletion the server will not perform (PRD 5.4).
 */
export async function deactivateClientAction(
  clientId: string,
): Promise<ActionResult<undefined>> {
  await requireSession();

  try {
    await deactivateClient(clientId);
    revalidateClientViews();
    return succeed(undefined);
  } catch (error) {
    return toFailure(error);
  }
}

export async function reactivateClientAction(
  clientId: string,
): Promise<ActionResult<undefined>> {
  await requireSession();

  try {
    await updateClient(clientId, { is_active: true });
    revalidateClientViews();
    return succeed(undefined);
  } catch (error) {
    return toFailure(error);
  }
}
