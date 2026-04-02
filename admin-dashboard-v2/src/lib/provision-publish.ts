/**
 * After cloning template + CMS seed, call the YCode app's full publish pipeline
 * (CSS, cache, published_at, collection sync) — same as clicking Publish in the builder.
 *
 * Requires the same PROVISIONING_WEBHOOK_SECRET on both Netlify sites (dashboard + YCode).
 *
 * Uses the YCODE_SITE_INTERNAL_URL (.netlify.app) to avoid SSL delays on
 * newly-created custom subdomains. The tenant is identified by X-Tenant-Slug.
 */

export class ProvisionPublishConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionPublishConfigError";
  }
}

export type TriggerPostProvisionPublishResult =
  | { ok: true }
  | { ok: false; configError: true }
  | { ok: false; configError: false; message: string };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function attemptPostProvisionPublishOnce(
  url: string,
  body: string,
  headers: Record<string, string>,
  publishTimeoutMs: number,
): Promise<TriggerPostProvisionPublishResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), publishTimeoutMs);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      const snippet = text.slice(0, 280);
      return {
        ok: false,
        configError: false,
        message: `YCode publish HTTP ${res.status}: ${snippet}`,
      };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, configError: false, message: msg };
  }
}

export async function triggerPostProvisionPublish(
  slug: string,
  domainSuffix: string,
  warnings: string[],
): Promise<TriggerPostProvisionPublishResult> {
  const secret =
    typeof process !== "undefined"
      ? process.env["PROVISIONING_WEBHOOK_SECRET"]
      : undefined;
  if (!secret || String(secret).length < 16) {
    warnings.push(
      "Auto-publish skipped: set PROVISIONING_WEBHOOK_SECRET (16+ chars) on this dashboard and the YCode Netlify site to the same value.",
    );
    return { ok: false, configError: true };
  }

  const internalUrl =
    typeof process !== "undefined"
      ? process.env["YCODE_SITE_INTERNAL_URL"]
      : undefined;

  const baseUrl = internalUrl || `https://${slug}.${domainSuffix}`;
  const url = `${baseUrl}/ycode/api/publish`;
  const body = JSON.stringify({ publishAll: true });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Provisioning-Secret": secret,
    "X-Tenant-Slug": slug,
  };

  if (internalUrl) {
    headers["Host"] = `${slug}.${domainSuffix}`;
  }

  const publishTimeoutMs = Math.min(
    115_000,
    Number(process.env["PROVISION_PUBLISH_TIMEOUT_MS"] ?? "") || 115_000,
  );

  const rawMax = Number(process.env["PROVISION_PUBLISH_MAX_ATTEMPTS"] ?? "");
  const maxAttempts =
    Number.isFinite(rawMax) && rawMax >= 1 && rawMax <= 5
      ? Math.floor(rawMax)
      : 2;

  let last: TriggerPostProvisionPublishResult = {
    ok: false,
    configError: false,
    message: "No publish attempts ran",
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await attemptPostProvisionPublishOnce(
      url,
      body,
      headers,
      publishTimeoutMs,
    );
    if (last.ok) {
      return { ok: true };
    }
    if (attempt < maxAttempts) {
      await sleep(1500 * attempt);
    }
  }

  const lastMsg =
    last.ok === false && !last.configError ? last.message : "unknown";
  warnings.push(
    `Auto-publish failed after ${maxAttempts} attempts. Last error: ${lastMsg}. Run Publish in the builder to make content live.`,
  );
  return {
    ok: false,
    configError: false,
    message: lastMsg,
  };
}
