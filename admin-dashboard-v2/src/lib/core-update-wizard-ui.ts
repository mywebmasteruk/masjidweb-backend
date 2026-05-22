import {
  getCurrentUpdatePhase,
  type AdminUpdatePhase,
} from "./update-admin-copy";

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

  return { disabled: false, label: "See what's next", hint: null };
}

/** Poll /api/updates/status while GitHub workflow or production deploy is in flight. */
export function shouldAutoPollCoreUpdateStatus(status: string | undefined): boolean {
  return status === "preparing" || status === "deploying";
}
