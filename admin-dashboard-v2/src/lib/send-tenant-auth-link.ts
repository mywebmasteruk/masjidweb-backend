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

/**
 * True when inviteUserByEmail cannot run because this email is already in Supabase Auth
 * (fully registered, or invited but not finished). In those cases we try generateLink(invite)
 * first (finish password), then generateLink(magiclink).
 */
export function inviteUserByEmailFailedForExistingUser(err: unknown): boolean {
  if (isUserAlreadyRegistered(err)) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("already invited") ||
    msg.includes("already been invited") ||
    msg.includes("has already been invited")
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
 * If invite email cannot be sent because the user already exists: try generateLink(invite) so
 * someone who never finished password setup can still open accept-invite; if that is not
 * available, generateLink(magiclink) for passwordless login. Callback URL for magic links:
 * …/ycode/api/auth/callback (server PKCE exchange; required for email-opened links).
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
  /**
   * Same tenant origin as `siteUrl`. Must use the server callback route: magic links open in a
   * fresh browser context with no PKCE code_verifier, so client-side `exchangeCodeForSession` on
   * `/ycode?code=` fails and users stay on the login screen. `/ycode/api/auth/callback` exchanges
   * the code and sets cookies (see Next.js route).
   */
  const redirectMagicLinkTo = `${siteUrl}/ycode/api/auth/callback`;

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
  if (!inviteUserByEmailFailedForExistingUser(inviteErr)) {
    throw inviteErr;
  }

  // Stuck “invited” users (no password yet): admin invite email won’t send again, but this link
  // can still open accept-invite. Fully registered users usually get an error here → magic link.
  const { data: inviteRecovery, error: inviteRecoveryErr } =
    await supabase.auth.admin.generateLink({
      type: "invite",
      email: inviteEmail,
      options: {
        redirectTo: redirectInviteTo,
        data: userMeta,
      },
    });

  if (!inviteRecoveryErr && inviteRecovery?.properties?.action_link) {
    return {
      ok: true,
      method: "invite",
      email: inviteEmail,
      coerced,
      message:
        "User already exists in Auth — we could not send another invite email. " +
        "Copy the link below to finish password setup (accept-invite) if they never completed it. " +
        "If that page says the link is invalid or they already have a password, click Login link again to get a magic link." +
        (coerced ? ` Email: ${inviteEmail} (@${domainSuffix}).` : ""),
      actionLink: inviteRecovery.properties.action_link,
    };
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
      "This user already exists with a completed account. Copy the magic link below (opens builder after sign-in). " +
      (coerced ? `Email used: ${inviteEmail} (coerced to @${domainSuffix}).` : ""),
  };
}
