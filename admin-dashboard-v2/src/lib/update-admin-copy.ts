import {
  buildCoreUpdatePreviewLinks,
  formatCoreUpdatePreviewTenantLabel,
  getCoreUpdatePreviewTenantSlug,
  type CoreUpdatePreviewLinks,
  type PreviewTenantContext,
} from "./core-update-preview";

export type { PreviewTenantContext } from "./core-update-preview";

type CiStatus = "success" | "failure" | "pending" | "unknown";

export type AdminUpdateStatus =
  | "setup_required"
  | "up_to_date"
  | "update_available"
  | "preparing"
  | "blocked_needs_resolution"
  | "ready_to_preview"
  | "ready_to_approve"
  | "checks_failed"
  | "deploying"
  | "unknown_error";

export type ProductionStatus =
  | "Production unchanged"
  | "Deploy pending"
  | "Live update complete";

export type AdminUpdatePhaseStatus = "done" | "current" | "upcoming" | "skipped";

export type AdminUpdatePhase = {
  step: number;
  title: string;
  detail: string;
  status: AdminUpdatePhaseStatus;
};

export type AdminSafeUpdateSummary = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  mergeable: boolean | null;
  mergeableState: string | null;
  ciStatus: CiStatus;
  labels: string[];
  deployPreviewUrl: string | null;
};

export type AdminUpdateCopyInput = {
  ok?: boolean;
  error?: unknown;
  releaseAheadOfForkPackage?: boolean;
  latestReleaseVersion?: string | null;
  deployedPackageVersion?: string | null;
  gitAheadOfDeployed?: boolean;
  activeSafeUpdate?: AdminSafeUpdateSummary | null;
  previewTenant?: PreviewTenantContext | null;
};

export type AdminUpdateCopy = {
  status: AdminUpdateStatus;
  title: string;
  description: string;
  productionStatus: ProductionStatus;
  actionLabel: string;
  nextActionText: string;
  agentPrompt: string | null;
  canPrepare: boolean;
  canApprove: boolean;
  canPreview: boolean;
  canCopyPrompt: boolean;
  prNumber: number | null;
  prUrl: string | null;
  previewUrl: string | null;
  previewBuilderUrl: string | null;
  preview: CoreUpdatePreviewLinks | null;
  phases: AdminUpdatePhase[];
};

function isConflictState(input: AdminSafeUpdateSummary): boolean {
  return (
    input.mergeable === false ||
    input.mergeableState === "dirty" ||
    input.mergeableState === "blocked" ||
    input.labels.some((label) =>
      ["auto-update-conflict", "needs-developer-review"].includes(label),
    )
  );
}

function buildAgentPrompt(input: AdminSafeUpdateSummary, reason: string): string {
  return [
    "MasjidWeb safe core update needs technical resolution.",
    "",
    "Context:",
    "- The platform admin clicked Prepare safe update in the MasjidWeb admin dashboard.",
    "- Production must remain protected. Do not deploy directly.",
    "- Keep changes minimal and avoid Ycode core files unless absolutely necessary.",
    `- Safe update PR: #${input.number}`,
    `- PR URL: ${input.url}`,
    `- Blocker: ${reason}`,
    `- PR title: ${input.title}`,
    `- Draft: ${input.isDraft ? "yes" : "no"}`,
    `- Mergeable: ${input.mergeable === null ? "unknown" : input.mergeable ? "yes" : "no"}`,
    `- Merge state: ${input.mergeableState || "unknown"}`,
    `- Checks: ${input.ciStatus}`,
    input.labels.length > 0 ? `- Labels: ${input.labels.join(", ")}` : "- Labels: none",
    "",
    "Task:",
    `Resolve safe update PR #${input.number} so it can become safe for admin approval. Inspect the PR, fix conflicts or failed checks, keep the update safe, run appropriate tests/build, and report back with what changed and whether the admin can approve it.`,
    "",
    "Safety rules:",
    "- Do not merge or deploy unless the platform admin explicitly asks.",
    "- Do not modify unrelated code.",
    "- If unsure, stop and explain what blocks the update.",
  ].join("\n");
}

