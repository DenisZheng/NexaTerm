import type { DesktopPlatform } from "../../shared/tauri/platformCapabilities";
import type { LocalTerminalProfile, WslProviderStatus } from "../terminal/localTerminalTypes";

export type WslEntryReason =
  | "loading"
  | "detectionFailed"
  | "commandMissing"
  | "noDistribution"
  | "probeTimeout"
  | "probeFailed"
  | "availableHidden"
  | "notDetected"
  | null;

export interface NewSessionTerminalSections {
  localProfiles: LocalTerminalProfile[];
  showWslSection: boolean;
  wslProfiles: LocalTerminalProfile[];
  wslReason: WslEntryReason;
}

export function buildNewSessionTerminalSections(input: {
  platform: DesktopPlatform;
  profiles: readonly LocalTerminalProfile[];
  profilesFailed: boolean;
  profilesLoading: boolean;
  wslProviderStatus?: WslProviderStatus | null;
}): NewSessionTerminalSections {
  const localProfiles = input.profiles.filter((profile) => profile.kind !== "wsl");
  const wslProfiles = input.profiles.filter((profile) => profile.kind === "wsl");
  const showWslSection = input.platform === "windows";

  let wslReason: WslEntryReason = null;
  if (showWslSection && wslProfiles.length === 0) {
    if (input.profilesLoading) {
      wslReason = "loading";
    } else if (input.profilesFailed) {
      wslReason = "detectionFailed";
    } else {
      wslReason = {
        available: "availableHidden",
        command_missing: "commandMissing",
        no_distribution: "noDistribution",
        probe_failed: "probeFailed",
        probe_timeout: "probeTimeout",
        unsupported_platform: "notDetected",
      }[input.wslProviderStatus || "unsupported_platform"] as WslEntryReason;
    }
  }

  return { localProfiles, showWslSection, wslProfiles, wslReason };
}
