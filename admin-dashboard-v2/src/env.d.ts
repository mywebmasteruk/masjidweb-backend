/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly ADMIN_SESSION_SECRET: string;
  readonly DASHBOARD_ADMIN_PASSWORD: string;
  readonly SUPABASE_URL: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly NETLIFY_AUTH_TOKEN: string;
  /** The single multi-tenant Netlify site ID (masjidweb-multi). */
  readonly NETLIFY_SITE_ID: string;
  /**
   * Optional: Netlify site whose deploys appear on Platform Updates (rollback targets this site).
   * Defaults to NETLIFY_SITE_ID. Set to the YCode Next.js site when NETLIFY_SITE_ID is a different Netlify project.
   */
  readonly NETLIFY_UPDATES_DEPLOY_SITE_ID?: string;
  readonly GITHUB_TOKEN?: string;
  readonly GITHUB_REPO?: string;
  readonly GITHUB_SYNC_BRANCH?: string;
  /** Base domain for tenant subdomains (e.g. masjidweb.com). */
  readonly TENANT_DOMAIN_SUFFIX: string;
  /** @deprecated Optional legacy global builder URL. Builder lives at `https://{slug}.<TENANT_DOMAIN_SUFFIX>/ycode`. */
  readonly MANAGE_SITE_URL?: string;
  /** Template tenant UUID (same env name across both apps). */
  readonly TEMPLATE_TENANT_ID?: string;
  /** Same secret on the YCode Netlify site — enables POST /ycode/api/publish after provision. */
  readonly PROVISIONING_WEBHOOK_SECRET?: string;
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
