import { describe, expect, it } from "vitest";
import { describeAdminUpdateState } from "./update-admin-copy";
import {
  buildCoreUpdateNowAction,
  getWizardNextNav,
  getWorkflowStep,
  isReadingAhead,
  requiresStepActionBeforeNext,
  resolveViewedStep,
  shouldAutoPollCoreUpdateStatus,
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
        deployPreviewUrl: null,
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
        deployPreviewUrl: null,
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
        deployPreviewUrl: null,
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
        deployPreviewUrl: null,
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

  it("keeps future steps collapsed while preview is current", () => {
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
    expect(nav.disabled).toBe(true);
    expect(nav.hideNext).toBe(true);
    expect(nav.hint).toContain("Future steps");
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

  it("polls status while preparing or deploying", () => {
    expect(shouldAutoPollCoreUpdateStatus("preparing")).toBe(true);
    expect(shouldAutoPollCoreUpdateStatus("deploying")).toBe(true);
    expect(shouldAutoPollCoreUpdateStatus("ready_to_preview")).toBe(false);
    expect(shouldAutoPollCoreUpdateStatus("update_available", { prepareInFlight: true })).toBe(
      true,
    );
    expect(shouldAutoPollCoreUpdateStatus("checks_failed", { aiRepairInFlight: true })).toBe(
      true,
    );
  });

  it("shows repair-in-progress now-action while GitHub repair runs", () => {
    const admin = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 12,
        title: "safe update",
        url: "https://github.com/example/repo/pull/12",
        deployPreviewUrl: null,
        isDraft: false,
        mergeable: false,
        mergeableState: "dirty",
        ciStatus: "failure",
        labels: [],
      },
    });
    const now = buildCoreUpdateNowAction(admin, {
      aiRepairInFlight: true,
      aiRepairDetail: "Autopilot running: deterministic repair…",
    });
    expect(now.kind).toBe("repair");
    expect(now.showSpinner).toBe(true);
    expect(now.primaryLabel).toBeNull();
    expect(now.detail).toContain("deterministic repair");
  });

  it("shows preparing now-action after prepare click until PR is detected", () => {
    const admin = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: true,
      latestReleaseVersion: "1.12.0",
      forkPackageVersion: "1.11.0",
      deployedPackageVersion: "1.11.0",
    });
    const now = buildCoreUpdateNowAction(admin, { prepareInFlight: true });
    expect(now.kind).toBe("preparing");
    expect(now.primaryLabel).toBeNull();
    expect(now.showSpinner).toBe(true);
    expect(now.reassurance).toMatch(/Do not click Prepare again/);
  });

  it("shows Premium AI action when update is blocked", () => {
    const admin = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 18,
        title: "safe update",
        url: "https://github.com/example/repo/pull/18",
        deployPreviewUrl: null,
        isDraft: true,
        mergeable: false,
        mergeableState: "dirty",
        ciStatus: "failure",
        labels: [],
        autopilotStatus: "blocked",
        autopilotRisk: "HIGH",
        autopilotBlockedReason: "Autopilot blocked this update to protect tenant data: 4 conflict(s) are in tenant-sensitive files.",
      },
    });
    const now = buildCoreUpdateNowAction(admin);
    expect(now.kind).toBe("repair");
    expect(now.primaryLabel).toBe("Fix with Premium AI");
    expect(now.reassurance).toContain("Approval stays locked");
  });

  it("shows single prepare action when update is available", () => {
    const admin = describeAdminUpdateState({
      ok: true,
      releaseAheadOfForkPackage: true,
      latestReleaseVersion: "1.12.0",
      forkPackageVersion: "1.11.0",
      deployedPackageVersion: "1.11.0",
    });
    const now = buildCoreUpdateNowAction(admin);
    expect(now.kind).toBe("prepare");
    expect(now.primaryLabel).toBe("Prepare safe update");
  });

  it("shows approve action when PR is ready", () => {
    const admin = describeAdminUpdateState({
      ok: true,
      activeSafeUpdate: {
        number: 6,
        title: "safe update",
        url: "https://github.com/example/repo/pull/6",
        deployPreviewUrl: "https://preview.example",
        isDraft: false,
        mergeable: true,
        mergeableState: "clean",
        ciStatus: "success",
        labels: [],
      },
    });
    const now = buildCoreUpdateNowAction(admin);
    expect(now.kind).toBe("approve");
    expect(now.primaryLabel).toBe("Approve merge");
  });
});
