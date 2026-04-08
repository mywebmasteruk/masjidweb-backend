import type { APIRoute } from "astro";
import { isAuthorized } from "../../lib/auth-helpers";
import { isInternalProvisionRequest } from "../../lib/provision-internal-auth";
import { getServiceSupabase } from "../../lib/supabase-server";
import { readServerEnv } from "../../lib/server-env";

const KNOWN_STEPS = [
  "tenant_created",
  "clone_complete",
  "cms_seed_complete",
  "provision_complete",
  "provision_publish_step",
] as const;

type StepName = (typeof KNOWN_STEPS)[number];

/**
 * Lightweight status check for the provision polling loop.
 *
 * Returns:
 * - `steps`: ordered list of provision milestones with completion timestamps
 * - `sslReady`: true once the tenant URL responds over HTTPS (cert issued)
 */
export const GET: APIRoute = async (context) => {
  if (
    !(await isAuthorized(context)) &&
    !isInternalProvisionRequest(context.request)
  ) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tenantId = context.url.searchParams.get("tenantId");
  if (!tenantId) {
    return new Response(
      JSON.stringify({ ok: false, error: "tenantId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = getServiceSupabase();
  const { data: tenant, error } = await supabase
    .from("tenant_registry")
    .select("id, slug, status")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return new Response(
      JSON.stringify({ ok: false, error: error?.message ?? "Not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const { data: auditRows } = await supabase
    .from("provisioning_audit_log")
    .select("action, created_at")
    .eq("tenant_id", tenantId)
    .in("action", [
      ...KNOWN_STEPS,
      "provision_publish_failed",
    ])
    .order("created_at", { ascending: true });

  const completedSet = new Map<string, string>();
  let publishFailed = false;

  for (const row of auditRows ?? []) {
    completedSet.set(row.action, row.created_at);
    if (row.action === "provision_publish_failed") publishFailed = true;
  }

  const steps = KNOWN_STEPS.map((name) => ({
    name,
    completed: completedSet.has(name),
    completedAt: completedSet.get(name) ?? null,
  }));

  const publishCompleted = completedSet.has("provision_publish_step");

  // SSL probe: only run after publish is done so we don't waste time probing early.
  let sslReady = false;
  if (publishCompleted) {
    const domainSuffix = readServerEnv("TENANT_DOMAIN_SUFFIX") || "masjidweb.com";
    const tenantUrl = `https://${tenant.slug}.${domainSuffix}/`;
    sslReady = await probeSsl(tenantUrl);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      tenantId: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
      active: tenant.status === "active",
      publishCompleted,
      publishFailed,
      sslReady,
      steps,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

/**
 * Quick HEAD probe to verify the tenant URL is reachable over HTTPS.
 * Returns true if the server responds (any status), false on TLS/network errors.
 */
async function probeSsl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}
