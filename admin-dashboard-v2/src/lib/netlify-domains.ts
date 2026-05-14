/**
 * Netlify domain alias helpers: one production site, many tenant hostnames (subdomains).
 *
 * Domain aliases are managed via PATCH /api/v1/sites/{site_id} using the
 * `domain_aliases` array field on the site object — there is no separate
 * /domain_aliases sub-resource.
 */

const API = "https://api.netlify.com/api/v1";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

interface SiteInfo {
  domain_aliases: string[];
  custom_domain: string | null;
}

export async function listDomainAliases(
  token: string,
  siteId: string,
): Promise<string[]> {
  const res = await fetch(`${API}/sites/${siteId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Netlify getSite failed: ${res.status} ${await res.text()}`);
  }
  const site = (await res.json()) as SiteInfo;
  return site.domain_aliases ?? [];
}

export async function addDomainAlias(
  token: string,
  siteId: string,
  hostname: string,
): Promise<void> {
  const existing = await listDomainAliases(token, siteId);
  const lower = hostname.toLowerCase();

  if (existing.some((a) => a.toLowerCase() === lower)) {
    return; // already exists
  }

  const updated = [...existing, hostname];
  const res = await fetch(`${API}/sites/${siteId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ domain_aliases: updated }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Netlify add domain alias failed: ${res.status} ${text}`);
  }
}

export async function removeDomainAliases(
  token: string,
  siteId: string,
  hostnames: string[],
): Promise<string[]> {
  const existing = await listDomainAliases(token, siteId);
  const removeSet = new Set(hostnames.map((h) => h.toLowerCase()));
  if (removeSet.size === 0) return [];

  const removed = existing.filter((a) => removeSet.has(a.toLowerCase()));
  if (removed.length === 0) return [];

  const filtered = existing.filter((a) => !removeSet.has(a.toLowerCase()));
  const res = await fetch(`${API}/sites/${siteId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ domain_aliases: filtered }),
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Netlify remove domain aliases failed: ${res.status} ${text}`);
  }

  return removed;
}

export async function removeDomainAlias(
  token: string,
  siteId: string,
  hostname: string,
): Promise<void> {
  await removeDomainAliases(token, siteId, [hostname]);
}
