/** One deploy per distinct package.json version (newest first). Skips routine redeploys of the same core version. */
export function pickCoreVersionUpgradeDeploys<
  T extends { version: string | null | undefined },
>(rows: T[]): T[] {
  const milestones: T[] = [];
  let lastVersion: string | null = null;

  for (const row of rows) {
    const version = row.version?.trim() || null;
    if (!version) continue;
    if (milestones.length === 0 || version !== lastVersion) {
      milestones.push(row);
      lastVersion = version;
    }
  }

  return milestones;
}
