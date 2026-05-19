export type AdminUpdateCopyInput = {
  ok?: boolean;
  error?: unknown;
  releaseAheadOfForkPackage?: boolean;
  latestReleaseVersion?: string | null;
  deployedPackageVersion?: string | null;
};

export type AdminUpdateCopy = {
  title: string;
  description: string;
  actionLabel: string;
  canPrepare: boolean;
};

export function describeAdminUpdateState(input: AdminUpdateCopyInput): AdminUpdateCopy {
  if (input.ok !== true) {
    const setupMissing =
      typeof input.error === "string" &&
      input.error.includes("GITHUB_TOKEN or GITHUB_REPO not configured");

    return {
      title: setupMissing ? "Setup needed" : "Update status unavailable",
      description: setupMissing
        ? "The admin dashboard is missing update configuration. Live tenant sites are unchanged."
        : "The admin dashboard could not read update status. Live tenant sites are unchanged.",
      actionLabel: "Prepare safe update",
      canPrepare: false,
    };
  }

  if (input.releaseAheadOfForkPackage) {
    const latest = input.latestReleaseVersion || "the latest Ycode release";
    const current = input.deployedPackageVersion || "the current live builder version";
    return {
      title: "Update available",
      description: `${latest} is newer than ${current}. You can prepare a reviewed update from admin. Production will not change immediately.`,
      actionLabel: "Prepare safe update",
      canPrepare: true,
    };
  }

  return {
    title: "Up to date",
    description: "The live builder is already using the latest known Ycode core version.",
    actionLabel: "Prepare safe update",
    canPrepare: false,
  };
}
