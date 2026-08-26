"use server";

import { revalidatePath } from "next/cache";

import { succeed, toFailure, type ActionResult } from "@/lib/actions/result";
import { setDriverActive } from "@/lib/dal/drivers";
import { requireSession } from "@/lib/dal/session";

/**
 * Employment status is the only field an admin may change. Names, email, and
 * password belong to the driver (PRD 5.5).
 *
 * Deactivating revokes the driver's refresh tokens server-side, so this is not
 * a reversible toggle in the way the UI makes it look: reactivating restores
 * access, but whoever was holding the phone was signed out the moment this
 * returned.
 */
export async function setDriverActiveAction(
  driverId: string,
  isActive: boolean,
): Promise<ActionResult<{ activeOrderCount: number }>> {
  await requireSession();

  try {
    const driver = await setDriverActive(driverId, isActive);

    revalidatePath("/drivers");
    // The assign dropdown and the history filter both read the roster.
    revalidatePath("/");
    revalidatePath("/orders");

    // Deliberately not blocked when this is above zero: stranding deliveries is
    // the likely mistake, but the server lets it happen by design, so the UI
    // prompts to reassign instead of refusing (PRD 5.5).
    return succeed({ activeOrderCount: driver.active_order_count });
  } catch (error) {
    return toFailure(error);
  }
}
