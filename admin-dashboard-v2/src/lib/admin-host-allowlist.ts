/**
 * The admin dashboard Netlify site must only answer expected hostnames.
 * If *.tenant-domain incorrectly points here (instead of the YCode pool), visitors
 * otherwise see the admin login and think the builder is broken.
 */

export function isDashboardAllowedHost(
  hostHeader: string | null,
  tenantDomainSuffix: string,
): boolean {
  const host = (hostHeader?.split(":")[0] ?? "").toLowerCase().trim();
  if (!host) return true;

  const suffix = tenantDomainSuffix.toLowerCase().replace(/^\./, "");

  if (host.endsWith(".netlify.app")) return true;
  if (host === "localhost" || host.startsWith("127.0.0.1") || host === "[::1]")
    return true;
  if (host === `admin.${suffix}`) return true;

  return false;
}

export function wrongHostForAdminMessage(tenantDomainSuffix: string): string {
  const suffix = tenantDomainSuffix.toLowerCase().replace(/^\./, "");
  return [
    "This hostname is being served by the MasjidWeb admin dashboard deployment.",
    "",
    "Tenant websites and the YCode builder run on the multi-tenant Netlify site.",
    `Point *.${suffix} (and each tenant subdomain) at that pool — see scripts/cloudflare_masjidweb_dns.sh`,
    "(wildcard CNAME to masjidweb-multi.netlify.app).",
    "",
    `Open the builder at https://<your-tenant-slug>.${suffix}/ycode`,
  ].join("\n");
}
