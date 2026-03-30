function sanitizeSlugForEmailLocal(slug: string): string {
  const s = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.length ? s : "tenant";
}

/**
 * Supabase invite mail must use the tenant apex domain (e.g. *@masjidweb.com) so
 * your SMTP / catch-all receives it. If the form used another domain, use
 * `{slug}@{domainSuffix}` instead.
 */
export function coerceTenantAdminEmailToSuffix(
  normalizedEmail: string,
  slug: string,
  domainSuffix: string,
): { email: string; coerced: boolean } {
  const suffix = domainSuffix.trim().toLowerCase();
  if (!suffix) {
    return { email: normalizedEmail.trim().toLowerCase(), coerced: false };
  }

  const trimmed = normalizedEmail.trim().toLowerCase();
  if (!trimmed) {
    return { email: `${sanitizeSlugForEmailLocal(slug)}@${suffix}`, coerced: false };
  }

  const at = trimmed.lastIndexOf("@");
  if (at <= 0) {
    return { email: `${sanitizeSlugForEmailLocal(slug)}@${suffix}`, coerced: true };
  }

  const domain = trimmed.slice(at + 1);
  if (domain === suffix) {
    return { email: trimmed, coerced: false };
  }

  return {
    email: `${sanitizeSlugForEmailLocal(slug)}@${suffix}`,
    coerced: true,
  };
}

/**
 * If the operator uses a placeholder local part like `xxx@domain` or `xxxx@domain`
 * (only the letter "x"), replace it with a unique local part so each tenant gets
 * its own inbox and Supabase Auth user.
 */
export function resolvePlaceholderProvisioningEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;

  const local = trimmed.slice(0, at).toLowerCase();
  const domain = trimmed.slice(at + 1);

  const isPlaceholder = /^x+$/i.test(local) && local.length >= 3;
  if (!isPlaceholder) return trimmed;

  const randomLocal = `demo-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  return `${randomLocal}@${domain}`;
}
