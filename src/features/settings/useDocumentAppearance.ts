import { useLayoutEffect } from "react";

import { syncCurrentWebviewBackground } from "../../shared/tauri/webviewBackground";
import { syncCurrentWindowTheme } from "../../shared/tauri/windowTheme";
import type { MxtermSettings, WindowMaterialMode } from "./settingsTypes";
import { applyDocumentAppearance } from "./startupSettings";

/** 工作区与独立窗口共用，避免 body/Portal 的外观规则分叉。 */
export function useDocumentAppearance(settings: MxtermSettings, effectiveMaterial: WindowMaterialMode) {
  useLayoutEffect(() => {
    void syncCurrentWindowTheme(settings.appearance.themeMode);
  }, [settings.appearance.themeMode]);

  useLayoutEffect(() => {
    applyDocumentAppearance(settings, effectiveMaterial);
    void syncCurrentWebviewBackground();

    if (settings.appearance.themeMode !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => { void syncCurrentWebviewBackground(); };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [settings, effectiveMaterial]);
}
