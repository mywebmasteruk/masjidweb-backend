type CiStatus = "success" | "failure" | "pending" | "unknown";

export type AdminUpdateStatus =
  | "setup_required"
  | "up_to_date"
  | "update_available"
  | "preparing"
  | "blocked_needs_resolution"
  | "ready_to_approve"
  | "checks_failed"
  | "deploying"
  | "unknown_error";

export type ProductionStatus =
  | "Production unchanged"
  | "Deploy pending"
  | "Live update complete";

export type AdminSafeUpdateSummary = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  mergeable: boolean | null;
  mergeableState: string | null;
  ciStatus: CiStatus;
  labels: string[];
};

export type AdminUpdateCopyInput = {
  ok?: boolean;
  error?: unknown;
  releaseAheadOfForkPackage?: boolean;
  latestReleaseVersion?: string | null;
  deployedPackageVersion?: string | null;
  gitAheadOfDeployed?: boolean;
  activeSafeUpdate?: AdminSafeUpdateSummary | null;
};

export type AdminUpdateCopy = {
  status: AdminUpdateStatus;
  title: string;
  description: string;
  productionStatus: ProductionStatus;
  actionLabel: string;
  nextActionText: string;
  canPrepare: boolean;
  canApprove: boolean;
  prNumber: number | null;
  prUrl: string | null;
};

function isConflictState(input: AdminSafeUpdateSummary): boolean {
  return (
    input.mergeable === false ||
    input.mergeableState === "dirty" ||
    input.mergeableState === "blocked" ||
    input.labels.some((label) =>
      ["auto-update-conflict", "needs-developer-review", "tenant-sensitive-update"].includes(
        label,
      ),
    )
  );
}

function withPr(
  input: AdminSafeUpdateSummary,
  state: Omit<AdminUpdateCopy, "prNumber" | "prUrl">,
): AdminUpdateCopy {
  return {
    ...state,
    prNumber: input.number,
    prUrl: input.url,
  };
}

export function describeAdminUpdateState(input: AdminUpdateCopyInput): AdminUpdateCopy {
  if (input.ok !== true) {
    const setupMissing =
      typeof input.error === "string" &&
      input.error.includes("GITHUB_TOKEN or GITHUB_REPO not configured");

    return {
      status: setupMissing ? "setup_required" : "unknown_error",
      title: setupMissing ? "Setup needed" : "Update status unavailable",
      description: setupMissing
        ? "The admin dashboard is missing update configuration. Live tenant sites are unchanged."
        : "The admin dashboard could not read update status. Do not approve anything yet. Production is unchanged.",
      productionStatus: "Production unchanged",
      actionLabel: setupMissing ? "Ask AI/operator to finish setup" : "Refresh status",
      nextActionText: setupMissing
        ? "Configure the admin update token and repository settings."
        : "Refresh status or ask AI/operator to inspect the update dashboard.",
      canPrepare: false,
      canApprove: false,
      prNumber: null,
      prUrl: null,
    };
  }

  if (input.gitAheadOfDeployed) {
    return {
      status: "deploying",
      title: "Update approved; deploy pending",
      description:
        "A newer builder version has been approved in code, and production is catching up. Check the live builder after the deploy finishes.",
      productionStatus: "Deploy pending",
      actionLabel: "Check live builder",
      nextActionText: "Wait for the production deploy to finish, then check the live builder.",
      canPrepare: false,
      canApprove: false,
      prNumber: null,
      prUrl: null,
    };
  }

  const active = input.activeSafeUpdate;
  if (active) {
    if (active.isDraft || isConflictState(active)) {
      return withPr(active, {
        status: "blocked_needs_resolution",
        title: "Update prepared, but not ready",
        description:
          "The update found conflicts in MasjidWeb-customized areas. Production is safe and unchanged. Do not approve this update yet.",
        productionStatus: "Production unchanged",
        actionLabel: "Copy request for AI/operator",
        nextActionText: `Resolve safe update PR #${active.number}`,
        canPrepare: false,
        canApprove: false,
      });
    }

    if (active.ciStatus === "failure") {
      return withPr(active, {
        status: "checks_failed",
        title: "Update checks failed",
        description:
          "The prepared update has checks failed. Production is safe and unchanged. Do not approve this update yet.",
        productionStatus: "Production unchanged",
        actionLabel: "Open technical report",
        nextActionText: `Ask AI/operator to fix failed checks on safe update PR #${active.number}`,
        canPrepare: false,
        canApprove: false,
      });
    }

    if (active.ciStatus === "success" && active.mergeable === true) {
      return withPr(active, {
        status: "ready_to_approve",
        title: "Ready for admin approval",
        description:
          "The update has no known blockers and checks passed. Production is still unchanged until you approve the update.",
        productionStatus: "Production unchanged",
        actionLabel: "Open PR to approve update",
        nextActionText: `Open safe update PR #${active.number} and approve it only if the summary looks correct.`,
        canPrepare: false,
        canApprove: true,
      });
    }

    return withPr(active, {
      status: "preparing",
      title: "Preparing update",
      description:
        "The system is preparing a reviewed update and safety checks are still running. Production is unchanged.",
      productionStatus: "Production unchanged",
      actionLabel: "Refresh status",
      nextActionText: "Wait a minute, then refresh status.",
      canPrepare: false,
      canApprove: false,
    });
  }

  if (input.releaseAheadOfForkPackage) {
    const latest = input.latestReleaseVersion || "the latest Ycode release";
    const current = input.deployedPackageVersion || "the current live builder version";
    return {
      status: "update_available",
      title: "Update available",
      description: `${latest} is newer than ${current}. A new Ycode core version is available. Preparing it will not change production.`,
      productionStatus: "Production unchanged",
      actionLabel: "Prepare safe update",
      nextActionText: "Prepare a reviewed update. Production will not change immediately.",
      canPrepare: true,
      canApprove: false,
      prNumber: null,
      prUrl: null,
    };
  }

  return {
    status: "up_to_date",
    title: "Up to date",
    description: "No action needed. Production is already on the latest known safe version.",
    productionStatus: "Live update complete",
    actionLabel: "No action needed",
    nextActionText: "No update action is needed right now.",
    canPrepare: false,
    canApprove: false,
    prNumber: null,
    prUrl: null,
  };
}
