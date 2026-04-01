/**
 * After cloning template + CMS seed, call the YCode app's full publish pipeline
 * (CSS, cache, published_at, collection sync) — same as clicking Publish in the builder.
 *
 * Requires the same PROVISIONING_WEBHOOK_SECRET on both Netlify sites (dashboard + YCode).
 *
 * Uses the YCODE_SITE_INTERNAL_URL (.netlify.app) to avoid SSL delays on
 * newly-created custom subdomains. The tenant is identified by X-Tenant-Slug.
 */
export async function triggerPostProvisionPublish(
  slug: string,
  domainSuffix: string,
  warnings: string[],
): Promise<void> {
  const secret =
    typeof process !== "undefined"
      ? process.env["PROVISIONING_WEBHOOK_SECRET"]
      : undefined;
  if (!secret || String(secret).length < 16) {
    warnings.push(
      "Auto-publish skipped: set PROVISIONING_WEBHOOK_SECRET (16+ chars) on this dashboard and the YCode Netlify site to the same value.",
    );
    return;
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

  try {
    const controller = new AbortController();
    // Publish runs CSS regen + DB writes; cold YCode functions often exceed 5s.
    const publishTimeoutMs = Math.min(
      115_000,
      Number(process.env["PROVISION_PUBLISH_TIMEOUT_MS"] ?? "") || 115_000,
    );
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
      warnings.push(
        `Auto-publish returned ${res.status}: ${text.slice(0, 280)}`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(
      `Auto-publish skipped (${msg}). Run Publish in the builder to make content live.`,
    );
  }
}
