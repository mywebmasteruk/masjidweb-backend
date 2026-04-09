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

  const explicit = import.meta.env.GITHUB_PRODUCTION_BRANCH?.trim();
  if (explicit) return normalizeLegacy(explicit);
  const bases = import.meta.env.GITHUB_SYNC_PR_BASES?.trim();
  if (bases) {
    const first = bases.split(",")[0]?.trim();
    if (first) return normalizeLegacy(first);
  }
  return "main";
}
