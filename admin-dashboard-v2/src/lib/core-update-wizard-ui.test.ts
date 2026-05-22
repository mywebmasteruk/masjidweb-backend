import { describe, expect, it } from "vitest";
import { describeAdminUpdateState } from "./update-admin-copy";
import {
  getWizardNextNav,
  getWorkflowStep,
  isReadingAhead,
  requiresStepActionBeforeNext,
  resolveViewedStep,
  stepperStepClass,
  type ViewedStepStorage,
} from "./core-update-wizard-ui";

function memoryStorage(initial?: {
  viewed?: number;
  lastWorkflow?: number;
}): ViewedStepStorage & { viewed: number | null; lastWorkflow: number | null } {
  const state = {
    viewed: initial?.viewed ?? null,
    lastWorkflow: initial?.lastWorkflow ?? null,
  };
  return {
    getViewedStep: () => state.viewed,
    setViewedStep: (step) => {
      state.viewed = step;
    },
    getLastWorkflowStep: () => state.lastWorkflow,
    setLastWorkflowStep: (step) => {
      state.lastWorkflow = step;
    },
    viewed: state.viewed,
    lastWorkflow: state.lastWorkflow,
  };
}

describe("core-update-wizard-ui", () => {
  it("highlights viewed step when browsing ahead of blocked workflow", () => {
    const admin = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 2,
        title: "safe update",
        url: "https://github.com/example/repo/pull/2",
        isDraft: true,
        mergeable: false,
        mergeableState: "dirty",
        ciStatus: "failure",
        labels: ["needs-developer-review"],
      },
    });
    const phases = admin.phases;
    const workflowStep = getWorkflowStep(phases);
    expect(workflowStep).toBe(2);

    const viewedStep = 3;
    expect(isReadingAhead(viewedStep, workflowStep)).toBe(true);

    const fixPhase = phases.find((p) => p.step === 2)!;
    const previewPhase = phases.find((p) => p.step === 3)!;

    expect(stepperStepClass(fixPhase, 2, viewedStep, workflowStep)).toBe(
      "mw-stepper-step is-workflow-current",
    );
    expect(stepperStepClass(previewPhase, 3, viewedStep, workflowStep)).toBe(
      "mw-stepper-step is-viewing is-skipped",
    );
  });

  it("clamps stored viewed step on refresh when ahead of workflow", () => {
    const admin = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 2,
        title: "safe update",
        url: "https://github.com/example/repo/pull/2",
        isDraft: true,
        mergeable: false,
        mergeableState: "dirty",
        ciStatus: "failure",
        labels: [],
      },
    });
    const storage = memoryStorage({ viewed: 3, lastWorkflow: 2 });
    expect(resolveViewedStep(admin.phases, storage)).toBe(2);
  });

  it("auto-advances viewed step when workflow moves forward", () => {
    const blocked = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 2,
        title: "safe update",
        url: "https://github.com/example/repo/pull/2",
        isDraft: true,
        mergeable: false,
        mergeableState: "dirty",
        ciStatus: "failure",
        labels: [],
      },
    });
    const storage = memoryStorage({ viewed: 2, lastWorkflow: 2 });
    expect(resolveViewedStep(blocked.phases, storage)).toBe(2);

    const ready = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 2,
        title: "safe update",
        url: "https://github.com/example/repo/pull/2",
        deployPreviewUrl: "https://preview.example",
        isDraft: true,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "success",
        labels: [],
      },
    });
    expect(getWorkflowStep(ready.phases)).toBe(3);
    expect(resolveViewedStep(ready.phases, storage)).toBe(3);
    expect(storage.getViewedStep()).toBe(3);
  });

  it("uses is-progress when viewing the live workflow step", () => {
    const admin = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 2,
        title: "safe update",
        url: "https://github.com/example/repo/pull/2",
        isDraft: true,
        mergeable: false,
        mergeableState: "dirty",
        ciStatus: "failure",
        labels: [],
      },
    });
    const workflowStep = getWorkflowStep(admin.phases);
    const fixPhase = admin.phases.find((p) => p.step === workflowStep)!;
    expect(stepperStepClass(fixPhase, workflowStep, workflowStep, workflowStep)).toBe(
      "mw-stepper-step is-viewing is-progress",
    );
  });

  it("blocks wizard next on step 1 until prepare is done", () => {
    const admin = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: true,
      latestReleaseVersion: "1.11.0",
      forkPackageVersion: "1.10.1",
      deployedPackageVersion: "1.10.1",
    });
    expect(admin.canPrepare).toBe(true);
    expect(requiresStepActionBeforeNext(1, 1, admin)).toBe(true);
    const nav = getWizardNextNav(1, 1, admin);
    expect(nav.disabled).toBe(true);
    expect(nav.hideNext).toBe(true);
    expect(nav.hint).toMatch(/Finish the step above/);
  });

  it("allows browsing next on preview step while approve is still pending", () => {
    const ready = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 2,
        title: "safe update",
        url: "https://github.com/example/repo/pull/2",
        deployPreviewUrl: "https://preview.example",
        isDraft: true,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "success",
        labels: [],
      },
    });
    const workflowStep = getWorkflowStep(ready.phases);
    expect(workflowStep).toBe(3);
    const nav = getWizardNextNav(3, workflowStep, ready);
    expect(nav.disabled).toBe(false);
    expect(nav.label).toBe("See what's next");
  });

  it("blocks wizard next on approve step until merge is approved", () => {
    const ready = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 2,
        title: "safe update",
        url: "https://github.com/example/repo/pull/2",
        deployPreviewUrl: "https://preview.example",
        isDraft: false,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "success",
        labels: [],
      },
    });
    const workflowStep = getWorkflowStep(ready.phases);
    expect(workflowStep).toBe(4);
    expect(requiresStepActionBeforeNext(4, workflowStep, ready)).toBe(true);
  });
});
