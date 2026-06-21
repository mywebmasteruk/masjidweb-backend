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
