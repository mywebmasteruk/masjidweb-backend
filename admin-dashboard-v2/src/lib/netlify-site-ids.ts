import { readServerEnv } from "./server-env";

/** Netlify site that serves the YCode Next builder (tenant subdomains). */
export function netlifyBuilderSiteId(): string | undefined {
  const override = readServerEnv("NETLIFY_UPDATES_DEPLOY_SITE_ID");
  const fallback = readServerEnv("NETLIFY_SITE_ID");
  return override || fallback || undefined;
}
