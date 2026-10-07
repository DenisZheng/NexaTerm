import {
  defaultSettings,
  normalizeSettings,
  resolveSettingsStyle,
  type MxtermSettings,
  type WindowMaterialMode,
} from "./settingsTypes";
import {
  getPlatformWindowMaterials,
  normalizeWindowMaterial,
  resolveDesktopPlatform,
} from "../../shared/tauri/windowMaterial";

export const settingsStorageKey = "mxterm.settings.v1";

export function readStartupSettings(): MxtermSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    return normalizeSettings(JSON.parse(window.localStorage.getItem(settingsStorageKey) || "null"));
  } catch {
    return defaultSettings;
  }
}

/** 启动与运行时共用的文档外观；body 同时承载 Radix Portal 的主题。 */
export function applyDocumentAppearance(settings: MxtermSettings, effectiveMaterial?: WindowMaterialMode) {
  if (typeof document === "undefined") {
    return;
  }

  const body = document.body;
  const platform = resolveDesktopPlatform();
  const windowMaterial = effectiveMaterial ?? normalizeWindowMaterial(
    settings.appearance.windowMaterial,
    getPlatformWindowMaterials(platform),
  );

  body.dataset.themeMode = settings.appearance.themeMode;
  body.dataset.windowMaterial = windowMaterial;
  body.dataset.density = settings.appearance.density;
  body.dataset.platform = platform;

  const style = resolveSettingsStyle(settings);
  for (const [name, value] of Object.entries(style)) {
    body.style.setProperty(name, value);
  }
}

export function writeStoredSettings(settings: MxtermSettings) {
  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    // localStorage can be unavailable in restricted preview contexts.
  }
}
