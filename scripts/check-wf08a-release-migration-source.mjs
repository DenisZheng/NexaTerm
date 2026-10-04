#!/usr/bin/env node
import { readFileSync } from "node:fs";

const release = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const tauri = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const migration = readFileSync(new URL("../src-tauri/src/storage_migration.rs", import.meta.url), "utf8");
const requirements = readFileSync(new URL("../NEXATERM_REQUIREMENTS.md", import.meta.url), "utf8");

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`WF-08A baseline missing ${label}: ${needle}`);
  }
}

for (const [scriptName, expected] of [
  ["package:win", "node scripts/build-platform.mjs win-x64"],
  ["package:mac-arm64", "node scripts/build-platform.mjs mac-arm64"],
  ["package:linux", "node scripts/build-platform.mjs linux-x64"],
]) {
  if (pkg.scripts?.[scriptName] !== expected) {
    throw new Error(`WF-08A package script drift: ${scriptName}`);
  }
}

for (const needle of [
  "target: windows-x64",
  "target: macos-arm64",
  "target: linux-x64",
  "Validate release version",
  "TAURI_SIGNING_PRIVATE_KEY",
  "Verify Windows Authenticode signatures",
  "Verify macOS Developer ID signature and notarization",
  "generate-latest-json.mjs",
  "SHA256SUMS.txt",
  "Check third-party licenses",
]) requireIncludes(release, needle, "release contract");

const updater = tauri?.plugins?.updater;
if (!updater?.pubkey || !String(updater.pubkey).trim()) {
  throw new Error("WF-08A updater public key is missing");
}
if (!Array.isArray(updater.endpoints) || !updater.endpoints.some((value) =>
  String(value).includes("github.com/DenisZheng/NexaTerm/releases/latest/download/latest.json")
)) {
  throw new Error("WF-08A updater endpoint drift");
}
if (!Array.isArray(tauri?.bundle?.resources) ||
    !tauri.bundle.resources.includes("../THIRD_PARTY_LICENSES.md")) {
  throw new Error("WF-08A bundle must ship third-party license notices");
}

for (const needle of [
  "pub const DATA_DIR_VERSION",
  "storage_data_version_too_new",
  "storage_migrated_from_json",
  "cleanup_secrets",
  "backup_legacy_json",
  ".migrated.bak",
  "migrated_store_repairs_missing_vault_secrets_from_backup",
]) requireIncludes(migration, needle, "migration contract");

for (const needle of [
  "Windows / macOS / Linux 可构建和运行",
  "English / zh-CN 可用",
  "无明显资源泄漏",
  "无已知 Critical/High dependency vulnerability 未处理",
  "mXterm → NexaTerm Migration",
]) requireIncludes(requirements, needle, "A15 requirement");

console.log("PASS  WF-08A release + migration baseline");
