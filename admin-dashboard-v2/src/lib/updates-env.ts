/** Netlify / Git production line for the YCode fork (tenant builder). */
export function githubProductionBranch(): string {
  const explicit = import.meta.env.GITHUB_PRODUCTION_BRANCH?.trim();
  if (explicit) return explicit;
  const bases = import.meta.env.GITHUB_SYNC_PR_BASES?.trim();
  if (bases) {
    const first = bases.split(",")[0]?.trim();
    if (first) return first;
  }
  return "tenant-multi";
}
