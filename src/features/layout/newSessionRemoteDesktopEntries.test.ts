import { describe, expect, it } from "vitest";

import {
  projectRdpEntryCapability,
  projectVncEntryCapability,
  remoteDesktopCapabilityLabelKey,
} from "./newSessionRemoteDesktopEntries";

describe("WF-05C remote desktop capability projection", () => {
  it("distinguishes Windows embedded RDP with an external fallback", () => {
    const capability = projectRdpEntryCapability({
      state: "ready",
      result: {
        platform: "windows",
        available_runners: ["mstsc_activex", "mstsc"],
        default_runner: "mstsc_activex",
        default_executable: "mstscax.dll",
        supports_embedded: true,
        supports_remote_app: true,
        supports_dynamic_resize: true,
        setup_hint: null,
      },
    });
    expect(capability).toEqual({
      protocol: "rdp",
      runner: "mstsc_activex",
      state: "embedded_with_fallback",
    });
    expect(remoteDesktopCapabilityLabelKey(capability)).toBe(
      "newSession.rdpEmbeddedFallbackAvailable",
    );
  });

  it("reports external-only and unavailable RDP without pretending embedded support", () => {
    expect(projectRdpEntryCapability({
      state: "ready",
      result: {
        platform: "linux",
        available_runners: ["freerdp"],
        default_runner: "freerdp",
        default_executable: "/usr/bin/xfreerdp",
        supports_embedded: false,
        supports_remote_app: true,
        supports_dynamic_resize: true,
        setup_hint: null,
      },
    }).state).toBe("external");
    expect(projectRdpEntryCapability({
      state: "ready",
      result: {
        platform: "linux",
        available_runners: [],
        default_runner: null,
        default_executable: null,
        supports_embedded: false,
        supports_remote_app: true,
        supports_dynamic_resize: true,
        setup_hint: "missing runner",
      },
    }).state).toBe("unavailable");
  });

  it("keeps built-in noVNC visible even when no external viewer exists", () => {
    const capability = projectVncEntryCapability({
      state: "ready",
      result: {
        platform: "linux",
        available_runners: ["novnc"],
        default_runner: "novnc",
        default_executable: null,
        supports_embedded: true,
        supports_clipboard: true,
        supports_resize_session: true,
        setup_hint: null,
      },
    });
    expect(capability).toEqual({
      protocol: "vnc",
      runner: "novnc",
      state: "embedded",
    });
  });

  it("keeps probe failure distinct from unavailable runner", () => {
    expect(projectRdpEntryCapability({ state: "failed" }).state).toBe("probe_failed");
    expect(projectVncEntryCapability({ state: "probing" }).state).toBe("probing");
  });
});
