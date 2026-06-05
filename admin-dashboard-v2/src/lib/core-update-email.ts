import { readServerEnv } from "./server-env";

export type CoreUpdateEmailEvent =
  | "update_started"
  | "update_prepared"
  | "update_ready"
  | "update_failed"
  | "update_approved"
  | "update_deployed"
  | "operator_alert";

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
  };

  return {
    event,
    subject: `[MasjidWeb] ${subjects[event]}`,
    body: lines.filter(Boolean).join("\n"),
  };
}