function withPr(
  input: AdminSafeUpdateSummary,
  state: Omit<
    AdminUpdateCopy,
    "prNumber" | "prUrl" | "previewUrl" | "previewBuilderUrl" | "preview" | "phases"
  >,
  previewTenant?: PreviewTenantContext | null,
): AdminUpdateCopy {
  const preview = state.canPreview
    ? buildCoreUpdatePreviewLinks(input.deployPreviewUrl, previewTenant)
    : null;
  const previewUrl = preview?.deployPreviewRoot ?? input.deployPreviewUrl;
  const previewBuilderUrl = preview?.builderOnPreview ?? null;
  return {
    ...state,
    prNumber: input.number,
    prUrl: input.url,
    previewUrl,
    previewBuilderUrl,
    preview,
    phases: buildUpdatePhases(state.status, {
      hasActivePr: true,
      needsRepair:
        state.status === "blocked_needs_resolution" || state.status === "checks_failed",
      canPreview: state.canPreview,
      canApprove: state.canApprove,
      isDeploying: false,
    }),
  };
}

export function buildUpdatePhases(
  status: AdminUpdateStatus,
  opts: {
    hasActivePr: boolean;
    needsRepair: boolean;
    canPreview: boolean;
    canApprove: boolean;
    isDeploying: boolean;
  },
): AdminUpdatePhase[] {
  const phase = (step: number, title: string, detail: string): AdminUpdatePhase => ({
    step,
    title,
    detail,
    status: "upcoming",
  });

  const phases: AdminUpdatePhase[] = [
    phase(
      1,
      "Open Maintenance",
      "You are on the right page. Production is unchanged until you approve a merge.",
    ),
    phase(
      2,
      "Prepare safe update",
      'Click "Prepare safe update" to start the merge test. This creates a reviewed pull request; it does not change live sites.',
    ),
    phase(
      3,
      "Fix conflicts (only if needed)",
      "If the merge test finds conflicts or failed checks, copy the AI repair prompt and finish the fix in Cursor. Then refresh status here.",
    ),
    phase(
      4,
      "Preview your chosen tenant on deploy preview",
      "Pick a tenant below, open the PR deploy preview (not {slug}.masjidweb.com — that stays on production). Log in on the preview URL with that tenant's admin email, check /ycode and the public homepage. Same database as live — do not publish test content.",
    ),
    phase(
      5,
      "Approve the merge",
      "When the preview looks good, approve the merge. Production deploys from main after the merge finishes.",
    ),
    phase(
      6,
      "Rollback if something goes wrong",
      'In Recovery below, use "Restore previous live build" to switch back to the last good production build.',
    ),
  ];

  const markDone = (step: number) => {
    const row = phases.find((p) => p.step === step);
    if (row) row.status = "done";
  };
  const markCurrent = (step: number) => {
    const row = phases.find((p) => p.step === step);
    if (row) row.status = "current";
  };
  const markSkipped = (step: number) => {
    const row = phases.find((p) => p.step === step);
    if (row) row.status = "skipped";
  };

  markDone(1);

  if (status === "update_available") {
    markCurrent(2);
    return phases;
  }

  if (status === "setup_required" || status === "unknown_error") {
    markCurrent(2);
    return phases;
  }

  if (status === "deploying") {
    markDone(2);
    markSkipped(3);
    markDone(4);
    markDone(5);
    markCurrent(6);
    return phases;
  }

  if (status === "up_to_date") {
    markDone(2);
    if (!opts.needsRepair) markSkipped(3);
    markSkipped(4);
    markSkipped(5);
    phases[5].status = "upcoming";
    phases[5].detail = "No rollback needed unless a future update causes trouble.";
    return phases;
  }

  if (!opts.hasActivePr) {
    markCurrent(2);
    return phases;
  }

  markDone(2);

  if (opts.needsRepair) {
    markCurrent(3);
    markSkipped(4);
    markSkipped(5);
    phases[5].status = "upcoming";
    return phases;
  }

  markSkipped(3);

  if (opts.canPreview || status === "ready_to_preview" || status === "ready_to_approve") {
    if (status === "ready_to_approve") {
      markDone(4);
      markCurrent(5);
    } else {
      markCurrent(4);
    }
    return phases;
  }

  if (status === "preparing") {
    markCurrent(2);
    phases[2].status = "upcoming";
    return phases;
  }

  markCurrent(4);
  return phases;
}

