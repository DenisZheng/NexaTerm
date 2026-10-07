import { getCurrentWindow } from "@tauri-apps/api/window";

import type { ThemeMode } from "../../features/settings/settingsTypes";
import { hasTauriRuntime } from "./runtime";

let themeSync: Promise<boolean> = Promise.resolve(false);

/** 透明 CSS 面板必须与原生材质使用同一主题；null 表示解除显式外观并跟随系统。 */
export function syncCurrentWindowTheme(themeMode: ThemeMode): Promise<boolean> {
  if (!hasTauriRuntime()) return Promise.resolve(false);

  // 串行应用快速切换，避免较早的异步调用最后完成并覆盖新选择。
  themeSync = themeSync.then(async () => {
    try {
      await getCurrentWindow().setTheme(themeMode === "system" ? null : themeMode);
      return true;
    } catch (error) {
      console.warn("Failed to synchronize native window theme", error);
      return false;
    }
  });
  return themeSync;
}
