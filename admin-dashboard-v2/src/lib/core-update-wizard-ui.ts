export type AdminUpdatePhaseStatus = "done" | "current" | "upcoming" | "skipped";

export type AdminUpdatePhase = {
  step: number;
  title: string;
  detail: string;
  status: AdminUpdatePhaseStatus;
};

export function getCurrentUpdatePhase(
  phases: AdminUpdatePhase[] | null | undefined,
): AdminUpdatePhase | null {
  if (!phases?.length) return null;
  return phases.find((phase) => phase.status === "current") ?? null;
}

export const CORE_UPDATE_STEP_COUNT = 4;
export const CORE_UPDATE_STEPPER_LABELS = ["Prepare", "Fix", "Preview", "Approve"] as const;

export type ViewedStepStorage = {
  getViewedStep(): number | null;
  setViewedStep(step: number): void;
  getLastWorkflowStep(): number | null;
  setLastWorkflowStep(step: number): void;
};

export function getPhaseByStep(
  phases: AdminUpdatePhase[] | null | undefined,
  step: number,
): AdminUpdatePhase | null {
  if (!Array.isArray(phases)) return null;
  return phases.find((phase) => phase.step === step) ?? null;
}

export function getWorkflowStep(phases: AdminUpdatePhase[] | null | undefined): number {
  const current = getCurrentUpdatePhase(phases);
  return current?.step ?? 1;
}

export function resolveViewedStep(
  phases: AdminUpdatePhase[] | null | undefined,
  storage: ViewedStepStorage,
): number {
  const workflowStep = getWorkflowStep(phases);
  const lastWorkflow = storage.getLastWorkflowStep();
  storage.setLastWorkflowStep(workflowStep);

  if (lastWorkflow != null && workflowStep > lastWorkflow) {
    storage.setViewedStep(workflowStep);
    return workflowStep;
  }

  const stored = storage.getViewedStep();
  const viewed = stored ?? workflowStep;
  if (viewed > workflowStep) return workflowStep;
  return viewed;
}

export function stepperStepClass(
  phase: AdminUpdatePhase,
  step: number,
  viewedStep: number,
  workflowStep: number,
): string {
  const classes = ["mw-stepper-step"];
  if (step === viewedStep) classes.push("is-viewing");

  if (phase.status === "skipped") {
    classes.push("is-skipped");
    return classes.join(" ");
  }

  const doneOrPast = phase.status === "done" || step < workflowStep;
  if (doneOrPast) {
    if (step !== viewedStep) classes.push("is-complete");
    return classes.join(" ");
  }

  if (step === workflowStep) {
    if (step === viewedStep) classes.push("is-progress");
    else classes.push("is-workflow-current");
  }

  return classes.join(" ");
}

export function stepperNodeContent(
  phase: AdminUpdatePhase,
  step: number,
  workflowStep: number,
): string {
  if (phase.status === "done" || step < workflowStep) return "\u2713";
  if (phase.status === "skipped") return "\u2014";
  return String(step);
}

export function isReadingAhead(viewedStep: number, workflowStep: number): boolean {
  return viewedStep > workflowStep;
}

export function shouldShowAheadNotice(viewedStep: number, workflowStep: number): boolean {
  return isReadingAhead(viewedStep, workflowStep);
}

/** Minimal admin flags used to gate wizard "Next" on the live workflow step. */
export type WizardStepActionGate = {
  canPrepare?: boolean;
  canApprove?: boolean;
  canCopyPrompt?: boolean;
};

/** True when the admin must complete the current step before browsing forward. */
export function requiresStepActionBeforeNext(
  viewedStep: number,
  workflowStep: number,
  gate: WizardStepActionGate | null | undefined,
): boolean {
  if (!gate || viewedStep !== workflowStep) return false;
  if (viewedStep === 1 && gate.canPrepare) return true;
  if (viewedStep === 2 && gate.canCopyPrompt) return true;
  if (viewedStep === 4 && gate.canApprove) return true;
  return false;
}

export type WizardNextNav = {
  disabled: boolean;
  label: string;
  hint: string | null;
  /** Hide the Next control when the live step action is still required. */
  hideNext?: boolean;
};

export function getWizardNextNav(
  viewedStep: number,
  workflowStep: number,
  gate: WizardStepActionGate | null | undefined,
  stepCount: number = CORE_UPDATE_STEP_COUNT,
): WizardNextNav {
  if (viewedStep >= stepCount) {
    return { disabled: true, label: "Next step", hint: null, hideNext: true };
  }

  if (requiresStepActionBeforeNext(viewedStep, workflowStep, gate)) {
    return {
      disabled: true,
      label: "Next step",
      hint: "Finish the step above to unlock the next step.",
      hideNext: true,
    };
  }

  if (viewedStep < workflowStep) {
    return { disabled: false, label: "Review next step", hint: null };
  }

  return {
    disabled: true,
    label: "Next step",
    hint: "Future steps stay collapsed until this update reaches them.",
    hideNext: true,
  };
}

/** Poll /api/updates/status while GitHub workflow or production deploy is in flight. */
export function shouldAutoPollCoreUpdateStatus(
  status: string | undefined,
  opts?: { prepareInFlight?: boolean; aiRepairInFlight?: boolean },
): boolean {
  if (opts?.prepareInFlight || opts?.aiRepairInFlight) return true;
  return status === "preparing" || status === "deploying";
}