export function describeAdminUpdateState(input: AdminUpdateCopyInput): AdminUpdateCopy {
  if (input.ok !== true) {
    const setupMissing =
      typeof input.error === "string" &&
      input.error.includes("GITHUB_TOKEN or GITHUB_REPO not configured");

    const status: AdminUpdateStatus = setupMissing ? "setup_required" : "unknown_error";
    return {
      status,
      title: setupMissing ? "Setup needed" : "Update status unavailable",
      description: setupMissing
        ? "The admin dashboard is missing update configuration. Live tenant sites are unchanged."
        : "The admin dashboard could not read update status. Do not approve anything yet. Production is unchanged.",
      productionStatus: "Production unchanged",
      actionLabel: setupMissing ? "Ask AI/operator to finish setup" : "Refresh status",
      nextActionText: setupMissing
        ? "Configure the admin update token and repository settings."
        : "Refresh status or ask AI/operator to inspect the update dashboard.",
      agentPrompt: null,
      canPrepare: false,
      canApprove: false,
      canPreview: false,
      canCopyPrompt: false,
      prNumber: null,
      prUrl: null,
      previewUrl: null,
      previewBuilderUrl: null,
      preview: null,
      phases: buildUpdatePhases(status, {
        hasActivePr: false,
        needsRepair: false,
        canPreview: false,
        canApprove: false,
        isDeploying: false,
      }),
    };
  }

  if (input.gitAheadOfDeployed) {
    const status: AdminUpdateStatus = "deploying";
    return {
      status,
      title: "Update approved; deploy pending",
      description:
        "A newer builder version has been approved in code, and production is catching up. Check the live builder after the deploy finishes.",
      productionStatus: "Deploy pending",
      actionLabel: "Check live builder",
      nextActionText: "Wait for the production deploy to finish, then check the live builder.",
      agentPrompt: null,
      canPrepare: false,
      canApprove: false,
      canPreview: false,
      canCopyPrompt: false,
      prNumber: null,
      prUrl: null,
      previewUrl: null,
      previewBuilderUrl: null,
      preview: null,
      phases: buildUpdatePhases(status, {
        hasActivePr: true,
        needsRepair: false,
        canPreview: false,
        canApprove: false,
        isDeploying: true,
      }),
    };
  }

  const active = input.activeSafeUpdate;
  if (active) {
    const previewTenant = input.previewTenant ?? null;
    const previewLabel = formatCoreUpdatePreviewTenantLabel(
      previewTenant?.slug ?? getCoreUpdatePreviewTenantSlug(),
      previewTenant?.businessName,
    );

    if (isConflictState(active)) {
      return withPr(active, {
        status: "blocked_needs_resolution",
        title: "Merge test found conflicts",
        description:
          "The safe update pull request has merge conflicts in MasjidWeb-customized areas. Production is unchanged. Fix conflicts before preview or approval.",
        productionStatus: "Production unchanged",
        actionLabel: "Copy AI repair prompt",
        nextActionText: `Copy the AI repair prompt, fix PR #${active.number} in Cursor, then refresh status here.`,
        agentPrompt: buildAgentPrompt(active, "Merge conflicts or developer review required"),
        canPrepare: false,
        canApprove: false,
        canPreview: false,
        canCopyPrompt: true,
      }, previewTenant);
    }

    if (active.ciStatus === "failure") {
      return withPr(active, {
        status: "checks_failed",
        title: "Safety checks failed",
        description:
          "The prepared update failed automated checks. Production is unchanged. Do not approve until checks pass.",
        productionStatus: "Production unchanged",
        actionLabel: "Copy AI repair prompt",
        nextActionText: `Copy the AI repair prompt, fix failed checks on PR #${active.number}, then refresh status.`,
        agentPrompt: buildAgentPrompt(active, "Safety checks failed"),
        canPrepare: false,
        canApprove: false,
        canPreview: Boolean(active.deployPreviewUrl),
        canCopyPrompt: true,
      }, previewTenant);
    }

    if (active.ciStatus === "pending" || active.mergeable === null) {
      return withPr(active, {
        status: "preparing",
        title: "Merge test running",
        description:
          "The safe update pull request is being prepared and safety checks are still running. Production is unchanged.",
        productionStatus: "Production unchanged",
        actionLabel: "Refresh status",
        nextActionText: "Wait about a minute, then click Refresh status.",
        agentPrompt: null,
        canPrepare: false,
        canApprove: false,
        canPreview: false,
        canCopyPrompt: false,
      }, previewTenant);
    }

    if (active.ciStatus === "success" && active.mergeable === true && active.isDraft) {
      return withPr(active, {
        status: "ready_to_preview",
        title: "Ready to preview (draft PR)",
        description:
          `Checks passed. Preview ${previewLabel} on the deploy preview (step 4), then approve merge when satisfied. The pull request is still a draft.`,
        productionStatus: "Production unchanged",
        actionLabel: "Approve merge",
        nextActionText: `Preview ${previewLabel} on the deploy preview, then approve merge for PR #${active.number}.`,
        agentPrompt: null,
        canPrepare: false,
        canApprove: true,
        canPreview: true,
        canCopyPrompt: false,
      }, previewTenant);
    }

    if (active.ciStatus === "success" && active.mergeable === true) {
      return withPr(active, {
        status: "ready_to_approve",
        title: "Ready to approve",
        description:
          `Checks passed. Preview ${previewLabel} on the deploy preview if you have not already, then approve the merge. Production stays unchanged until merge.`,
        productionStatus: "Production unchanged",
        actionLabel: "Approve merge",
        nextActionText: `Approve PR #${active.number} only after ${previewLabel} looked correct on the deploy preview.`,
        agentPrompt: null,
        canPrepare: false,
        canApprove: true,
        canPreview: true,
        canCopyPrompt: false,
      }, previewTenant);
    }

    return withPr(active, {
      status: "preparing",
      title: "Preparing update",
      description:
        "The system is still evaluating the safe update pull request. Production is unchanged.",
      productionStatus: "Production unchanged",
      actionLabel: "Refresh status",
      nextActionText: "Refresh status in a minute.",
      agentPrompt: null,
      canPrepare: false,
      canApprove: false,
      canPreview: false,
      canCopyPrompt: false,
    }, previewTenant);
  }

  if (input.releaseAheadOfForkPackage) {
    const latest = input.latestReleaseVersion || "the latest Ycode release";
    const current = input.deployedPackageVersion || "the current live builder version";
    const status: AdminUpdateStatus = "update_available";
    return {
      status,
      title: "Update available",
      description: `${latest} is newer than ${current}. Start the merge test when you are ready. Production will not change until you approve the merge.`,
      productionStatus: "Production unchanged",
      actionLabel: "Prepare safe update",
      nextActionText: "Step 2: prepare the safe update (merge test).",
      agentPrompt: null,
      canPrepare: true,
      canApprove: false,
      canPreview: false,
      canCopyPrompt: false,
      prNumber: null,
      prUrl: null,
      previewUrl: null,
      previewBuilderUrl: null,
      preview: null,
      phases: buildUpdatePhases(status, {
        hasActivePr: false,
        needsRepair: false,
        canPreview: false,
        canApprove: false,
        isDeploying: false,
      }),
    };
  }

  const status: AdminUpdateStatus = "up_to_date";
  return {
    status,
    title: "Up to date",
    description: "No action needed. Production is already on the latest known safe version.",
    productionStatus: "Live update complete",
    actionLabel: "No action needed",
    nextActionText: "No update action is needed right now.",
    agentPrompt: null,
    canPrepare: false,
    canApprove: false,
    canPreview: false,
    canCopyPrompt: false,
    prNumber: null,
    prUrl: null,
    previewUrl: null,
    previewBuilderUrl: null,
    preview: null,
    phases: buildUpdatePhases(status, {
      hasActivePr: false,
      needsRepair: false,
      canPreview: false,
      canApprove: false,
      isDeploying: false,
    }),
  };
}
