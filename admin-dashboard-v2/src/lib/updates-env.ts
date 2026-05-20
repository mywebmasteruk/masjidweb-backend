import { readServerEnv } from "./server-env";

/** Netlify / Git production line for the YCode fork (tenant builder). */
export function githubProductionBranch(): string {
  /** Map removed / legacy branch names so stale Netlify env still resolves to `main`. */
  const normalizeLegacy = (branch: string): string => {
    const b = branch.trim();
    if (
      b === "tenant-multi" ||
      b === "multitanant" ||
      b === "mw-admin-dash"
    ) {
      return "main";
    }
    return b;
  };

  const explicit = readServerEnv("GITHUB_PRODUCTION_BRANCH");
  if (explicit) return normalizeLegacy(explicit);
  const bases = readServerEnv("GITHUB_SYNC_PR_BASES");
  if (bases) {
    const first = bases.split(",")[0]?.trim();
    if (first) return normalizeLegacy(first);
  }
  return "main";
}
