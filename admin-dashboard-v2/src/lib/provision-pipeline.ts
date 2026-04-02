import { getServiceSupabase } from "./supabase-server";
import { addDomainAlias } from "./netlify-domains";
import { slugify } from "./slug";
import { createTenantSchema, type CreateTenantInput } from "./tenant-schema";
import { seedTenantCmsContent } from "./ycode-cms-seed";
import {
  cloneTemplateForTenant,
  cloneTranslationsForTenant,
  rebuildIdMapForTenant,
} from "./ycode-template-clone";
import {
  ProvisionPublishConfigError,
  triggerPostProvisionPublish,
} from "./provision-publish";
import { patchNullTenantIds } from "./provision-tenant-patch";
import { verifyTenantDemoData } from "./provision-demo-verify";
import {
  assertValidSourceTemplate,
  resolveSourceTemplateIdForClientTenant,
} from "./provision-template-source";
import {
  coerceTenantAdminEmailToSuffix,
  resolvePlaceholderProvisioningEmail,
} from "./provision-email";
import { readServerEnv } from "./server-env";
import {
  assertEmailAvailableForNewTenant,
  normalizeProvisioningEmail,
  ProvisionValidationError,
} from "./provision-email-policy";

export type ProvisionResult = {
  tenantId: string;
  slug: string;
  siteUrl: string;
  warnings: string[];
  /** When true, the tenant was created + cloned but publish/seed/invite are pending. */
  needsCompletion?: boolean;
};

function getNetlifyToken(): string {
  const t = readServerEnv("NETLIFY_AUTH_TOKEN");
  if (!t) throw new Error("NETLIFY_AUTH_TOKEN is not set");
  return t;
}

function getSiteId(): string {
  const id = readServerEnv("NETLIFY_SITE_ID");
  if (!id) throw new Error("NETLIFY_SITE_ID is not set");
  return id;
}

function getDomainSuffix(): string {
  return readServerEnv("TENANT_DOMAIN_SUFFIX") || "masjidweb.com";
}

/**
 * Phase 1 — fast path (< 8 s on free Netlify).
 * Validates, inserts registry row, adds domain alias, clones template.
 * Returns immediately so the HTTP response beats the function timeout.
 */
