import type { SupabaseClient } from "@supabase/supabase-js";

export const DUPLICATE_EMAIL_MESSAGE =
  "This email is already used by another tenant. Use a different email.";

/** Thrown for client-correctable provisioning errors (HTTP 400). */
export class ProvisionValidationError extends Error {
  override readonly name = "ProvisionValidationError";

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Normalize admin email for storage and equality checks.
 */
export function normalizeProvisioningEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Fail if another tenant already uses this email (case-insensitive, trimmed).
 * Requires DB function `tenant_registry_email_exists` (see supabase migration).
 */
export async function assertEmailAvailableForNewTenant(
  supabase: SupabaseClient,
  email: string,
): Promise<void> {
  const normalized = normalizeProvisioningEmail(email);
  if (!normalized) {
    throw new ProvisionValidationError("Email is required.");
  }

  const { data, error } = await supabase.rpc("tenant_registry_email_exists", {
    p_email: normalized,
  });

  if (error) {
    throw new Error(
      `Could not verify email availability: ${error.message}. Ensure migration tenant_registry_email_exists is applied.`,
    );
  }

  if (data === true) {
    throw new ProvisionValidationError(DUPLICATE_EMAIL_MESSAGE);
  }
}
