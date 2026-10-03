import type { DesktopPlatform } from "../../shared/tauri/platformCapabilities";
import type { LocalTerminalProfile } from "../terminal/localTerminalTypes";

export type WslEntryReason = "loading" | "detectionFailed" | "notDetected" | null;

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
}): NewSessionTerminalSections {
  const localProfiles = input.profiles.filter((profile) => profile.kind !== "wsl");
  const wslProfiles = input.profiles.filter((profile) => profile.kind === "wsl");
  const showWslSection = input.platform === "windows";

  let wslReason: WslEntryReason = null;
  if (showWslSection && wslProfiles.length === 0) {
    wslReason = input.profilesLoading
      ? "loading"
      : input.profilesFailed
        ? "detectionFailed"
        : "notDetected";
  }

  return { localProfiles, showWslSection, wslProfiles, wslReason };
}