export type CoreUpdateNowActionKind =
  | "idle"
  | "prepare"
  | "preparing"
  | "repair"
  | "preview"
  | "approve"
  | "deploy_wait"
  | "refresh";

export type CoreUpdateNowActionInput = WizardStepActionGate & {
  status?: string;
  title?: string;
  description?: string;
  nextActionText?: string;
  actionLabel?: string;
  canPreview?: boolean;
  prNumber?: number | null;
};

export type CoreUpdateNowAction = {
  kind: CoreUpdateNowActionKind;
  headline: string;
  detail: string;
  primaryLabel: string | null;
  primaryDisabled: boolean;
  showSpinner: boolean;
  reassurance: string | null;
};

/** Single primary action for the core-update wizard — one clear next step for admins. */
export function buildCoreUpdateNowAction(
  adminState: CoreUpdateNowActionInput | null | undefined,
  opts?: { prepareInFlight?: boolean; aiRepairInFlight?: boolean; aiRepairDetail?: string | null },
): CoreUpdateNowAction {
  if (!adminState) {
    return {
      kind: "idle",
      headline: "",
      detail: "",
      primaryLabel: null,
      primaryDisabled: true,
      showSpinner: false,
      reassurance: null,
    };
  }

  if (opts?.prepareInFlight || adminState.status === "preparing") {
    return {
      kind: "preparing",
      headline: "Merge test running",
      detail:
        adminState.nextActionText ||
        "GitHub is running the merge test and safety checks. This page updates automatically.",
      primaryLabel: null,
      primaryDisabled: true,
      showSpinner: true,
      reassurance:
        "You already started prepare. Do not click Prepare again — wait for this page to advance.",
    };
  }

  if (opts?.aiRepairInFlight) {
    return {
      kind: "repair",
      headline: "Premium AI update running",
      detail:
        opts.aiRepairDetail ||
        "Premium AI is repairing the PR branch and running tenant safety checks. This page updates automatically.",
      primaryLabel: null,
      primaryDisabled: true,
      showSpinner: true,
      reassurance:
        "Do not approve the merge yet. When repair finishes and checks pass, this step will unlock preview.",
    };
  }

  if (adminState.status === "deploying") {
    return {
      kind: "deploy_wait",
      headline: adminState.title || "Production deploy in progress",
      detail:
        adminState.nextActionText ||
        "The approved update is deploying. Refresh status until the live builder catches up.",
      primaryLabel: "Refresh status",
      primaryDisabled: false,
      showSpinner: true,
      reassurance: "No further approval is needed right now.",
    };
  }

  if (adminState.canPrepare) {
    return {
      kind: "prepare",
      headline: "Start the safe update",
      detail:
        adminState.nextActionText ||
        "Click Prepare once to run the merge test. Production stays unchanged until you approve the merge.",
      primaryLabel: "Prepare safe update",
      primaryDisabled: false,
      showSpinner: false,
      reassurance: "You only need to click Prepare once. The page will move forward automatically.",
    };
  }

  if (adminState.canCopyPrompt) {
    return {
      kind: "repair",
      headline: adminState.title || "Fix required before preview",
      detail:
        adminState.nextActionText ||
        "Premium AI will repair the PR, run tenant safety checks, and leave approval locked until green.",
      primaryLabel: adminState.actionLabel || "Run Premium AI Update",
      primaryDisabled: false,
      showSpinner: false,
      reassurance: "Production approval stays locked. Do not approve until Premium AI repairs, tenant checks, build, and normal PR CI are green.",
    };
  }

  if (adminState.canApprove) {
    const prLabel =
      typeof adminState.prNumber === "number" ? `PR #${adminState.prNumber}` : "the safe update PR";
    return {
      kind: "approve",
      headline: adminState.title || "Ready to approve",
      detail:
        adminState.nextActionText ||
        `Preview on the deploy preview if needed, then approve ${prLabel}.`,
      primaryLabel: adminState.actionLabel || "Approve merge",
      primaryDisabled: false,
      showSpinner: false,
      reassurance: "Approving merges to main and triggers the production deploy.",
    };
  }

  if (adminState.canPreview) {
    return {
      kind: "preview",
      headline: adminState.title || "Preview before approving",
      detail:
        adminState.nextActionText ||
        "Open the deploy preview and check the tenant site, then continue to approve.",
      primaryLabel: "Refresh status",
      primaryDisabled: false,
      showSpinner: false,
      reassurance: null,
    };
  }

  if (adminState.status === "up_to_date") {
    return {
      kind: "idle",
      headline: adminState.title || "Up to date",
      detail: adminState.description || "No update action is needed.",
      primaryLabel: null,
      primaryDisabled: true,
      showSpinner: false,
      reassurance: null,
    };
  }

  return {
    kind: "refresh",
    headline: adminState.title || "Check update status",
    detail:
      adminState.nextActionText ||
      adminState.description ||
      "Refresh status to see the latest workflow step.",
    primaryLabel: adminState.actionLabel || "Refresh status",
    primaryDisabled: false,
    showSpinner: false,
    reassurance: null,
  };
}
