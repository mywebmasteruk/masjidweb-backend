import { readServerEnv } from "./server-env";

export type CoreUpdateEmailEvent =
  | "update_started"
  | "update_prepared"
  | "update_ready"
  | "update_failed"
  | "update_approved"
  | "update_deployed"
  | "operator_alert"
  | "tenant_isolation_failed";

export type TenantIsolationFailureDetails = {
  workflowName: string;
  runUrl: string;
  branch: string;
  commitSha: string;
  failureOutput: string;
  summary?: string;
};

export type CoreUpdateEmailPayload = {
  event: CoreUpdateEmailEvent;
  subject: string;
  body: string;
};

function alertRecipient(): string | null {
  const email = readServerEnv("CORE_UPDATE_ALERT_EMAIL")?.trim();
  return email && email.includes("@") ? email : null;
}

function resendApiKey(): string | null {
  const key = readServerEnv("RESEND_API_KEY")?.trim();
  return key || null;
}

/** Plain-text email for core update CTO bot events. No-op when env is not configured. */
export async function sendCoreUpdateEmail(
  payload: CoreUpdateEmailPayload,
): Promise<{ sent: boolean; reason?: string }> {
  const to = alertRecipient();
  const apiKey = resendApiKey();
  if (!to) {
    return { sent: false, reason: "CORE_UPDATE_ALERT_EMAIL not configured" };
  }
  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const from =
    readServerEnv("CORE_UPDATE_EMAIL_FROM")?.trim() || "MasjidWeb Updates <updates@masjidweb.com>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: payload.subject,
      text: payload.body,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { sent: false, reason: `Resend ${res.status}: ${detail.slice(0, 200)}` };
  }

  return { sent: true };
}

export function formatCoreUpdateEmail(
  event: CoreUpdateEmailEvent,
  details: {
    prNumber?: number | null;
    prUrl?: string | null;
    previewUrl?: string | null;
    message?: string;
    adminUrl?: string;
  },
): CoreUpdateEmailPayload {
  const admin = details.adminUrl || "https://admin.masjidweb.com/dashboard/maintenance";
  const lines: string[] = [
    "MasjidWeb core update — automated operator",
    "",
    details.message || "",
    "",
  ];
  if (details.prNumber) lines.push(`Pull request: #${details.prNumber}`);
  if (details.prUrl) lines.push(`PR link: ${details.prUrl}`);
  if (details.previewUrl) lines.push(`Preview: ${details.previewUrl}`);
  lines.push(`Admin dashboard: ${admin}`);
  lines.push("");
  lines.push("You only need to act when the dashboard shows green (ready to approve).");

  const subjects: Record<CoreUpdateEmailEvent, string> = {
    update_started: "Core update started",
    update_prepared: "Core update PR opened",
    update_ready: "Core update ready for your approval",
    update_failed: "Core update needs attention (red)",
    update_approved: "Core update approved — deploying",
    update_deployed: "Core update live",
    operator_alert: "Core update operator alert",
    tenant_isolation_failed: "Daily tenant isolation check FAILED",
  };

  return {
    event,
    subject: `[MasjidWeb] ${subjects[event]}`,
    body: lines.filter(Boolean).join("\n"),
  };
}

const TENANT_ISOLATION_DOC =
  "https://github.com/mywebmasteruk/masjidweb-backend/blob/main/docs/TENANT_ISOLATION_DAILY_CHECK.md";
const TENANCY_DOC =
  "https://github.com/mywebmasteruk/masjidweb-backend/blob/main/docs/TENANCY.md";

function summarizeIsolationFailure(output: string): string {
  const lines = output.split("\n");
  const hits: string[] = [];
  for (const line of lines) {
    if (
      /FAIL\s|AssertionError|Expected|Tests\s+\d+\s+failed|✗|×/.test(line) &&
      hits.length < 6
    ) {
      hits.push(line.trim());
    }
  }
  if (hits.length === 0) {
    return "Vitest tenant isolation suite failed (see test output below).";
  }
  return hits.join(" | ");
}

/** Email for daily tenant isolation workflow failures — includes paste-ready AI prompt. */
export function formatTenantIsolationFailureEmail(
  details: TenantIsolationFailureDetails,
): CoreUpdateEmailPayload {
  const summary = details.summary?.trim() || summarizeIsolationFailure(details.failureOutput);
  const shortSha = details.commitSha.slice(0, 12);

  const aiPrompt = [
    "Fix tenant isolation regression:",
    `${summary}`,
    "",
    `Context: workflow "${details.workflowName}" failed on branch ${details.branch} at commit ${shortSha}.`,
    `Actions run: ${details.runUrl}`,
    "",
    "Reproduce locally:",
    "  cd ycode-mw-tenant && npm ci && bash scripts/check-tenant-isolation.sh",
    "",
    "Read masjidweb-backend/docs/TENANCY.md and docs/TENANT_ISOLATION_DAILY_CHECK.md before changing repository scoping.",
    "Do not remove tenant_id filters to make tests pass.",
  ].join("\n");

  const body = [
    "MasjidWeb daily tenant isolation regression check failed.",
    "",
    `Workflow: ${details.workflowName}`,
    `Run: ${details.runUrl}`,
    `Branch: ${details.branch}`,
    `Commit: ${details.commitSha}`,
    "",
    "--- Test failure output (paste into AI agent) ---",
    details.failureOutput,
    "",
    "--- Suggested AI agent prompt ---",
    aiPrompt,
    "",
    "--- References ---",
    `TENANT_ISOLATION_DAILY_CHECK.md: ${TENANT_ISOLATION_DOC}`,
    `TENANCY.md: ${TENANCY_DOC}`,
    "",
    "Tip: forward this email to a Cursor agent or paste the sections above into a new chat.",
  ].join("\n");

  return {
    event: "tenant_isolation_failed",
    subject: "[MasjidWeb] Daily tenant isolation check FAILED",
    body,
  };
}
