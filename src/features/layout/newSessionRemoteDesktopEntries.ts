import type {
  ConnectionProtocol,
  RdpRunnerProbeResult,
  VncRunnerProbeResult,
} from "../connections/connectionTypes";

export type RemoteDesktopEntryState =
  | "unknown"
  | "probing"
  | "probe_failed"
  | "embedded"
  | "embedded_with_fallback"
  | "external"
  | "unavailable";

export interface RemoteDesktopEntryCapability {
  protocol: Extract<ConnectionProtocol, "rdp" | "vnc">;
  runner: string | null;
  state: RemoteDesktopEntryState;
}

export interface RemoteDesktopEntryCapabilities {
  rdp: RemoteDesktopEntryCapability;
  vnc: RemoteDesktopEntryCapability;
}

export type RemoteDesktopProbeState<T> =
  | { state: "unknown" | "probing" | "failed"; result?: null }
  | { state: "ready"; result: T };

export const unknownRemoteDesktopEntryCapabilities: RemoteDesktopEntryCapabilities = {
  rdp: { protocol: "rdp", runner: null, state: "unknown" },
  vnc: { protocol: "vnc", runner: null, state: "unknown" },
};

function nonReadyState(
  protocol: "rdp" | "vnc",
  state: Exclude<RemoteDesktopProbeState<never>["state"], "ready">,
): RemoteDesktopEntryCapability {
  return {
    protocol,
    runner: null,
    state: state === "probing" ? "probing" : state === "failed" ? "probe_failed" : "unknown",
  };
}

export function projectRdpEntryCapability(
  probe: RemoteDesktopProbeState<RdpRunnerProbeResult>,
): RemoteDesktopEntryCapability {
  if (probe.state !== "ready") {
    return nonReadyState("rdp", probe.state);
  }
  const runners = probe.result.available_runners;
  const embedded = probe.result.supports_embedded && runners.includes("mstsc_activex");
  const external = runners.some((runner) => runner !== "mstsc_activex");
  return {
    protocol: "rdp",
    runner: probe.result.default_runner || null,
    state: embedded
      ? external
        ? "embedded_with_fallback"
        : "embedded"
      : external
        ? "external"
        : "unavailable",
  };
}

export function projectVncEntryCapability(
  probe: RemoteDesktopProbeState<VncRunnerProbeResult>,
): RemoteDesktopEntryCapability {
  if (probe.state !== "ready") {
    return nonReadyState("vnc", probe.state);
  }
  const runners = probe.result.available_runners;
  const embedded = probe.result.supports_embedded && runners.includes("novnc");
  const external = runners.some((runner) => runner !== "novnc");
  return {
    protocol: "vnc",
    runner: probe.result.default_runner || null,
    state: embedded
      ? external
        ? "embedded_with_fallback"
        : "embedded"
      : external
        ? "external"
        : "unavailable",
  };
}

export function projectRemoteDesktopEntryCapabilities(input: {
  rdp: RemoteDesktopProbeState<RdpRunnerProbeResult>;
  vnc: RemoteDesktopProbeState<VncRunnerProbeResult>;
}): RemoteDesktopEntryCapabilities {
  return {
    rdp: projectRdpEntryCapability(input.rdp),
    vnc: projectVncEntryCapability(input.vnc),
  };
}

export function remoteDesktopCapabilityLabelKey(capability: RemoteDesktopEntryCapability) {
  const prefix = capability.protocol === "rdp" ? "rdp" : "vnc";
  switch (capability.state) {
    case "probing":
      return "newSession.remoteCapabilityProbing" as const;
    case "probe_failed":
      return "newSession.remoteCapabilityProbeFailed" as const;
    case "embedded":
      return prefix === "rdp"
        ? ("newSession.rdpEmbeddedAvailable" as const)
        : ("newSession.vncEmbeddedAvailable" as const);
    case "embedded_with_fallback":
      return prefix === "rdp"
        ? ("newSession.rdpEmbeddedFallbackAvailable" as const)
        : ("newSession.vncEmbeddedFallbackAvailable" as const);
    case "external":
      return prefix === "rdp"
        ? ("newSession.rdpExternalAvailable" as const)
        : ("newSession.vncExternalAvailable" as const);
    case "unavailable":
      return prefix === "rdp"
        ? ("newSession.rdpUnavailable" as const)
        : ("newSession.vncUnavailable" as const);
    default:
      return "newSession.remoteCapabilityUnknown" as const;
  }
}
