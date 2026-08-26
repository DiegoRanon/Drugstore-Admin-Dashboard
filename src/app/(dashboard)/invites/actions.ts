"use server";

import { revalidatePath } from "next/cache";

import { succeed, toFailure, type ActionResult } from "@/lib/actions/result";
import { createInvite, revokeInvite } from "@/lib/dal/invites";
import { requireSession } from "@/lib/dal/session";

/**
 * Codes are eight characters from an alphabet omitting I, O, 0, and 1, because
 * drivers type them by hand off a printed sheet. The server picks them; the
 * dashboard never generates or validates a code itself (PRD 5.6).
 */
export async function createInviteAction(): Promise<ActionResult<{ code: string }>> {
  await requireSession();

  try {
    const invite = await createInvite();
    revalidatePath("/invites");
    return succeed({ code: invite.code });
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Only an unredeemed code can be revoked; the server answers 409 otherwise.
 * The UI hides the control in that case, but the check is the server's — a
 * code can be redeemed between the page render and the click.
 */
export async function revokeInviteAction(
  inviteId: string,
): Promise<ActionResult<undefined>> {
  await requireSession();

  try {
    await revokeInvite(inviteId);
    revalidatePath("/invites");
    return succeed(undefined);
  } catch (error) {
    return toFailure(error);
  }
}
