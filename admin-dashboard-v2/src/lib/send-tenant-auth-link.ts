import { getServiceSupabase } from "./supabase-server";
import { coerceTenantAdminEmailToSuffix } from "./provision-email";
import { normalizeProvisioningEmail } from "./provision-email-policy";

function getDomainSuffix(): string {
  return import.meta.env.TENANT_DOMAIN_SUFFIX || "masjidweb.com";
}

export function isUserAlreadyRegistered(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("already been registered") ||
    msg.includes("already registered") ||
    msg.includes("user already exists") ||
    msg.includes("email address is already")
  );
}

export type SendTenantAuthLinkResult =
  | {
      ok: true;
      method: "invite";
      email: string;
      coerced: boolean;
      message: string;
      /** Same URL as in the invite email; for admin copy/paste when clipboard works after async. */
      actionLink?: string;
    }
  | {
      ok: true;
      method: "magiclink";
      email: string;
      coerced: boolean;
      actionLink: string;
      message: string;
    };

/**
 * Sends a tenant admin sign-in path on the tenant subdomain (not apex only).
 * New users: invite email → redirect …/ycode/accept-invite (set password).
 * Existing users: magic link → redirect …/ycode (passwordless login to builder).
 */
export async function sendTenantAuthLink(
  tenantId: string,
): Promise<SendTenantAuthLinkResult> {
  const supabase = getServiceSupabase();
  const domainSuffix = getDomainSuffix();

  const { data: tenant, error: fetchErr } = await supabase
    .from("tenant_registry")
    .select("id, slug, business_name, email")
    .eq("id", tenantId)
    .single();

  if (fetchErr || !tenant) {
    throw new Error("Tenant not found: " + (fetchErr?.message ?? tenantId));
  }

  const slug = tenant.slug as string;
  const siteUrl = `https://${slug}.${domainSuffix}`;
  const redirectInviteTo = `${siteUrl}/ycode/accept-invite`;
  const redirectMagicLinkTo = `${siteUrl}/ycode`;

  const fromRegistry = tenant.email
    ? normalizeProvisioningEmail(String(tenant.email))
    : "";
  const { email: inviteEmail, coerced } = coerceTenantAdminEmailToSuffix(
    fromRegistry,
    slug,
    domainSuffix,
  );

  const userMeta = {
    tenant_id: tenantId,
    tenant_slug: slug,
    display_name: tenant.business_name as string,
  };

  const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    inviteEmail,
    {
      redirectTo: redirectInviteTo,
      data: userMeta,
    },
  );
  if (!inviteErr) {
    let actionLink: string | undefined;
    const { data: inviteGen, error: inviteGenErr } =
      await supabase.auth.admin.generateLink({
        type: "invite",
        email: inviteEmail,
        options: {
          redirectTo: redirectInviteTo,
          data: userMeta,
        },
      });
    if (!inviteGenErr && inviteGen?.properties?.action_link) {
      actionLink = inviteGen.properties.action_link;
    }

    const baseMsg = coerced
      ? `Invite sent to ${inviteEmail} (coerced to @${domainSuffix}).`
      : `Invite sent to ${inviteEmail}.`;
    return {
      ok: true,
      method: "invite",
      email: inviteEmail,
      coerced,
      message: actionLink
        ? `${baseMsg} You can also copy the sign-up link below.`
        : baseMsg,
      ...(actionLink ? { actionLink } : {}),
    };
  }
  if (!isUserAlreadyRegistered(inviteErr)) {
    throw inviteErr;
  }

  const { data: linkData, error: linkErr } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: inviteEmail,
      options: {
        redirectTo: redirectMagicLinkTo,
        data: userMeta,
      },
    });

  if (linkErr) {
    throw linkErr;
  }

  const actionLink = linkData?.properties?.action_link;
  if (!actionLink) {
    throw new Error("Supabase did not return an action link.");
  }

  return {
    ok: true,
    method: "magiclink",
    email: inviteEmail,
    coerced,
    actionLink,
    message:
      "This user already exists. Copy the magic link below — redirect is " +
      redirectMagicLinkTo +
      " (not accept-invite). " +
      (coerced ? `Email used: ${inviteEmail} (coerced to @${domainSuffix}).` : ""),
  };
}
