import type { SupabaseClient, User } from "@supabase/supabase-js";

export type ProvisionAuthMetadataInput = {
  tenantId: string;
  tenantSlug: string;
  displayName?: string | null;
};

type AuthMetadataUser = Pick<User, "id" | "app_metadata" | "user_metadata">;

export function buildProvisionAuthMetadataUpdate(
  user: Pick<AuthMetadataUser, "app_metadata" | "user_metadata">,
  input: ProvisionAuthMetadataInput,
): {
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
} {
  return {
    app_metadata: {
      ...(user.app_metadata as Record<string, unknown> | undefined),
      tenant_id: input.tenantId,
      tenant_slug: input.tenantSlug,
    },
    user_metadata: {
      ...(user.user_metadata as Record<string, unknown> | undefined),
      tenant_id: input.tenantId,
      tenant_slug: input.tenantSlug,
      ...(input.displayName ? { display_name: input.displayName } : {}),
    },
  };
}

export async function updateProvisionAuthMetadataForUser(
  supabase: SupabaseClient,
  user: AuthMetadataUser,
  input: ProvisionAuthMetadataInput,
): Promise<void> {
  const { error } = await supabase.auth.admin.updateUserById(
    user.id,
    buildProvisionAuthMetadataUpdate(user, input),
  );

  if (error) {
    throw new Error(`Failed to set tenant metadata for auth user: ${error.message}`);
  }
}
