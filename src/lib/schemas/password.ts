import { z } from "zod";

/**
 * Mirrored from the server's `changePasswordBodySchema`: 12 characters
 * minimum, 200 maximum, and the new password must differ from the current one.
 *
 * The confirmation field is client-tier only — the server has no such field.
 * It exists so a typo in a password nobody can see does not lock the admin out
 * of an account whose every session is about to be revoked.
 */
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1).max(200),
    new_password: z.string().min(12, "TOO_SHORT").max(200),
    confirm_password: z.string(),
  })
  .refine((value) => value.new_password === value.confirm_password, {
    path: ["confirm_password"],
    message: "MISMATCH",
  })
  .refine((value) => value.current_password !== value.new_password, {
    path: ["new_password"],
    message: "SAME_AS_CURRENT",
  });

export function passwordFormFromFormData(formData: FormData) {
  return {
    current_password: String(formData.get("current_password") ?? ""),
    new_password: String(formData.get("new_password") ?? ""),
    confirm_password: String(formData.get("confirm_password") ?? ""),
  };
}
