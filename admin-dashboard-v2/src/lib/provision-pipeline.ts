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
import { isUserAlreadyRegistered } from "./send-tenant-auth-link";
import { reclaimClientTenantForSlugReuse } from "./provision-tenant-reclaim";
import {
  acquirePhase2LeaderOrWait,
  releasePhase2LeaderClaim,
} from "./provision-phase2-lock";

/** Result shape for {@link provisionTenantFullFlow} (single-request dashboard provision). */
export type ProvisionFullFlowOutcome =
  | "created"
  | "resumed_provisioning"
  | "already_active"
  | "recreated_after_failure";

export type ProvisionResult = {
  tenantId: string;
  slug: string;
  siteUrl: string;
  warnings: string[];
  /** When true, the tenant was created + cloned but publish/seed/invite are pending. */
  needsCompletion?: boolean;
  outcome?: ProvisionFullFlowOutcome;
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

async function countDraftRows(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  table: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_published", false)
    .is("deleted_at", null);
  if (error) {
    throw new Error(`${table} count failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Non-fatal clone sanity checks to catch partial copy issues quickly.
 * Adds warnings (does not fail provisioning) to avoid regressions for live customers.
 */
async function appendCloneIntegrityWarnings(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  warnings: string[],
): Promise<void> {
  try {
    const [pages, layers, collections] = await Promise.all([
      countDraftRows(supabase, tenantId, "pages"),
      countDraftRows(supabase, tenantId, "page_layers"),
      countDraftRows(supabase, tenantId, "collections"),
    ]);

    if (pages === 0) {
      warnings.push(
        "Clone check — tenant has 0 draft pages after clone (expected at least homepage).",
      );
    }
    if (layers === 0) {
      warnings.push(
        "Clone check — tenant has 0 draft page_layers after clone (pages may render empty).",
      );
    }
    if (collections === 0) {
      warnings.push(
        "Clone check — tenant has 0 draft collections after clone (CMS content may be missing).",
      );
    }
  } catch (e) {
    warnings.push(
      `Clone check — non-fatal validation error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
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

  // Snapshot the template's published_at so we can tell which version was cloned.
  let templateVersion: string | null = null;
  try {
    const { data: tplSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("tenant_id", sourceTemplateId)
      .eq("key", "published_at")
      .maybeSingle();
    templateVersion = (tplSetting?.value as string) ?? null;
  } catch {
    // Non-fatal — column may not exist yet or template has never been published.
  }

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
      provisioned_template_version: templateVersion,
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

    // Template clone moved to phase 2 (completeProvision) so phase 1 stays
    // well under the Netlify gateway timeout (~26 s).  Return immediately.
    return { tenantId, slug, siteUrl, warnings, needsCompletion: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
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
 * Phase 2 — clone template data, CMS seed, invite, activate.
 * Called by the frontend after Phase 1 succeeds, or retried later.
 *
 * Clone is done here (not in Phase 1) so that Phase 1 always returns within
 * the Netlify gateway timeout (~26 s).  An idempotent guard checks for an
 * existing `clone_complete` audit entry so that concurrent retries never
 * clone the same tenant twice.
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
  const phase2TimingMs: Record<string, number> = {};
  const sourceTpl = await resolveSourceTemplateIdForClientTenant(
    supabase,
    tenantId,
  );

  const lock = await acquirePhase2LeaderOrWait(supabase, tenantId, actor);
  if (lock.role === "follower" || lock.role === "follower_timeout") {
    return { warnings: [...warnings, ...lock.warnings] };
  }

  try {
    // 0. Clone template data (idempotent — skip if already done).
    const { data: cloneDoneRows } = await supabase
      .from("provisioning_audit_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("action", "clone_complete")
      .limit(1);

    if (!cloneDoneRows || cloneDoneRows.length === 0) {
      const cloneStart = Date.now();
      await cloneTemplateForTenant(tenantId, sourceTpl);
      phase2TimingMs.clone = Date.now() - cloneStart;
      const cloneCheckStart = Date.now();
      await appendCloneIntegrityWarnings(supabase, tenantId, warnings);
      phase2TimingMs.clone_check = Date.now() - cloneCheckStart;
      await supabase.from("provisioning_audit_log").insert({
        tenant_id: tenantId,
        action: "clone_complete",
        actor,
        details: { stage: "phase2_clone", timing_ms: phase2TimingMs },
      });
    }

    // 1. CMS seed (fast DB work — no publish dependency)
    const cmsSeedStart = Date.now();
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
    phase2TimingMs.cms_seed = Date.now() - cmsSeedStart;

    const translationsStart = Date.now();
    await cloneTranslationsForTenant(supabase, tenantId, idMap, sourceTpl);
    phase2TimingMs.translations = Date.now() - translationsStart;

    // 2. Patch null tenant_ids from clone
    const patchStart = Date.now();
    await patchNullTenantIds(supabase, tenantId);
    phase2TimingMs.patch_null_tenant_ids = Date.now() - patchStart;

    // 3. Invite primary admin (non-fatal) — always @tenant-domain so SMTP/catch-all receives it
    const inviteFromRegistry = tenant.email
      ? normalizeProvisioningEmail(String(tenant.email))
      : "";
    const { email: inviteEmail, coerced: inviteCoerced } =
      coerceTenantAdminEmailToSuffix(inviteFromRegistry, slug, domainSuffix);
    const inviteStart = Date.now();
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
      if (isUserAlreadyRegistered(inviteErr)) {
        warnings.push(
          `No invite email — ${inviteEmail} already has an account. Use "Login link" on this tenant in the dashboard (magic link to ${siteUrl}/ycode), or open the builder and sign in.`,
        );
      } else {
        warnings.push(`User invite: ${msg}`);
      }
    }
    phase2TimingMs.invite = Date.now() - inviteStart;

    // 4. Mark active before publish (demo parity checks run in publishTenantAfterProvision — non-blocking for activation).
    const activateStart = Date.now();
    await supabase
      .from("tenant_registry")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", tenantId);
    phase2TimingMs.activate = Date.now() - activateStart;

    await supabase.from("provisioning_audit_log").insert({
      tenant_id: tenantId,
      action: "provision_complete",
      actor,
      details: {
        site_url: siteUrl,
        architecture: "subdomain-multi-tenant",
        warnings,
        phase2_timing_ms: phase2TimingMs,
      },
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
  } finally {
    await releasePhase2LeaderClaim(supabase, tenantId);
  }
}

/**
 * Phase 2 (seed, invite, activate) plus auto-publish in one call.
 * Publish failures become warnings; the tenant stays active when phase 2 succeeded.
 */
export async function finishProvisionAndPublish(
  tenantId: string,
  actor: string,
): Promise<{ warnings: string[] }> {
  const completeOut = await completeProvision(tenantId, actor);
  const warnings = [...completeOut.warnings];
  try {
    const pub = await publishTenantAfterProvision(tenantId, actor);
    warnings.push(...pub.warnings);
  } catch (pubErr) {
    if (pubErr instanceof ProvisionPublishConfigError) {
      warnings.push(
        `Publish: ${pubErr.message} Set the same PROVISIONING_WEBHOOK_SECRET (16+ chars) on this dashboard and the YCode Netlify site, and set YCODE_SITE_INTERNAL_URL to the pool hostname (e.g. https://your-site.netlify.app) so publish does not depend on new subdomain TLS.`,
      );
    } else {
      const msg = pubErr instanceof Error ? pubErr.message : String(pubErr);
      warnings.push(
        `Publish: ${msg} The tenant is active — open the builder on their subdomain and click Publish, or use Continue setup to retry.`,
      );
    }
  }
  return { warnings };
}

/**
 * Phase 1 — idempotent variant of {@link startProvision}.
 *
 * Checks for an existing tenant with the same slug first:
 * - `provisioning` → returns it with `needsCompletion: true` so the dashboard chains
 *   phase 2 + publish as normal (no duplicate row).
 * - `active` → returns it with `needsCompletion: false` so the dashboard shows success
 *   immediately.
 * - `failed` / `deactivated` → reclaims (removes) the old row, then runs a fresh
 *   {@link startProvision}.
 * - `template` kind → throws a clear validation error.
 * - New slug → delegates to {@link startProvision}.
 */
export async function startProvisionIdempotent(
  raw: unknown,
  actor: string,
): Promise<ProvisionResult> {
  const slug = resolveProvisionSlug(raw);
  const domainSuffix = getDomainSuffix();
  const siteUrl = `https://${slug}.${domainSuffix}`;
  const supabase = getServiceSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("tenant_registry")
    .select("id, status, tenant_kind")
    .eq("slug", slug)
    .maybeSingle();

  if (existingErr) {
    throw new Error(`Could not look up tenant by slug: ${existingErr.message}`);
  }

  if (existing) {
    if (existing.tenant_kind === "template") {
      throw new ProvisionValidationError(
        `Slug "${slug}" is reserved by a demo template. Choose a different slug.`,
      );
    }

    if (existing.status === "provisioning") {
      return {
        tenantId: existing.id as string,
        slug,
        siteUrl,
        needsCompletion: true,
        outcome: "resumed_provisioning",
        warnings: [
          "Resumed provisioning for this slug (e.g. after a gateway timeout or duplicate request). No duplicate tenant was created.",
        ],
      };
    }

    if (existing.status === "active") {
      return {
        tenantId: existing.id as string,
        slug,
        siteUrl,
        needsCompletion: false,
        outcome: "already_active",
        warnings: [
          "This subdomain is already provisioned and active. No duplicate was created.",
        ],
      };
    }

    if (existing.status === "failed" || existing.status === "deactivated") {
      const reclaimWarnings: string[] = [
        `Removed the previous ${existing.status} tenant for this slug so a clean provision can run.`,
      ];
      await reclaimClientTenantForSlugReuse(
        supabase,
        { id: existing.id as string, slug },
        reclaimWarnings,
      );
      const fresh = await startProvision(raw, actor);
      return {
        ...fresh,
        outcome: "recreated_after_failure",
        warnings: [...reclaimWarnings, ...fresh.warnings],
      };
    }

    throw new ProvisionValidationError(
      `Slug "${slug}" is already in use (status: ${existing.status}). Open the dashboard to resolve that tenant or pick another slug.`,
    );
  }

  const result = await startProvision(raw, actor);
  return { ...result, outcome: "created" };
}

/**
 * Derive URL slug the same way as {@link startProvision} (must stay in sync).
 */
function resolveProvisionSlug(raw: unknown): string {
  const parsed = createTenantSchema.parse(raw);
  const slug = parsed.slug?.length ? parsed.slug : slugify(parsed.business_name);
  if (!slug) {
    throw new ProvisionValidationError(
      "Could not derive a URL slug from the business name.",
    );
  }
  return slug;
}

/**
 * Full flow in one server invocation: registry + clone + CMS + invite + activate + publish.
 * For POST /api/provision-all (single browser request — no client-side phase split).
 *
 * **Idempotent behaviour (best-effort “no false failures”):**
 * - `provisioning` — resume with {@link finishProvisionAndPublish} (same as before).
 * - `active` — succeed with `already_active`, refresh publish in the background when possible.
 * - `failed` / `deactivated` — reclaim slug (alias + scoped data + registry row), then provision fresh.
 * - Concurrent duplicate insert — short delay + retry by re-reading slug (resume / already_active / throw).
 * Template rows with the same slug still block with a clear validation error.
 */
export async function provisionTenantFullFlow(
  raw: unknown,
  actor: string,
): Promise<{
  tenantId: string;
  slug: string;
  siteUrl: string;
  warnings: string[];
  outcome: ProvisionFullFlowOutcome;
}> {
  return runProvisionTenantFullFlowResolved(raw, actor, 0);
}

export function isDuplicateSlugProvisionError(e: unknown): boolean {
  if (!(e instanceof ProvisionValidationError)) return false;
  const m = e.message;
  return (
    m.includes("slug already exists") ||
    m.includes("A tenant with this slug already exists")
  );
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
  if (publishHook.ok) {
    try {
      await patchNullTenantIds(supabase, tenantId);
    } catch (patchErr) {
      const msg = patchErr instanceof Error ? patchErr.message : String(patchErr);
      warnings.push(
        `Post-publish tenant_id patch (non-fatal): ${msg}`,
      );
    }
  }
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

async function tryRepublishActiveTenant(
  tenantId: string,
  actor: string,
): Promise<string[]> {
  const warnings: string[] = [];
  try {
    const pub = await publishTenantAfterProvision(tenantId, actor);
    warnings.push(...pub.warnings);
  } catch (e) {
    if (e instanceof ProvisionPublishConfigError) {
      warnings.push(`Publish: ${e.message}`);
    } else {
      warnings.push(
        `Publish refresh: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return warnings;
}

async function runFreshProvisionAfterConflictResolution(
  raw: unknown,
  actor: string,
  slug: string,
  siteUrl: string,
  prefixWarnings: string[],
  outcomeOnSuccess: "created" | "recreated_after_failure",
  depth: number,
): Promise<{
  tenantId: string;
  slug: string;
  siteUrl: string;
  warnings: string[];
  outcome: ProvisionFullFlowOutcome;
}> {
  try {
    const phase1 = await startProvision(raw, actor);
    const finish = await finishProvisionAndPublish(phase1.tenantId, actor);
    return {
      tenantId: phase1.tenantId,
      slug: phase1.slug,
      siteUrl: phase1.siteUrl,
      warnings: [...prefixWarnings, ...phase1.warnings, ...finish.warnings],
      outcome: outcomeOnSuccess,
    };
  } catch (e) {
    if (isDuplicateSlugProvisionError(e) && depth < 4) {
      await new Promise((r) => setTimeout(r, 450));
      return runProvisionTenantFullFlowResolved(raw, actor, depth + 1);
    }
    throw e;
  }
}

async function runProvisionTenantFullFlowResolved(
  raw: unknown,
  actor: string,
  depth: number,
): Promise<{
  tenantId: string;
  slug: string;
  siteUrl: string;
  warnings: string[];
  outcome: ProvisionFullFlowOutcome;
}> {
  if (depth > 5) {
    throw new Error(
      "Provision could not complete after several retries — wait a few seconds and submit again with the same details.",
    );
  }

  const slug = resolveProvisionSlug(raw);
  const domainSuffix = getDomainSuffix();
  const siteUrl = `https://${slug}.${domainSuffix}`;
  const supabase = getServiceSupabase();

  const { data: existing, error: existingErr } = await supabase
    .from("tenant_registry")
    .select("id, status, tenant_kind")
    .eq("slug", slug)
    .maybeSingle();

  if (existingErr) {
    throw new Error(`Could not look up tenant by slug: ${existingErr.message}`);
  }

  if (existing) {
    if (existing.tenant_kind === "template") {
      throw new ProvisionValidationError(
        `Slug "${slug}" is reserved by a demo template. Choose a different slug.`,
      );
    }

    if (existing.status === "provisioning") {
      const finish = await finishProvisionAndPublish(existing.id as string, actor);
      return {
        tenantId: existing.id as string,
        slug,
        siteUrl,
        outcome: "resumed_provisioning",
        warnings: [
          "Resumed provisioning for this slug (e.g. after a gateway timeout or duplicate request). No duplicate tenant was created.",
          ...finish.warnings,
        ],
      };
    }

    if (existing.status === "active") {
      const republishWarnings = await tryRepublishActiveTenant(
        existing.id as string,
        actor,
      );
      return {
        tenantId: existing.id as string,
        slug,
        siteUrl,
        outcome: "already_active",
        warnings: [
          "This subdomain is already provisioned and active. No duplicate was created; we attempted a publish refresh so the live site stays in sync when possible.",
          ...republishWarnings,
        ],
      };
    }

    if (existing.status === "failed" || existing.status === "deactivated") {
      const reclaimWarnings: string[] = [
        `Removed the previous ${existing.status} tenant for this slug so a clean provision can run.`,
      ];
      await reclaimClientTenantForSlugReuse(
        supabase,
        { id: existing.id as string, slug },
        reclaimWarnings,
      );
      return runFreshProvisionAfterConflictResolution(
        raw,
        actor,
        slug,
        siteUrl,
        reclaimWarnings,
        "recreated_after_failure",
        depth,
      );
    }

    throw new ProvisionValidationError(
      `Slug "${slug}" is already in use (status: ${existing.status}). Open the dashboard to resolve that tenant or pick another slug.`,
    );
  }

  return runFreshProvisionAfterConflictResolution(
    raw,
    actor,
    slug,
    siteUrl,
    [],
    "created",
    depth,
  );
}

/**
 * Legacy single-call pipeline — runs both phases sequentially.
 * Will timeout on free Netlify plans; use startProvision + completeProvision instead.
 */
export async function runProvisionPipeline(
  raw: unknown,
  actor: string,
): Promise<ProvisionResult> {
  const out = await provisionTenantFullFlow(raw, actor);
  return {
    tenantId: out.tenantId,
    slug: out.slug,
    siteUrl: out.siteUrl,
    warnings: out.warnings,
    needsCompletion: false,
    outcome: out.outcome,
  };
}