export async function startProvision(
  raw: unknown,
  actor: string,
): Promise<ProvisionResult> {
  const parsed = createTenantSchema.parse(raw);
  const slug = parsed.slug?.length ? parsed.slug : slugify(parsed.business_name);
  if (!slug) {
    throw new ProvisionValidationError(
      "Could not derive a URL slug from the business name.",
    );
  }

  const supabase = getServiceSupabase();
  const domainSuffix = getDomainSuffix();
  const emailResolved = resolvePlaceholderProvisioningEmail(parsed.email);
  const afterPlaceholder = normalizeProvisioningEmail(emailResolved);
  const { email, coerced: emailCoercedToSuffix } = coerceTenantAdminEmailToSuffix(
    afterPlaceholder,
    slug,
    domainSuffix,
  );

  await assertEmailAvailableForNewTenant(supabase, email);

  const input: CreateTenantInput = { ...parsed, slug, email };
  const sourceTemplateId = parsed.source_template_tenant_id;
  await assertValidSourceTemplate(supabase, sourceTemplateId);

  const siteUrl = `https://${slug}.${domainSuffix}`;

  const { data: tenantRow, error: insertErr } = await supabase
    .from("tenant_registry")
    .insert({
      slug,
      business_name: input.business_name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      domain: input.domain ?? null,
      description: input.description ?? null,
      netlify_site_url: siteUrl,
      status: "provisioning",
      tenant_kind: "client",
      provisioned_from_template_id: sourceTemplateId,
    })
    .select("id")
    .single();

  if (insertErr || !tenantRow) {
    const msg = insertErr?.message ?? "Failed to insert tenant";
    if (msg.includes("duplicate key") || msg.includes("unique")) {
      throw new ProvisionValidationError(
        "A tenant with this slug already exists. Choose a different slug or business name.",
      );
    }
    throw new Error(msg);
  }

  const tenantId = tenantRow.id as string;
  const warnings: string[] = [];

  if (afterPlaceholder !== normalizeProvisioningEmail(parsed.email)) {
    warnings.push(
      `Placeholder email was replaced with a unique address: ${afterPlaceholder}`,
    );
  }
  if (emailCoercedToSuffix) {
    warnings.push(
      `Admin login / invite email set to ${email} (must be @${domainSuffix} for reliable invite delivery; form had "${parsed.email.trim()}").`,
    );
  }

  await supabase.from("provisioning_audit_log").insert({
    tenant_id: tenantId,
    action: "tenant_created",
    actor,
    details: { slug, stage: "db_insert", architecture: "subdomain-multi-tenant" },
  });

  try {
    try {
      const token = getNetlifyToken();
      const siteId = getSiteId();
      const hostname = `${slug}.${domainSuffix}`;
      await addDomainAlias(token, siteId, hostname);
    } catch (aliasErr) {
      const msg = aliasErr instanceof Error ? aliasErr.message : String(aliasErr);
      warnings.push(`Domain alias: ${msg}`);
      await supabase.from("provisioning_audit_log").insert({
        tenant_id: tenantId,
        action: "domain_alias_warning",
        actor,
        details: { warning: msg },
      });
    }

    await cloneTemplateForTenant(tenantId, sourceTemplateId);

    await supabase.from("provisioning_audit_log").insert({
      tenant_id: tenantId,
      action: "clone_complete",
      actor,
      details: { stage: "phase1_done" },
    });

    return { tenantId, slug, siteUrl, warnings, needsCompletion: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Log before delete so we keep slug/email in audit (tenant_id FK may be cleared on delete).
    await supabase.from("provisioning_audit_log").insert({
      tenant_id: tenantId,
      action: "provision_failed",
      actor,
      details: {
        error: message,
        stage: "phase1",
        slug,
        email: input.email ?? null,
      },
    });

    const { error: deleteErr } = await supabase
      .from("tenant_registry")
      .delete()
      .eq("id", tenantId);

    if (deleteErr) {
      await supabase
        .from("tenant_registry")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", tenantId);
    }

    throw e;
  }
}

/**
 * Phase 2 — slow path (publish, CMS seed, invite, activate).
 * Called by the frontend after Phase 1 succeeds, or retried later.
 */
export async function completeProvision(
  tenantId: string,
  actor: string,
): Promise<{ warnings: string[] }> {
  const supabase = getServiceSupabase();
  const domainSuffix = getDomainSuffix();

  const { data: tenant, error: fetchErr } = await supabase
    .from("tenant_registry")
    .select(
      "id, slug, business_name, email, address, phone, domain, description, status, provisioned_from_template_id",
    )
    .eq("id", tenantId)
    .single();

  if (fetchErr || !tenant) {
    throw new Error("Tenant not found: " + (fetchErr?.message ?? tenantId));
  }

  if (tenant.status === "active") {
    return { warnings: ["Tenant is already active — skipping."] };
  }

  if (tenant.status !== "provisioning") {
    throw new Error(`Cannot complete tenant in status "${tenant.status}".`);
  }

  const slug = tenant.slug as string;
  const siteUrl = `https://${slug}.${domainSuffix}`;
  const warnings: string[] = [];
  const sourceTpl = await resolveSourceTemplateIdForClientTenant(
    supabase,
    tenantId,
  );

  try {
    // 1. CMS seed (fast DB work — no publish dependency)
    const idMap = await rebuildIdMapForTenant(supabase, tenantId, sourceTpl);
    await seedTenantCmsContent(
      tenantId,
      slug,
      {
        slug,
        business_name: tenant.business_name,
        address: tenant.address,
        phone: tenant.phone,
        email: tenant.email,
        domain: tenant.domain,
        description: tenant.description,
      },
      idMap,
      sourceTpl,
    );

    await cloneTranslationsForTenant(supabase, tenantId, idMap, sourceTpl);

    // 2. Patch null tenant_ids from clone
    await patchNullTenantIds(supabase, tenantId);

    // 3. Invite primary admin (non-fatal) — always @tenant-domain so SMTP/catch-all receives it
    const inviteFromRegistry = tenant.email
      ? normalizeProvisioningEmail(String(tenant.email))
      : "";
    const { email: inviteEmail, coerced: inviteCoerced } =
      coerceTenantAdminEmailToSuffix(inviteFromRegistry, slug, domainSuffix);
    try {
      await supabase.auth.admin.inviteUserByEmail(inviteEmail, {
        redirectTo: `https://${slug}.${domainSuffix}/ycode/accept-invite`,
        data: {
          tenant_id: tenantId,
          tenant_slug: slug,
          display_name: tenant.business_name,
        },
      });
      if (inviteCoerced && tenant.email && inviteEmail !== tenant.email) {
        warnings.push(
          `Invite was sent to ${inviteEmail} (registry had non-@${domainSuffix} address).`,
        );
      }
    } catch (inviteErr) {
      const msg = inviteErr instanceof Error ? inviteErr.message : String(inviteErr);
      warnings.push(`User invite: ${msg}`);
    }

    // 4. Mark active before publish (demo parity checks run in publishTenantAfterProvision — non-blocking for activation).
    await supabase
      .from("tenant_registry")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", tenantId);

    await supabase.from("provisioning_audit_log").insert({
      tenant_id: tenantId,
      action: "provision_complete",
      actor,
      details: { site_url: siteUrl, architecture: "subdomain-multi-tenant", warnings },
    });

    return { warnings };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from("tenant_registry")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", tenantId);

    await supabase.from("provisioning_audit_log").insert({
      tenant_id: tenantId,
      action: "provision_failed",
      actor,
      details: { error: message, stage: "phase2" },
    });

    throw e;
  }
}

/**
 * Phase 2b — YCode publish + post-publish demo checks (draft parity + published collection snapshot).
 * Often scheduled with Netlify `waitUntil` so the HTTP response can return after phase 2 while publish finishes.
 */
export async function publishTenantAfterProvision(
  tenantId: string,
  actor: string,
): Promise<{ warnings: string[] }> {
  const supabase = getServiceSupabase();
  const domainSuffix = getDomainSuffix();
  const { data: tenant, error: fetchErr } = await supabase
    .from("tenant_registry")
    .select("id, slug, status")
    .eq("id", tenantId)
    .single();

  if (fetchErr || !tenant) {
    throw new Error("Tenant not found: " + (fetchErr?.message ?? tenantId));
  }
  if (tenant.status !== "active") {
    throw new Error(
      `Publish step requires an active tenant (status: ${tenant.status}).`,
    );
  }

  const slug = tenant.slug as string;
  const warnings: string[] = [];
  const sourceTpl = await resolveSourceTemplateIdForClientTenant(
    supabase,
    tenantId,
  );

  const publishHook = await triggerPostProvisionPublish(
    slug,
    domainSuffix,
    warnings,
  );
  if (!publishHook.ok) {
    if (publishHook.configError) {
      throw new ProvisionPublishConfigError(
        "Provisioning cannot finish until PROVISIONING_WEBHOOK_SECRET (16+ chars) is set to the same value on this dashboard and the YCode Netlify site.",
      );
    }
    await supabase.from("provisioning_audit_log").insert({
      tenant_id: tenantId,
      action: "provision_publish_failed",
      actor,
      details: { message: publishHook.message },
    });
    throw new Error(
      publishHook.message ||
        "YCode publish did not succeed — retry or open the builder and click Publish.",
    );
  }

  try {
    await verifyTenantDemoData(supabase, tenantId, warnings, sourceTpl, {
      skipPublishedCollectionCheck: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(
      `Post-publish demo check failed (non-fatal; publish succeeded): ${msg}`,
    );
  }

  await supabase.from("provisioning_audit_log").insert({
    tenant_id: tenantId,
    action: "provision_publish_step",
    actor,
    details: { warnings },
  });

  return { warnings };
}

/**
 * Legacy single-call pipeline — runs both phases sequentially.
 * Will timeout on free Netlify plans; use startProvision + completeProvision instead.
 */
export async function runProvisionPipeline(
  raw: unknown,
  actor: string,
): Promise<ProvisionResult> {
  const phase1 = await startProvision(raw, actor);
  const phase2 = await completeProvision(phase1.tenantId, actor);
  const phase2b = await publishTenantAfterProvision(phase1.tenantId, actor);
  return {
    ...phase1,
    warnings: [
      ...phase1.warnings,
      ...phase2.warnings,
      ...phase2b.warnings,
    ],
    needsCompletion: false,
  };
}
