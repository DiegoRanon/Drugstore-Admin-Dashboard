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
  return {
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone_number: String(formData.get("phone_number") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}
