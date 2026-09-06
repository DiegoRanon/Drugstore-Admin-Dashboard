import { z } from "zod";

/**
 * Mirrored from the server's `/v1/clients` request schemas.
 *
 * `notes` is a compliance boundary, not a free-text field: it exists for
 * logistics ("buzz code 4412", "leave with the concierge") and must not become a
 * shadow medical record. Nothing is stripped server-side, so the UI is the
 * actual control — hence the label "Consignes de livraison" and the reminder
 * pinned next to the input (PRD 5.4).
 */
export const clientSchema = z.object({
  name: z.string().trim().min(1).max(255),
  address: z.string().trim().min(1).max(500),
  /**
   * Standardized once here, then copied onto every order this patient
   * receives. Optional throughout — a hand-typed address is still a valid
   * patient record, it just cannot take part in route optimization.
   */
  place_id: z.string().trim().min(1).max(255).nullable().optional(),
  formatted_address: z.string().trim().min(1).max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  phone_number: z.string().trim().min(1).max(50),
  notes: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional(),
});

export const updateClientSchema = clientSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type ClientInput = z.infer<typeof clientSchema>;

export function clientFormFromFormData(formData: FormData) {
  // Both halves of the coordinate or neither — the server pairs them with a
  // CHECK constraint, and a lone latitude is not a location.
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
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    place_id: located ? text("address_place_id") : null,
    formatted_address: located ? text("address_formatted") : null,
    latitude: located ? latitude : null,
    longitude: located ? longitude : null,
    phone_number: String(formData.get("phone_number") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}
