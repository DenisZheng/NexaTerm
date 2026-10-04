#!/usr/bin/env node
import { readFileSync } from "node:fs";

const rust = readFileSync(new URL("../src-tauri/src/brand_migration.rs", import.meta.url), "utf8");
const lib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const gate = readFileSync(new URL("../src/features/migration/LegacyAppDataMigrationGate.tsx", import.meta.url), "utf8");
const commands = readFileSync(new URL("../src/shared/tauri/commands.ts", import.meta.url), "utf8");
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

requireAll(lib, [
  "brand_migration::legacy_app_data_migration_preview",
  "brand_migration::legacy_app_data_migration_apply",
  "brand_migration::legacy_app_data_migration_rollback",
], "Tauri command registration");

requireAll(commands, [
  "legacyAppDataMigrationPreview",
  "legacyAppDataMigrationApply",
  "legacyAppDataMigrationRollback",
], "frontend bridge");

requireAll(app, [
  "<LegacyAppDataMigrationGate>",
  "<WorkspaceShell />",
], "startup gate");

requireAll(gate, [
  "legacyAppDataMigrationPreview()",
  "legacyAppDataMigrationApply()",
  "brandMigration.apply",
  "brandMigration.skip",
  "preview.blocked",
  "await relaunch()",
], "explicit user choice");

if (gate.includes("legacyAppDataMigrationApply();\n  }, []")) {
  throw new Error("WF-08B migration must never auto-apply on mount");
}

console.log("PASS  WF-08B cross-brand migration contract");


requireAll(mcp, [
  '"NEXATERM_DATA_DIR"',
  '"MXTERM_DATA_DIR"',
  'join("com.nexaterm.app")',
], "MCP data-dir brand compatibility");
