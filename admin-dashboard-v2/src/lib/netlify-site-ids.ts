/** Netlify site that serves the YCode Next builder (tenant subdomains). */
export function netlifyBuilderSiteId(): string | undefined {
  const override = import.meta.env.NETLIFY_UPDATES_DEPLOY_SITE_ID?.trim();
  const fallback = import.meta.env.NETLIFY_SITE_ID?.trim();
  return override || fallback || undefined;
}
