import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireText(path, source, needle, description) {
  if (!source.includes(needle)) {
    throw new Error(`${path}: missing ${description}: ${needle}`);
  }
}

const settingsTypes = read("src/features/settings/settingsTypes.ts");
requireText("settingsTypes.ts", settingsTypes, "locale: LocalePreference;", "basic locale type");
requireText("settingsTypes.ts", settingsTypes, 'locale: "system"', "system locale default");
requireText("settingsTypes.ts", settingsTypes, '["system", "en", "zh-CN"]', "locale normalization allowlist");

const main = read("src/main.tsx");
requireText("main.tsx", main, "setLocalePreference(startupSettings.basic.locale);", "startup locale application");

const useSettings = read("src/features/settings/useSettings.ts");
requireText("useSettings.ts", useSettings, "setLocalePreference(settings.basic.locale);", "runtime locale application");

const settingsView = read("src/features/settings/SettingsView.tsx");
for (const key of [
  "settings.locale.title",
  "settings.locale.description",
  "settings.locale.system",
  "settings.locale.en",
  "settings.locale.zhCN",
]) {
  requireText("SettingsView.tsx", settingsView, `t("${key}")`, `localized locale setting key ${key}`);
}

for (const path of [
  "src/features/layout/AppTitlebar.tsx",
  "src/features/layout/AppActionBar.tsx",
  "src/features/layout/WorkspaceSidebar.tsx",
  "src/shared/ui/ActionMenuItem.tsx",
]) {
  requireText(path, read(path), "useI18n", "reactive i18n hook");
}

const actionMenuItem = read("src/shared/ui/ActionMenuItem.tsx");
requireText("ActionMenuItem.tsx", actionMenuItem, 'import { Keybinding } from "./Keybinding";', "shared Keybinding import");
requireText("ActionMenuItem.tsx", actionMenuItem, "<Keybinding", "shared Keybinding rendering");

const en = JSON.parse(read("src/shared/i18n/locales/en.json"));
const zhCN = JSON.parse(read("src/shared/i18n/locales/zh-CN.json"));
if (JSON.stringify(Object.keys(en).sort()) !== JSON.stringify(Object.keys(zhCN).sort())) {
  throw new Error("base locale catalogs must contain identical key sets");
}
for (const key of [
  "settings.locale.title",
  "settings.locale.description",
  "settings.locale.system",
  "settings.locale.en",
  "settings.locale.zhCN",
  "sidebar.sessions",
  "sidebar.files",
  "newSession.title",
  "titlebar.tabs",
]) {
  if (!en[key] || !zhCN[key]) {
    throw new Error(`missing required localized new-entry key: ${key}`);
  }
}

console.log("WF-01 i18n new-entry source gate passed");
