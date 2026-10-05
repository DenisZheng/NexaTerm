// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  legacyAppDataMigrationApply,
  legacyAppDataMigrationPreview,
} from "../../shared/tauri/commands";
import { relaunch } from "@tauri-apps/plugin-process";

import { LegacyAppDataMigrationGate } from "./LegacyAppDataMigrationGate";

vi.mock("../../shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("../../shared/tauri/commands", () => ({
  legacyAppDataMigrationPreview: vi.fn(),
  legacyAppDataMigrationApply: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

const preview = vi.mocked(legacyAppDataMigrationPreview);
const apply = vi.mocked(legacyAppDataMigrationApply);
const restart = vi.mocked(relaunch);

function setTauriRuntime(enabled: boolean) {
  if (enabled) {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  } else {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  }
}

describe("WF-08B legacy app-data startup gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTauriRuntime(true);
  });

  afterEach(() => {
    setTauriRuntime(false);
  });

  it("does not call native migration outside Tauri", () => {
    setTauriRuntime(false);

    render(
      <LegacyAppDataMigrationGate>
        <div>workspace-ready</div>
      </LegacyAppDataMigrationGate>,
    );

    expect(screen.getByText("workspace-ready")).toBeTruthy();
    expect(preview).not.toHaveBeenCalled();
  });

  it("enters the workspace immediately when no legacy data is available", async () => {
    preview.mockResolvedValue({
      available: false,
      blocked: false,
      currentRoot: "nexa",
      legacyRoot: "mxterm",
      legacyIdentifier: "com.mxterm.app",
      currentIdentifier: "com.nexaterm.app",
      files: [],
      reason: "legacy-data-not-found",
      targetHasUserData: false,
    });

    render(
      <LegacyAppDataMigrationGate>
        <div>workspace-ready</div>
      </LegacyAppDataMigrationGate>,
    );

    expect(await screen.findByText("workspace-ready")).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
  });

  it("requires explicit user action before migrating and supports skip", async () => {
    preview.mockResolvedValue({
      available: true,
      blocked: false,
      currentRoot: "nexa",
      legacyRoot: "mxterm",
      legacyIdentifier: "com.mxterm.app",
      currentIdentifier: "com.nexaterm.app",
      files: ["mxterm.db", "secrets.enc"],
      reason: null,
      targetHasUserData: false,
    });

    render(
      <LegacyAppDataMigrationGate>
        <div>workspace-ready</div>
      </LegacyAppDataMigrationGate>,
    );

    expect(await screen.findByText("brandMigration.title")).toBeTruthy();
    expect(screen.queryByText("workspace-ready")).toBeNull();
    expect(apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "brandMigration.skip" }));

    expect(screen.getByText("workspace-ready")).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
  });

  it("never offers automatic overwrite when NexaTerm already has user data", async () => {
    preview.mockResolvedValue({
      available: true,
      blocked: true,
      currentRoot: "nexa",
      legacyRoot: "mxterm",
      legacyIdentifier: "com.mxterm.app",
      currentIdentifier: "com.nexaterm.app",
      files: ["mxterm.db"],
      reason: "nexaterm-data-already-exists",
      targetHasUserData: true,
    });

    render(
      <LegacyAppDataMigrationGate>
        <div>workspace-ready</div>
      </LegacyAppDataMigrationGate>,
    );

    expect(await screen.findByText("brandMigration.blockedTitle")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "brandMigration.apply" })).toBeNull();
    expect(apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "brandMigration.continue" }));
    expect(screen.getByText("workspace-ready")).toBeTruthy();
  });

  it("applies only after confirmation and relaunches after success", async () => {
    preview.mockResolvedValue({
      available: true,
      blocked: false,
      currentRoot: "nexa",
      legacyRoot: "mxterm",
      legacyIdentifier: "com.mxterm.app",
      currentIdentifier: "com.nexaterm.app",
      files: ["mxterm.db"],
      reason: null,
      targetHasUserData: false,
    });
    apply.mockResolvedValue({
      migratedFiles: ["mxterm.db"],
      backupRoot: "backup",
      legacyRoot: "mxterm",
      currentRoot: "nexa",
      restartRequired: true,
    });
    restart.mockResolvedValue(undefined);

    render(
      <LegacyAppDataMigrationGate>
        <div>workspace-ready</div>
      </LegacyAppDataMigrationGate>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "brandMigration.apply" }));

    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("workspace-ready")).toBeNull();
  });
});
