import {
  buildCoreUpdatePreviewLinks,
  formatCoreUpdatePreviewTenantLabel,
  getCoreUpdatePreviewTenantSlug,
  type CoreUpdatePreviewLinks,
  type PreviewTenantContext,
} from "./core-update-preview";
import { compareVersions } from "./github-updates";

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
  forkPackageVersion?: string | null;
  deployedPackageVersion?: string | null;
  gitAheadOfDeployed?: boolean;
  activeSafeUpdate?: AdminSafeUpdateSummary | null;
  previewTenant?: PreviewTenantContext | null;
};

export type CoreUpdateTrafficLight = "green" | "amber" | "red";

export type AdminUpdateCopy = {
  status: AdminUpdateStatus;
  trafficLight: CoreUpdateTrafficLight;
  trafficLightLabel: string;
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

function trafficLightForStatus(status: AdminUpdateStatus): {
  trafficLight: CoreUpdateTrafficLight;
  trafficLightLabel: string;
} {
  if (status === "ready_to_approve" || status === "ready_to_preview") {
    return { trafficLight: "green", trafficLightLabel: "Ready for you" };
  }
  if (
    status === "preparing" ||
    status === "update_available" ||
    status === "deploying"
  ) {
    return { trafficLight: "amber", trafficLightLabel: "In progress" };
  }
  if (
    status === "blocked_needs_resolution" ||
    status === "checks_failed" ||
    status === "setup_required" ||
    status === "unknown_error"
  ) {
    return { trafficLight: "red", trafficLightLabel: "Do not approve" };
  }
  return { trafficLight: "amber", trafficLightLabel: "No action needed" };
}

function withTrafficLight(
  state: Omit<AdminUpdateCopy, "trafficLight" | "trafficLightLabel">,
): AdminUpdateCopy {
  const { trafficLight, trafficLightLabel } = trafficLightForStatus(state.status);
  return { ...state, trafficLight, trafficLightLabel };
}

/** Approve only when GitHub checks passed and a deploy preview URL exists. */
function canSafelyApprove(active: AdminSafeUpdateSummary): boolean {
  return (
    active.ciStatus === "success" &&
    active.mergeable === true &&
    Boolean(active.deployPreviewUrl)
  );
}

/** Upstream patch (same major.minor) while git main already matches live — not a new core update cycle. */
function isOptionalUpstreamPatchAhead(input: AdminUpdateCopyInput): boolean {
  const latest = input.latestReleaseVersion;
  const fork = input.forkPackageVersion;
  const deployed = input.deployedPackageVersion;
  if (!latest || !fork || !deployed) return false;
  if (compareVersions(latest, fork) <= 0) return false;
  if (compareVersions(fork, deployed) !== 0) return false;

  const parse = (v: string) => v.split(".").map((part) => Number(part) || 0);
  const [lMajor, lMinor] = parse(latest);
  const [fMajor, fMinor] = parse(fork);
  return lMajor === fMajor && lMinor === fMinor;
}

function isConflictState(input: AdminSafeUpdateSummary): boolean {
  return (
    input.mergeable === false ||
    input.mergeableState === "dirty" ||
    input.mergeableState === "blocked" ||
    input.labels.includes("auto-update-conflict")
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
  return withTrafficLight({
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
  });
}

export const CORE_UPDATE_FLOW_STEPS = 4;

export function getCurrentUpdatePhase(
  phases: AdminUpdatePhase[] | null | undefined,
): AdminUpdatePhase | null {
  if (!phases?.length) return null;
  return phases.find((phase) => phase.status === "current") ?? null;
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
      "Prepare safe update",
      'Click Prepare safe update to run the merge test. This opens a pull request only — live tenant sites stay unchanged.',
    ),
    phase(
      2,
      "Automated fix if needed",
      "The CTO bot runs mechanical repair on GitHub. If status stays red, wait for email or refresh — do not approve.",
    ),
    phase(
      3,
      "Preview on deploy preview",
      "Choose a tenant and open the Netlify deploy preview homepage (not the live subdomain). Check the public site, then sign in to the builder if needed.",
    ),
    phase(
      4,
      "Approve the merge",
      "When the preview looks right, approve the merge. Production updates after the deploy finishes.",
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

  if (status === "update_available" || status === "setup_required" || status === "unknown_error") {
    markCurrent(1);
    return phases;
  }

  if (status === "deploying" || status === "up_to_date") {
    markDone(1);
    markSkipped(2);
    markSkipped(3);
    markSkipped(4);
    return phases;
  }

  if (!opts.hasActivePr) {
    markCurrent(1);
    return phases;
  }

  markDone(1);

  if (opts.needsRepair) {
    markCurrent(2);
    markSkipped(3);
    markSkipped(4);
    return phases;
  }

  markSkipped(2);

  if (status === "preparing") {
    markCurrent(1);
    return phases;
  }

  if (status === "ready_to_approve") {
    markDone(3);
    markCurrent(4);
    return phases;
  }

  if (opts.canPreview || status === "ready_to_preview") {
    markCurrent(3);
    return phases;
  }

  markCurrent(3);
  return phases;
}

export function describeAdminUpdateState(input: AdminUpdateCopyInput): AdminUpdateCopy {
  if (input.ok !== true) {
    const setupMissing =
      typeof input.error === "string" &&
      input.error.includes("GITHUB_TOKEN or GITHUB_REPO not configured");

    const status: AdminUpdateStatus = setupMissing ? "setup_required" : "unknown_error";
    return withTrafficLight({
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
    });
  }

  if (input.gitAheadOfDeployed) {
    const status: AdminUpdateStatus = "deploying";
    return withTrafficLight({
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
    });
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
        actionLabel: "Run automated fix",
        nextActionText: `The CTO bot can retry mechanical repair for PR #${active.number}, or wait for the next daily run. Do not approve while red.`,
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
        actionLabel: "Run automated fix",
        nextActionText: `Checks failed for PR #${active.number}. The CTO bot will email you. Retry automated fix or wait — do not approve while red.`,
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
        nextActionText: "Running the merge test on GitHub. This page updates automatically.",
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
        canApprove: canSafelyApprove(active),
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
        canApprove: canSafelyApprove(active),
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

  if (input.releaseAheadOfForkPackage && isOptionalUpstreamPatchAhead(input)) {
    const status: AdminUpdateStatus = "up_to_date";
    return withTrafficLight({
      status,
      title: "Up to date",
      description:
        "Production matches git main. A newer upstream patch exists but no core update workflow is required until you choose to prepare one.",
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
      phases: [],
    });
  }

  if (input.releaseAheadOfForkPackage) {
    const latest = input.latestReleaseVersion || "the latest Ycode release";
    const current =
      input.forkPackageVersion ||
      input.deployedPackageVersion ||
      "the current fork version";
    const status: AdminUpdateStatus = "update_available";
    return withTrafficLight({
      status,
      title: "Update available",
      description: `${latest} is newer than ${current}. Start the merge test when you are ready. Production will not change until you approve the merge.`,
      productionStatus: "Production unchanged",
      actionLabel: "Prepare safe update",
      nextActionText:
        "Click Prepare safe update below to run the merge test. This opens a pull request only — live tenant sites stay unchanged until you approve.",
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
    });
  }

  const status: AdminUpdateStatus = "up_to_date";
  return withTrafficLight({
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
    phases: [],
  });
}
