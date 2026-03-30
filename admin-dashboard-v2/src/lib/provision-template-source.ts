import type { SupabaseClient } from "@supabase/supabase-js";
import { getTemplateTenantId } from "./master-tenant-constants";
import { ProvisionValidationError } from "./provision-email-policy";

export async function assertValidSourceTemplate(
  supabase: SupabaseClient,
  templateId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("tenant_registry")
    .select("id, tenant_kind")
    .eq("id", templateId)
    .maybeSingle();

  if (error) throw new Error(`Template lookup failed: ${error.message}`);
  if (!data) {
    throw new ProvisionValidationError("Selected demo template was not found.");
  }
  if (data.tenant_kind !== "template") {
    throw new ProvisionValidationError(
      "The selected tenant is not classified as a demo template.",
    );
  }
}

/**
 * Template used when cloning CMS rows in phase 2 — must match phase 1 clone source.
 */
export async function resolveSourceTemplateIdForClientTenant(
  supabase: SupabaseClient,
  clientTenantId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("tenant_registry")
    .select("provisioned_from_template_id")
    .eq("id", clientTenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const id = data?.provisioned_from_template_id as string | null;
  if (id) return id;
  return getTemplateTenantId();
}
