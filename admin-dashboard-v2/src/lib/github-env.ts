import { normalizeBuilderRepo } from "./github-updates";
import { readServerEnv } from "./server-env";

export type GithubUpdatesConfig = {
  token: string;
  repo: string;
};

/** GitHub token + repo for admin update APIs (runtime Netlify env, not CI build-time). */
export function getGithubUpdatesConfig(): GithubUpdatesConfig | null {
  const token = readServerEnv("GITHUB_TOKEN");
  const repo = readServerEnv("GITHUB_REPO");
  if (!token || !repo) return null;
  return { token, repo: normalizeBuilderRepo(repo) };
}
