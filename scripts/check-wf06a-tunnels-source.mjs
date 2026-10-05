import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/features/tunnels/TunnelPanel.tsx", import.meta.url), "utf8");
const tunnelLocaleEn = JSON.parse(readFileSync(new URL("../src/shared/i18n/locales/en.json", import.meta.url), "utf8"));
const tunnelLocaleZh = JSON.parse(readFileSync(new URL("../src/shared/i18n/locales/zh-CN.json", import.meta.url), "utf8"));
const association = readFileSync(new URL("../src/features/tunnels/tunnelRuleConnectionState.ts", import.meta.url), "utf8");
const associationTest = readFileSync(new URL("../src/features/tunnels/tunnelRuleConnectionState.test.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/features/tunnels/tunnelTypes.ts", import.meta.url), "utf8");
const registry = readFileSync(new URL("../src/features/shortcuts/actionRegistry.ts", import.meta.url), "utf8");
const presentation = readFileSync(new URL("../src/features/shortcuts/actionPresentation.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url), "utf8");
const backend = readFileSync(new URL("../src-tauri/src/tunnels.rs", import.meta.url), "utf8");
const fixtureTest = readFileSync(new URL("../src-tauri/src/tunnels/fixture_tests.rs", import.meta.url), "utf8");
const fixtureOrchestrator = readFileSync(new URL("../tests/fixtures/fixtures.mjs", import.meta.url), "utf8");
const fixtureProbe = readFileSync(new URL("../tests/fixtures/tunnel-probe.mjs", import.meta.url), "utf8");
const fixtureReadme = readFileSync(new URL("../tests/fixtures/README.md", import.meta.url), "utf8");
const commands = readFileSync(new URL("../src/shared/tauri/commands.ts", import.meta.url), "utf8");
const tauriLib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const plan = readFileSync(new URL("../NEXATERM_WORKFLOW_DELIVERY_PLAN.md", import.meta.url), "utf8");
const spec = readFileSync(new URL("../docs/WORKFLOW_SPEC.md", import.meta.url), "utf8");

for (const needle of [
  '"tools.tunnels": { target: "none", capability: "tunnels" }',
  'policy.capability === "tunnels"',
]) {
  if (!registry.includes(needle)) throw new Error(`WF-06A tunnel action registry missing: ${needle}`);
}
for (const needle of [
  '{ id: "tools.tunnels", priority: 4 }',
  '"tools.tunnels": { group: "tools"',
]) {
  if (!presentation.includes(needle)) throw new Error(`WF-06A top tunnel entry missing: ${needle}`);
}
for (const needle of [
  '"local"',
  '"remote"',
  '"dynamic"',
  '"stopped"',
  '"starting"',
  '"running"',
  '"failed"',
  '"credential_required"',
]) {
  if (!types.includes(needle)) throw new Error(`WF-06A existing tunnel contract missing: ${needle}`);
}
for (const needle of [
  'tr("tunnel.kind.local")',
  'tr("tunnel.kind.dynamic")',
  'tr("tunnel.kind.remote")',
  'connection_id: form.connectionId',
  'state.status === "credential_required"',
  'parseHostKeyError(nextError)',
]) {
  if (!panel.includes(needle)) throw new Error(`WF-06A TunnelPanel reuse contract missing: ${needle}`);
}
for (const [key, enPattern, zhPattern] of [
  ["tunnel.kind.local", /Local forwarding/i, /本地转发/],
  ["tunnel.kind.dynamic", /Dynamic SOCKS/i, /动态 SOCKS/],
  ["tunnel.kind.remote", /Remote forwarding/i, /远程转发/],
]) {
  if (!enPattern.test(tunnelLocaleEn[key] || "")) {
    throw new Error(`WF-06A English tunnel locale missing: ${key}`);
  }
  if (!zhPattern.test(tunnelLocaleZh[key] || "")) {
    throw new Error(`WF-06A zh-CN tunnel locale missing: ${key}`);
  }
}
for (const needle of [
  "failed_state_keeps_rule_and_port_conflict_error_context",
  "credential_required_state_keeps_rule_and_prompt_error_context",
  "host_key_failure_stays_failed_with_rule_context_until_user_retries",
  '"tunnel_local_bind_failed"',
  '"credential_prompt_required"',
  '"host_key_unknown"',
]) {
  if (!backend.includes(needle)) throw new Error(`WF-06A tunnel error-state regression missing: ${needle}`);
}
for (const needle of [
  "resolveTunnelRuleConnection",
  'label: "连接不存在"',
  "canStart: false",
]) {
  if (!association.includes(needle)) throw new Error(`WF-06A rule/connection association missing: ${needle}`);
}
for (const needle of [
  "marks an orphan rule unavailable instead of letting Start fail later",
  "uses host and port when the saved connection has no display name",
]) {
  if (!associationTest.includes(needle)) throw new Error(`WF-06A rule association test missing: ${needle}`);
}
for (const needle of [
  "connectionState.label",
  "busy || !connectionState.canStart",
  'tr("tunnel.connectionMissing")',
]) {
  if (!panel.includes(needle)) throw new Error(`WF-06A orphan-rule UI guard missing: ${needle}`);
}
if (!/linked SSH connection no longer exists/i.test(tunnelLocaleEn["tunnel.connectionMissing"] || "")) {
  throw new Error("WF-06A English orphan-rule copy missing.");
}
if (!/关联的 SSH 连接不存在/.test(tunnelLocaleZh["tunnel.connectionMissing"] || "")) {
  throw new Error("WF-06A zh-CN orphan-rule copy missing.");
}
for (const needle of [
  "TunnelConnectionRequest",
  "pub async fn stop_connection(",
  "rules_for_connection(",
  "self.stop_running(&rule.id).await",
  "self.set_state(stopped_state(&rule.id)).await",
  "rules_for_connection_keeps_only_requested_connection",
]) {
  if (!backend.includes(needle)) throw new Error(`WF-06A connection lifecycle backend missing: ${needle}`);
}
for (const needle of [
  'invoke<TunnelRuleWithState[]>("tunnel_stop_connection"',
  "connection_id: connectionId",
]) {
  if (!commands.includes(needle)) throw new Error(`WF-06A frontend stop-connection command missing: ${needle}`);
}
for (const needle of [
  "await tunnelStopConnection(connection.id)",
  "void tunnelStopConnection(connectionId).catch(() => undefined)",
]) {
  if (!shell.includes(needle)) throw new Error(`WF-06A workspace tunnel cleanup missing: ${needle}`);
}
for (const needle of [
  "tunnel_fixture_local_dynamic_remote_real_ssh",
  "local_forward_reaches_real_ssh_target_and_releases_listener",
  "dynamic_socks_reaches_real_ssh_target_and_releases_listener",
  "remote_forward_reaches_local_echo_and_cancel_removes_listener",
  "manager.stop_running(&rule.id).await",
  "request_remote_forward(FIXTURE_HOST, 0)",
  "cancel_remote_forward must remove the server-side listener",
]) {
  if (!fixtureTest.includes(needle)) throw new Error(`WF-06A real tunnel fixture missing: ${needle}`);
}
for (const needle of [
  "tunnel_fixture_local_dynamic_remote_real_ssh",
  "NEXATERM_FIXTURE_TUNNEL_KEY",
  "NEXATERM_FIXTURE_TUNNEL_HOST_KEY",
  "NexaTerm tunnel runtime local/dynamic/remote over real SSH",
]) {
  if (!fixtureOrchestrator.includes(needle)) {
    throw new Error(`WF-06A fixture smoke wiring missing: ${needle}`);
  }
}
for (const needle of [
  'mode === "local"',
  'mode === "socks"',
  'mode === "echo"',
  "SSH-2.0-",
]) {
  if (!fixtureProbe.includes(needle)) throw new Error(`WF-06A manual tunnel probe missing: ${needle}`);
}
for (const needle of [
  "## WF-06 A12 Tunnel Phase",
  "node tests/fixtures/tunnel-probe.mjs local 15422",
  "node tests/fixtures/tunnel-probe.mjs socks 11080 ssh-target 22",
  "A12 remains PENDING",
]) {
  if (!fixtureReadme.includes(needle)) throw new Error(`WF-06A A12 tunnel instructions missing: ${needle}`);
}
if (!tauriLib.includes("tunnels::tunnel_stop_connection")) {
  throw new Error("WF-06A Tauri tunnel_stop_connection command registration missing.");
}
if (!spec.includes("WS-N01") || !spec.includes("连接关闭时的资源生命周期")) {
  throw new Error("WF-06A must remain grounded in WS-N01.");
}
if (!plan.includes("WF-06A 隧道管理") || !plan.includes("不要重做已存在的状态枚举")) {
  throw new Error("WF-06A must reuse the existing tunnel state model.");
}

console.log("WF-06A tunnel entry, lifecycle and real-fixture source gate passed");
