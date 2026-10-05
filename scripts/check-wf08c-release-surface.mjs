#!/usr/bin/env node
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const tauri = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const en = JSON.parse(readFileSync(new URL("../src/shared/i18n/locales/en.json", import.meta.url), "utf8"));
const zh = JSON.parse(readFileSync(new URL("../src/shared/i18n/locales/zh-CN.json", import.meta.url), "utf8"));
const release = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const buildPlatform = readFileSync(new URL("../scripts/build-platform.mjs", import.meta.url), "utf8");
const prepareSidecar = readFileSync(new URL("../scripts/prepare-mcp-sidecar.mjs", import.meta.url), "utf8");
const mcp = readFileSync(new URL("../src-tauri/src/mcp.rs", import.meta.url), "utf8");
const sidecar = readFileSync(new URL("../src-tauri/src/bin/mxterm_mcp.rs", import.meta.url), "utf8");

function fail(message) {
  throw new Error(`WF-08C release surface: ${message}`);
}

function placeholders(value) {
  return [...String(value).matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

const enKeys = Object.keys(en).sort();
const zhKeys = Object.keys(zh).sort();
if (enKeys.length === 0 || zhKeys.length === 0) fail("locale catalogs must not be empty");
if (JSON.stringify(enKeys) !== JSON.stringify(zhKeys)) {
  const missingZh = enKeys.filter((key) => !(key in zh));
  const missingEn = zhKeys.filter((key) => !(key in en));
  fail(`locale key mismatch; missing zh-CN=${missingZh.join(",")}; missing en=${missingEn.join(",")}`);
}
for (const key of enKeys) {
  const enPlaceholders = placeholders(en[key]);
  const zhPlaceholders = placeholders(zh[key]);
  if (JSON.stringify(enPlaceholders) !== JSON.stringify(zhPlaceholders)) {
    fail(`placeholder mismatch for ${key}: en=${enPlaceholders.join(",")} zh=${zhPlaceholders.join(",")}`);
  }
}

if (pkg.name !== "nexaterm") fail(`package name drifted: ${pkg.name}`);
if (tauri.productName !== "NexaTerm") fail(`Tauri productName drifted: ${tauri.productName}`);
if (tauri.identifier !== "com.nexaterm.app") fail(`bundle identifier drifted: ${tauri.identifier}`);
if (!Array.isArray(tauri?.bundle?.externalBin) ||
    !tauri.bundle.externalBin.includes("binaries/nexaterm-mcp")) {
  fail("externalBin must bundle nexaterm-mcp");
}
if (!String(tauri?.build?.beforeBuildCommand || "").includes("build:mcp-sidecar") ||
    !String(tauri?.build?.beforeDevCommand || "").includes("build:mcp-sidecar")) {
  fail("Tauri build/dev hooks must prepare the canonical MCP sidecar");
}
const updaterEndpoints = tauri?.plugins?.updater?.endpoints || [];
if (!updaterEndpoints.some((value) =>
  String(value).includes("github.com/DenisZheng/NexaTerm/releases/latest/download/latest.json")
)) {
  fail("updater endpoint must target DenisZheng/NexaTerm latest.json");
}
if (updaterEndpoints.some((value) => /syscryer\/mxterm/i.test(String(value)))) {
  fail("active updater endpoint must not target syscryer/mxterm");
}

for (const needle of [
  "DenisZheng/NexaTerm",
  "NexaTerm-portable",
  "NEXATERM_CREATE_UPDATER_ARTIFACTS",
]) {
  if (!release.includes(needle)) fail(`release workflow missing canonical surface: ${needle}`);
}
if (release.includes("MXTERM_CREATE_UPDATER_ARTIFACTS")) {
  fail("release workflow must advertise the NexaTerm updater-artifact env name");
}
if (!buildPlatform.includes('"NEXATERM_CREATE_UPDATER_ARTIFACTS"')) {
  fail("build-platform must use the canonical updater-artifact env");
}
if (!buildPlatform.includes('"MXTERM_CREATE_UPDATER_ARTIFACTS"')) {
  fail("build-platform must retain the legacy updater-artifact env as compatibility alias");
}

for (const needle of [
  'canonicalSidecarName = "nexaterm-mcp"',
  'legacyCargoBinName = "mxterm-mcp"',
  "TAURI_ENV_TARGET_TRIPLE",
  '"binaries"',
]) {
  if (!prepareSidecar.includes(needle)) {
    fail(`prepare-mcp-sidecar must emit canonical target-triple bundle: ${needle}`);
  }
}

for (const needle of [
  '"get_nexaterm_mcp_status"',
  '"get_mxterm_mcp_status"',
  '"Get NexaTerm MCP status."',
  '"List redacted saved NexaTerm connections."',
  '"NexaTerm MCP 尚未启用。"',
  '"MCP 工具只允许使用 NexaTerm 已保存的 connection_id。"',
  '"nexaterm-mcp.exe"',
  '"nexaterm-mcp"',
  '"mxterm-mcp.exe"',
  '"mxterm-mcp"',
  "legacy_sidecar_executable_name",
]) {
  if (!mcp.includes(needle)) fail(`MCP backend missing canonical/compatibility contract: ${needle}`);
}
for (const stale of [
  '"MXterm MCP 尚未启用。"',
  '"MCP 工具只允许使用 MXterm 已保存的 connection_id。"',
  '"无法定位 MXterm 数据目录。"',
  '"无法定位 MXterm MCP 可执行文件路径。"',
]) {
  if (mcp.includes(stale)) fail(`active user-facing MCP text still uses old brand: ${stale}`);
}

for (const needle of [
  '"serverInfo": { "name": "nexaterm-mcp"',
  '"x-nexaterm-mcp-token"',
  '"x-mxterm-mcp-token"',
  "X-NexaTerm-MCP-Token, X-MXterm-MCP-Token",
  '"get_nexaterm_mcp_status" | "get_mxterm_mcp_status"',
]) {
  if (!sidecar.includes(needle)) fail(`sidecar missing canonical/legacy protocol contract: ${needle}`);
}
if (sidecar.includes('"serverInfo": { "name": "mxterm-mcp"')) {
  fail("MCP serverInfo must use the NexaTerm identity");
}

if (!mcp.includes('const MCP_SIDECAR_PROCESS_NAMES: [&str; 2] = ["nexaterm-mcp.exe", "mxterm-mcp.exe"]')) {
  fail("Windows updater blocker must recognize canonical and legacy MCP process names");
}

console.log(
  `PASS  WF-08C release surface: ${enKeys.length} locale keys aligned; NexaTerm brand/update/MCP canonical surfaces locked`,
);
