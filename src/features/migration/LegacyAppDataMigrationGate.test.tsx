// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  legacyAppDataMigrationApply,
  legacyAppDataMigrationPreview,
  legacyWebviewSettingsProbeStart,
  legacyWebviewSettingsProbeTake,
} from "../../shared/tauri/commands";
import { relaunch } from "@tauri-apps/plugin-process";
import { settingsStorageKey } from "../settings/startupSettings";

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
  legacyWebviewSettingsProbeStart: vi.fn(),
  legacyWebviewSettingsProbeTake: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

const preview = vi.mocked(legacyAppDataMigrationPreview);
const apply = vi.mocked(legacyAppDataMigrationApply);
const probeStart = vi.mocked(legacyWebviewSettingsProbeStart);
const probeTake = vi.mocked(legacyWebviewSettingsProbeTake);
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

function noLegacyCoreData() {
  return {
    available: false,
    blocked: false,
    currentRoot: "nexa",
    legacyRoot: "mxterm",
    legacyIdentifier: "com.mxterm.app",
    currentIdentifier: "com.nexaterm.app",
    files: [],
    reason: "legacy-data-not-found",
    targetHasUserData: false,
  };
}

describe("WF-08B legacy app-data startup gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    setTauriRuntime(true);
    probeStart.mockResolvedValue({
      supported: true,
      started: false,
      token: null,
      reason: "legacy-webview-data-not-found",
    });
    probeTake.mockResolvedValue({ complete: true, value: null });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
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
    expect(probeStart).not.toHaveBeenCalled();
  });

  it("enters the workspace when neither legacy app data nor legacy settings exist", async () => {
    preview.mockResolvedValue(noLegacyCoreData());

    render(
      <LegacyAppDataMigrationGate>
        <div>workspace-ready</div>
      </LegacyAppDataMigrationGate>,
    );

    expect(await screen.findByText("workspace-ready")).toBeTruthy();
    expect(probeStart).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it("offers settings-only migration when the old WebView store contains mxterm.settings.v1", async () => {
    const legacySettings = JSON.stringify({
      basic: { locale: "en" },
      localTerminal: {
        customProfiles: [{ id: "wsl-old", name: "Ubuntu", kind: "wsl", command: "wsl.exe" }],
      },
    });
    preview.mockResolvedValue(noLegacyCoreData());
    probeStart.mockResolvedValue({
      supported: true,
      started: true,
      token: "probe-token",
      reason: null,
    });
    probeTake.mockResolvedValue({ complete: true, value: legacySettings });
    restart.mockResolvedValue(undefined);

    render(
      <LegacyAppDataMigrationGate>
        <div>workspace-ready</div>
      </LegacyAppDataMigrationGate>,
    );

    expect(await screen.findByText("brandMigration.settingsTitle")).toBeTruthy();
    expect(screen.queryByText("workspace-ready")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "brandMigration.settingsApply" }));

    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(settingsStorageKey)).toBe(legacySettings);
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not pretend to auto-migrate old settings on unsupported platforms", async () => {
    preview.mockResolvedValue(noLegacyCoreData());
    probeStart.mockResolvedValue({
      supported: false,
      started: false,
      token: null,
      reason: "macos-default-wkwebview-store-unaddressable",
    });

    render(
      <LegacyAppDataMigrationGate>
        <div>workspace-ready</div>
      </LegacyAppDataMigrationGate>,
    );

    expect(await screen.findByText("workspace-ready")).toBeTruthy();
    expect(screen.queryByText("brandMigration.settingsTitle")).toBeNull();
  });

  it("records the macOS settings limitation after a confirmed core migration", async () => {
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
    probeStart.mockResolvedValue({
      supported: false,
      started: false,
      token: null,
      reason: "macos-default-wkwebview-store-unaddressable",
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

    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem("nexaterm.brandMigration.settings.v1")).toBe("unsupported");
  });

  it("shows the macOS settings limitation once after core migration", async () => {
    window.localStorage.setItem("nexaterm.brandMigration.settings.v1", "unsupported");
    preview.mockResolvedValue({
      ...noLegacyCoreData(),
      reason: "already-migrated",
      targetHasUserData: true,
    });

    render(
      <LegacyAppDataMigrationGate>
        <div>workspace-ready</div>
      </LegacyAppDataMigrationGate>,
    );

    expect(await screen.findByText("brandMigration.settingsUnsupportedTitle")).toBeTruthy();
    expect(screen.queryByText("workspace-ready")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "brandMigration.continue" }));

    expect(screen.getByText("workspace-ready")).toBeTruthy();
    expect(window.localStorage.getItem("nexaterm.brandMigration.settings.v1")).toBe(
      "unsupported-ack",
    );
  });

  it("requires explicit user action before migrating core data and supports skip", async () => {
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

  it("never offers automatic core overwrite when NexaTerm already has user data", async () => {
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
    expect(probeStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "brandMigration.continue" }));
    expect(screen.getByText("workspace-ready")).toBeTruthy();
  });

  it("migrates legacy WebView settings together with confirmed core data", async () => {
    const legacySettings = JSON.stringify({
      appearance: { themeMode: "dark" },
      shortcuts: { bindings: { "workspace.newSession": "Ctrl+Shift+N" } },
    });
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
    probeStart.mockResolvedValue({
      supported: true,
      started: true,
      token: "probe-token",
      reason: null,
    });
    probeTake.mockResolvedValue({ complete: true, value: legacySettings });
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
    expect(window.localStorage.getItem(settingsStorageKey)).toBe(legacySettings);
    expect(screen.queryByText("workspace-ready")).toBeNull();
  });
});
