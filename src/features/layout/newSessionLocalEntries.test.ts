import { describe, expect, it } from "vitest";
import type { LocalTerminalProfile } from "../terminal/localTerminalTypes";
import { buildNewSessionTerminalSections } from "./newSessionLocalEntries";

function profile(id: string, kind: string): LocalTerminalProfile {
  return {
    args: [], command: id, detected: true, env: {}, hidden: false, icon: "terminal",
    id, kind, name: id, platform: "windows", source: "detected",
  };
}

describe("WF-05A Local/WSL new-session projection", () => {
  it("separates WSL distributions from native Local terminals on Windows", () => {
    const sections = buildNewSessionTerminalSections({
      platform: "windows",
      profiles: [profile("pwsh", "powershell_core"), profile("wsl-ubuntu", "wsl"), profile("wsl-debian", "wsl")],
      profilesFailed: false,
      profilesLoading: false,
    });
    expect(sections.localProfiles.map((item) => item.id)).toEqual(["pwsh"]);
    expect(sections.wslProfiles.map((item) => item.id)).toEqual(["wsl-ubuntu", "wsl-debian"]);
    expect(sections.showWslSection).toBe(true);
    expect(sections.wslReason).toBe(null);
  });

  it("does not expose a WSL section on non-Windows platforms", () => {
    const sections = buildNewSessionTerminalSections({
      platform: "linux",
      profiles: [profile("bash", "bash")],
      profilesFailed: false,
      profilesLoading: false,
    });
    expect(sections.showWslSection).toBe(false);
    expect(sections.localProfiles.map((item) => item.id)).toEqual(["bash"]);
  });

  it("maps exact provider capability reasons without inventing availability", () => {
    expect(buildNewSessionTerminalSections({
      platform: "windows", profiles: [], profilesFailed: false, profilesLoading: true,
    }).wslReason).toBe("loading");
    expect(buildNewSessionTerminalSections({
      platform: "windows", profiles: [], profilesFailed: true, profilesLoading: false,
    }).wslReason).toBe("detectionFailed");
    expect(buildNewSessionTerminalSections({
      platform: "windows", profiles: [], profilesFailed: false, profilesLoading: false,
      wslProviderStatus: "command_missing",
    }).wslReason).toBe("commandMissing");
    expect(buildNewSessionTerminalSections({
      platform: "windows", profiles: [], profilesFailed: false, profilesLoading: false,
      wslProviderStatus: "no_distribution",
    }).wslReason).toBe("noDistribution");
    expect(buildNewSessionTerminalSections({
      platform: "windows", profiles: [], profilesFailed: false, profilesLoading: false,
      wslProviderStatus: "probe_timeout",
    }).wslReason).toBe("probeTimeout");
    expect(buildNewSessionTerminalSections({
      platform: "windows", profiles: [], profilesFailed: false, profilesLoading: false,
      wslProviderStatus: "probe_failed",
    }).wslReason).toBe("probeFailed");
    expect(buildNewSessionTerminalSections({
      platform: "windows", profiles: [], profilesFailed: false, profilesLoading: false,
      wslProviderStatus: "available",
    }).wslReason).toBe("availableHidden");
    expect(buildNewSessionTerminalSections({
      platform: "windows", profiles: [], profilesFailed: false, profilesLoading: false,
    }).wslReason).toBe("notDetected");
  });
});
