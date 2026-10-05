#!/usr/bin/env node
import { readFileSync } from "node:fs";

const rust = readFileSync(new URL("../src-tauri/src/brand_migration.rs", import.meta.url), "utf8");
const legacySettings = readFileSync(new URL("../src-tauri/src/legacy_webview_settings.rs", import.meta.url), "utf8");
const lib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const gate = readFileSync(new URL("../src/features/migration/LegacyAppDataMigrationGate.tsx", import.meta.url), "utf8");
const probeWindow = readFileSync(new URL("../src/features/migration/LegacySettingsProbeWindow.tsx", import.meta.url), "utf8");
const commands = readFileSync(new URL("../src/shared/tauri/commands.ts", import.meta.url), "utf8");
const capability = readFileSync(new URL("../src-tauri/capabilities/legacy-settings-probe.json", import.meta.url), "utf8");
const mcp = readFileSync(new URL("../src-tauri/src/mcp.rs", import.meta.url), "utf8");

function requireAll(source, needles, label) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      throw new Error(`WF-08B ${label} missing: ${needle}`);
    }
  }
}

requireAll(rust, [
  'LEGACY_APP_IDENTIFIER: &str = "com.mxterm.app"',
  'CURRENT_APP_IDENTIFIER: &str = "com.nexaterm.app"',
  "brand_migration_target_not_empty",
  "brand_migration_backup_failed",
  "brand_migration_database_invalid",
  "MIGRATION_MARKER_FILE",
  "rollback_for_root",
  '"already-migrated"',
  "secrets.local.key",
  "mxterm.db-wal",
], "Rust migration contract");

requireAll(legacySettings, [
  "app_local_data_dir()",
  "LEGACY_APP_IDENTIFIER",
  "CURRENT_APP_IDENTIFIER",
  "pub async fn legacy_webview_settings_probe_start",
  "WebviewWindowBuilder::new",
  ".initialization_script(initialization_script)",
  ".data_directory(legacy_root)",
  "MAX_SETTINGS_BYTES",
  "macos-default-wkwebview-store-unaddressable",
], "legacy WebView settings bridge");

requireAll(lib, [
  "brand_migration::legacy_app_data_migration_preview",
  "brand_migration::legacy_app_data_migration_apply",
  "brand_migration::legacy_app_data_migration_rollback",
  "legacy_webview_settings::legacy_webview_settings_probe_start",
  "legacy_webview_settings::legacy_webview_settings_probe_capture",
  "legacy_webview_settings::legacy_webview_settings_probe_take",
], "Tauri command registration");

requireAll(commands, [
  "legacyAppDataMigrationPreview",
  "legacyAppDataMigrationApply",
  "legacyAppDataMigrationRollback",
  "legacyWebviewSettingsProbeStart",
  "legacyWebviewSettingsProbeCapture",
  "legacyWebviewSettingsProbeTake",
], "frontend bridge");

requireAll(app, [
  "__NEXATERM_LEGACY_SETTINGS_PROBE_TOKEN__",
  "<LegacySettingsProbeWindow token={legacyProbeToken} />",
  "<LegacyAppDataMigrationGate>",
  "<WorkspaceShell />",
], "startup routing");

requireAll(probeWindow, [
  "window.localStorage.getItem(settingsStorageKey)",
  "legacyWebviewSettingsProbeCapture",
  "getCurrentWindow().close()",
], "hidden settings probe");

requireAll(capability, [
  '"windows": ["legacy-settings-probe"]',
  '"core:window:allow-close"',
], "probe capability");

requireAll(gate, [
  "legacyAppDataMigrationPreview()",
  "legacyAppDataMigrationApply()",
  "legacyWebviewSettingsProbeStart()",
  "legacyWebviewSettingsProbeTake",
  "settingsMigrationMarkerKey",
  "installLegacySettings",
  "brandMigration.settingsApply",
  "brandMigration.apply",
  "brandMigration.skip",
  "preview.blocked",
  "await relaunch()",
], "explicit user choice");

if (gate.includes("legacyAppDataMigrationApply();\n  }, []")) {
  throw new Error("WF-08B migration must never auto-apply on mount");
}

requireAll(mcp, [
  '"NEXATERM_DATA_DIR"',
  '"MXTERM_DATA_DIR"',
  'join("com.nexaterm.app")',
], "MCP data-dir brand compatibility");

console.log("PASS  WF-08B cross-brand migration contract");
