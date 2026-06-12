import { getServiceSupabase } from "./supabase-server";
import { coerceTenantAdminEmailToSuffix } from "./provision-email";
import { normalizeProvisioningEmail } from "./provision-email-policy";
import { updateProvisionAuthMetadataForUser } from "./provision-auth-metadata";

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

export type SendTenantAuthLinkOptions = {
  /**
   * Generate a copy/open link via admin generateLink only — do not send Supabase invite email.
   * For smoke tests and admin copy/paste when inbox access is unavailable.
   */
  returnLinkOnly?: boolean;
};

export type SendTenantAuthLinkResult =
  | {
      ok: true;
      method: "invite";
      email: string;
      coerced: boolean;
      message: string;
      /** Same URL as in the invite email; for admin copy/paste when clipboard works after async. */
      actionLink?: string;
      /** True when returnLinkOnly was used (no invite email sent). */
      linkOnly?: boolean;
    }
  | {
      ok: true;
      method: "magiclink";
      email: string;
      coerced: boolean;
      actionLink: string;
      message: string;
      linkOnly?: boolean;
    };

export function buildTenantAuthRedirectUrls(siteUrl: string): {
  invite: string;
  magicLink: string;
} {
  const acceptInviteUrl = `${siteUrl}/ycode/accept-invite`;
  return {
    invite: acceptInviteUrl,
    magicLink: acceptInviteUrl,
  };
}

async function generateTenantAuthLinkWithoutEmail(
  supabase: ReturnType<typeof getServiceSupabase>,
  inviteEmail: string,
  coerced: boolean,
  domainSuffix: string,
  redirectInviteTo: string,
  redirectMagicLinkTo: string,
  userMeta: Record<string, string>,
  ensureTrustedAuthMetadata: (user: unknown) => Promise<void>,
): Promise<SendTenantAuthLinkResult> {
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
    await ensureTrustedAuthMetadata(inviteGen.user);
    const baseMsg = coerced
      ? `Sign-up link ready for ${inviteEmail} (coerced to @${domainSuffix}). No email sent.`
      : `Sign-up link ready for ${inviteEmail}. No email sent.`;
    return {
      ok: true,
      method: "invite",
      email: inviteEmail,
      coerced,
      actionLink: inviteGen.properties.action_link,
      message: `${baseMsg} Opens …/ycode/accept-invite to set a password.`,
      linkOnly: true,
    };
  }

  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
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
  await ensureTrustedAuthMetadata(linkData.user);

  return {
    ok: true,
    method: "magiclink",
    email: inviteEmail,
    coerced,
    actionLink,
    linkOnly: true,
    message:
      "Magic link generated (no email sent). Opens the tenant builder after sign-in. " +
      (coerced ? `Email: ${inviteEmail} (@${domainSuffix}).` : ""),
  };
}

/**
 * Sends a tenant admin sign-in path on the tenant subdomain (not apex only).
 * New users: invite email → redirect …/ycode/accept-invite (set password).
 * If invite email cannot be sent because the user already exists: try generateLink(invite) so
 * someone who never finished password setup can still open accept-invite; if that is not
 * available, generateLink(magiclink) for passwordless login. Callback URL for magic links:
 * …/ycode/api/auth/callback (server PKCE exchange; required for email-opened links).
 *
 * With returnLinkOnly: skip invite email; use generateLink(invite) then magiclink fallback.
 */
export async function sendTenantAuthLink(
  tenantId: string,
  options: SendTenantAuthLinkOptions = {},
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
  const redirectUrls = buildTenantAuthRedirectUrls(siteUrl);
  const redirectInviteTo = redirectUrls.invite;
  const redirectMagicLinkTo = redirectUrls.magicLink;

  const fromRegistry = tenant.email
    ? normalizeProvisioningEmail(String(tenant.email))
    : "";
  const { email: inviteEmail, coerced } = coerceTenantAdminEmailToSuffix(
    fromRegistry,
    slug,
    domainSuffix,
  );

  const displayName = tenant.business_name as string;
  const userMeta = {
    tenant_id: tenantId,
    tenant_slug: slug,
    display_name: displayName,
  };
  const ensureTrustedAuthMetadata = async (user: unknown): Promise<void> => {
    if (!user || typeof user !== "object" || !("id" in user)) return;
    await updateProvisionAuthMetadataForUser(supabase, user as never, {
      tenantId,
      tenantSlug: slug,
      displayName,
    });
  };

  if (options.returnLinkOnly) {
    return generateTenantAuthLinkWithoutEmail(
      supabase,
      inviteEmail,
      coerced,
      domainSuffix,
      redirectInviteTo,
      redirectMagicLinkTo,
      userMeta,
      ensureTrustedAuthMetadata,
    );
  }

  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    inviteEmail,
    {
      redirectTo: redirectInviteTo,
      data: userMeta,
    },
  );
  if (!inviteErr) {
    await ensureTrustedAuthMetadata(inviteData.user);
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
    await ensureTrustedAuthMetadata(inviteRecovery.user);
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
  await ensureTrustedAuthMetadata(linkData.user);

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
