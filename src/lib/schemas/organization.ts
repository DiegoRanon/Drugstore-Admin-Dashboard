import { z } from "zod";

/**
 * The pharmacy address, as the Settings form submits it.
 *
 * Mirrors `updateOrganizationBodySchema` on the server. The coordinate is
 * what makes this form worth having: it becomes the depot every driver route
 * starts from and returns to, so an address saved without one leaves routes
 * unanchored — allowed, but worth telling the admin about.
 */
export const pharmacyAddressSchema = z.object({
  address: z.string().trim().min(1).max(500),
  place_id: z.string().trim().min(1).max(255).nullable().optional(),
  formatted_address: z.string().trim().min(1).max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export type PharmacyAddressInput = z.infer<typeof pharmacyAddressSchema>;

/** Same both-or-neither reading the patient and order forms use. */
export function pharmacyFormFromFormData(formData: FormData) {
  const latitude = Number(formData.get("address_latitude") ?? "");
  const longitude = Number(formData.get("address_longitude") ?? "");
  const located =
    String(formData.get("address_latitude") ?? "").trim().length > 0 &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const text = (field: string): string | null => {
    const value = String(formData.get(field) ?? "").trim();
    return value.length > 0 ? value : null;
  };

  return {
    address: String(formData.get("address") ?? ""),
    place_id: located ? text("address_place_id") : null,
    formatted_address: located ? text("address_formatted") : null,
    latitude: located ? latitude : null,
    longitude: located ? longitude : null,
  };
}
