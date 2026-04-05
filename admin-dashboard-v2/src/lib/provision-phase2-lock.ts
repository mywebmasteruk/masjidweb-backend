import { getServiceSupabase } from "./supabase-server";

export const PHASE2_LEADER_CLAIM_ACTION = "phase2_leader_claim";

/** Claims older than this are deleted so a stuck serverless invocation cannot block forever. */
const STALE_CLAIM_MS = 15 * 60 * 1000;

const FOLLOWER_POLL_MS = 2000;
const FOLLOWER_MAX_WAIT_MS = 4 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type Sb = ReturnType<typeof getServiceSupabase>;

function isUniqueViolation(err: { code?: string; message?: string }): boolean {
  return (
    err.code === "23505" ||
    Boolean(err.message && /duplicate key|unique constraint/i.test(err.message))
  );
}

async function deleteStaleLeaderClaim(sb: Sb, tenantId: string): Promise<void> {
  const { data, error } = await sb
    .from("provisioning_audit_log")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .eq("action", PHASE2_LEADER_CLAIM_ACTION)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data?.length) return;

  const row = data[0] as { id: string; created_at: string };
  const age = Date.now() - new Date(row.created_at).getTime();
  if (age > STALE_CLAIM_MS) {
    await sb.from("provisioning_audit_log").delete().eq("id", row.id);
  }
}

/**
 * Try to become the single leader for phase 2 (clone + seed + invite).
 * If another request holds the claim, wait until the tenant leaves `provisioning`
 * or until timeout.
 */
export async function acquirePhase2LeaderOrWait(
  sb: Sb,
  tenantId: string,
  actor: string,
): Promise<
  | { role: "leader" }
  | { role: "follower"; warnings: string[] }
  | { role: "follower_timeout"; warnings: string[] }
> {
  await deleteStaleLeaderClaim(sb, tenantId);

  const { error: insertErr } = await sb.from("provisioning_audit_log").insert({
    tenant_id: tenantId,
    action: PHASE2_LEADER_CLAIM_ACTION,
    actor,
    details: { at: new Date().toISOString() },
  });

  if (!insertErr) {
    return { role: "leader" };
  }

  if (!isUniqueViolation(insertErr)) {
    throw new Error(
      `Could not acquire phase-2 lock: ${insertErr.message ?? String(insertErr)}`,
    );
  }

  const deadline = Date.now() + FOLLOWER_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(FOLLOWER_POLL_MS);

    const { data: t, error: te } = await sb
      .from("tenant_registry")
      .select("status")
      .eq("id", tenantId)
      .maybeSingle();

    if (te) {
      throw new Error(`Tenant status poll failed: ${te.message}`);
    }

    const st = String(t?.status ?? "");
    if (st === "active") {
      return {
        role: "follower",
        warnings: [
          "Another request finished provisioning this tenant while this one was waiting (e.g. duplicate tab or retried request). No duplicate clone was added.",
        ],
      };
    }
    if (st === "failed") {
      return {
        role: "follower",
        warnings: [
          "Provisioning was marked failed while this request waited. Refresh the dashboard; use Continue setup to retry if the tenant is still in provisioning.",
        ],
      };
    }
  }

  return {
    role: "follower_timeout",
    warnings: [
      "Waited for parallel provisioning to finish but the tenant is still provisioning. Refresh and use Continue setup, or wait and try again.",
    ],
  };
}

export async function releasePhase2LeaderClaim(sb: Sb, tenantId: string): Promise<void> {
  await sb
    .from("provisioning_audit_log")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("action", PHASE2_LEADER_CLAIM_ACTION);
}
