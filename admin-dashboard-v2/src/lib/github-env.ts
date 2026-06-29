import { normalizeBuilderRepo } from "./github-updates";
import { readServerEnv } from "./server-env";

export type GithubUpdatesConfig = {
  token: string;
  workflowToken: string;
  repo: string;
};

/** GitHub token + repo for admin update APIs (runtime Netlify env, not CI build-time). */
export function getGithubUpdatesConfig(): GithubUpdatesConfig | null {
  const token = readServerEnv("GITHUB_TOKEN");
  const repo = readServerEnv("GITHUB_REPO");
  if (!token || !repo) return null;
  const workflowToken = readServerEnv("GITHUB_WORKFLOW_TOKEN") ?? token;
  return { token, workflowToken, repo: normalizeBuilderRepo(repo) };
}

/** Default marketing-site fork served at mw-web.netlify.app. Override with MARKETING_GITHUB_REPO. */
export const MASJIDWEB_MARKETING_REPO = "mywebmasteruk/masjidweb-website";

/** Public-facing URL of the marketing site (shown in the dashboard card). */
export const MASJIDWEB_MARKETING_SITE_URL = "https://mw-web.netlify.app";

/**
 * GitHub token + repo for the marketing-site (mw-web) update button.
 * Reuses the same GITHUB_TOKEN as the builder; only the repo differs. The marketing
 * site is a near-stock Ycode fork, so its update is a plain `merge-upstream` into `main`
 * (no AI-repair pipeline). Not passed through normalizeBuilderRepo — that only rewrites
 * legacy *builder* repo names and would not touch the marketing repo anyway.
 */
export function getMarketingUpdatesConfig(): GithubUpdatesConfig | null {
  const token = readServerEnv("GITHUB_TOKEN");
  if (!token) return null;
  const repo = (readServerEnv("MARKETING_GITHUB_REPO") ?? MASJIDWEB_MARKETING_REPO).trim();
  const workflowToken = readServerEnv("GITHUB_WORKFLOW_TOKEN") ?? token;
  return { token, workflowToken, repo };
}
