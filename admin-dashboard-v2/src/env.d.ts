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
  /** Branch whose package.json semver is compared to ycode/ycode releases (default `main`). */
  readonly GITHUB_PRODUCTION_BRANCH?: string;
  /** Comma-separated PR base branches for sync PR list; first entry also used as production package ref fallback. */
  readonly GITHUB_SYNC_PR_BASES?: string;
  /** Base domain for tenant subdomains (e.g. masjidweb.com). */
  readonly TENANT_DOMAIN_SUFFIX: string;
  /** @deprecated Optional legacy global builder URL. Builder lives at `https://{slug}.<TENANT_DOMAIN_SUFFIX>/ycode`. */
  readonly MANAGE_SITE_URL?: string;
  /** Template tenant UUID (same env name across both apps). */
  readonly TEMPLATE_TENANT_ID?: string;
  /** Same secret on the YCode Netlify site — enables POST /ycode/api/publish after provision. */
  readonly PROVISIONING_WEBHOOK_SECRET?: string;
  /** Pool *.netlify.app URL for server-side publish (optional alias of YCODE_SITE_INTERNAL_URL). */
  readonly NETLIFY_YCODE_SITE_URL?: string;
  /** e.g. https://masjidweb-multi.netlify.app — publish after provision without relying on new subdomain TLS. */
  readonly YCODE_SITE_INTERNAL_URL?: string;
  /**
   * Optional. When set (16+ chars), allows `POST /api/provision-complete` and
   * `POST /api/provision-publish-tenant` with header `x-provision-internal` for automation without a session cookie.
   */
  readonly PROVISION_INTERNAL_SECRET?: string;
  /** Max wait (ms) for POST /ycode/api/publish during provision; default 115000. */
  readonly PROVISION_PUBLISH_TIMEOUT_MS?: string;
  /** Retries for YCode publish (1–5); default 2 to stay under Netlify function limits. */
  readonly PROVISION_PUBLISH_MAX_ATTEMPTS?: string;
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
