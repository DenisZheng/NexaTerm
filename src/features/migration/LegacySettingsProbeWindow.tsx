import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { settingsStorageKey } from "../settings/startupSettings";
import { legacyWebviewSettingsProbeCapture } from "../../shared/tauri/commands";

export function LegacySettingsProbeWindow({ token }: { token: string }) {
  useEffect(() => {
    let value: string | null = null;
    try {
      value = window.localStorage.getItem(settingsStorageKey);
    } catch {
      value = null;
    }

    const finish = async () => {
      try {
        await legacyWebviewSettingsProbeCapture(token, value);
      } catch {
        // The main window treats a missing capture as a probe failure/timeout.
      }
      try {
        await getCurrentWindow().close();
      } catch {
        // Hidden probe windows are best-effort cleanup.
      }
    };

    void finish();
  }, [token]);

  return null;
}
