import { readFileSync } from "node:fs";

const session = readFileSync(new URL("../src-tauri/src/terminal/session.rs", import.meta.url), "utf8");
const jumpChain = readFileSync(new URL("../src-tauri/src/terminal/session/jump_chain.rs", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../src/features/connections/ConnectionDialog.tsx", import.meta.url), "utf8");
const appError = readFileSync(new URL("../src-tauri/src/app_error.rs", import.meta.url), "utf8");
const jumpRuntime = readFileSync(new URL("../src/features/connections/jumpRuntime.ts", import.meta.url), "utf8");
const jumpPreview = readFileSync(new URL("../src/features/connections/jumpPlanPreview.ts", import.meta.url), "utf8");
const fixtureCompose = readFileSync(new URL("../tests/fixtures/docker-compose.yml", import.meta.url), "utf8");
const fixtureScript = readFileSync(new URL("../tests/fixtures/fixtures.mjs", import.meta.url), "utf8");
const sessionFixture = readFileSync(new URL("../src-tauri/src/terminal/session/fixture_tests.rs", import.meta.url), "utf8");
const tunnelFixture = readFileSync(new URL("../src-tauri/src/tunnels/fixture_tests.rs", import.meta.url), "utf8");
const plan = readFileSync(new URL("../NEXATERM_WORKFLOW_DELIVERY_PLAN.md", import.meta.url), "utf8");
const spec = readFileSync(new URL("../docs/WORKFLOW_SPEC.md", import.meta.url), "utf8");

if (session.includes("connection_jump_nested_unsupported") || jumpChain.includes("connection_jump_nested_unsupported")) {
  throw new Error("WF-06B must not reject a valid nested two-hop Jump chain.");
}
for (const needle of [
  "const MAX_JUMP_HOPS: usize = 2",
  "resolve_jump_chain_with",
  "connection_jump_cycle",
  "connection_jump_depth_exceeded",
  "chain.reverse()",
  "jump_plan_accepts_two_hops_in_outer_to_inner_connect_order",
  'vec!["jump-002", "jump-001"]',
]) {
  if (!jumpChain.includes(needle)) throw new Error(`WF-06B jump-plan contract missing: ${needle}`);
}
const ownerMatches = session.match(/jump_clients: Vec<SshHandle>/g) || [];
if (ownerMatches.length < 4) {
  throw new Error(`WF-06B expected Terminal/Exec/SFTP/Forward jump-chain owners, found ${ownerMatches.length}`);
}
const ownerCleanupMatches =
  session.match(/disconnect_jump_clients\(&self\.jump_clients\)\.await/g) || [];
if (ownerCleanupMatches.length < 4) {
  throw new Error(
    `WF-06B expected Terminal/Exec/SFTP/Forward owner cleanup seams, found ${ownerCleanupMatches.length}`,
  );
}
for (const needle of [
  "disconnect_jump_clients(&jump_clients).await",
  "for jump_client in jump_clients.iter().rev()",
  "for jump in jump_plan",
  "jump_clients.push(jump_client)",
]) {
  if (!jumpChain.includes(needle)) throw new Error(`WF-06B jump cleanup/owner seam missing: ${needle}`);
}
if (!session.includes("connect_target_client(&context, ssh_config, &config, host_key_handler)")) {
  throw new Error("WF-06B Terminal must use the shared two-hop route.");
}
const contextRouteMatches =
  session.match(/connect_target_client\(context, ssh_config, config, host_key_handler\)/g) || [];
if (contextRouteMatches.length < 3) {
  throw new Error(
    `WF-06B expected Exec/SFTP/Forward shared two-hop routes, found ${contextRouteMatches.length}`,
  );
}
if (!jumpChain.includes("let mut jump_clients: Vec<SshHandle>")) {
  throw new Error("WF-06B jump chain must keep an explicit SshHandle owner type.");
}
if (!dialog.includes('jump.kind === "ssh_jump"')) {
  throw new Error("WF-06B must continue reusing the existing saved-connection Jump model.");
}
for (const needle of ["CredentialPromptRequired", "SshNodeFailure"]) {
  if (!appError.includes(needle)) throw new Error(`WF-06B structured node error contract missing: ${needle}`);
}
for (const needle of [
  "parseCredentialPromptTarget",
  "parseSshNodeFailure",
  "upsertRuntimeCredential",
  "buildRuntimeCredentialRequest",
]) {
  if (!jumpRuntime.includes(needle)) throw new Error(`WF-06B targeted runtime credential seam missing: ${needle}`);
}
for (const needle of [
  "buildJumpPlanPreview",
  "jumpCandidateWouldCycle",
  "connection_jump_depth_exceeded",
  "labels: [...jumps.map(labelForConnection).reverse(), target]",
]) {
  if (!jumpPreview.includes(needle)) throw new Error(`WF-06B dialog jump-plan contract missing: ${needle}`);
}
if (!dialog.includes("实际连接路径：") || !dialog.includes("validateJumpPlanSelection")) {
  throw new Error("WF-06B ConnectionDialog must preview and validate the actual two-hop path.");
}
for (const needle of ["ssh-jump-outer", "ssh-jump-inner", "ssh-multihop-target", "wf06b-edge", "wf06b-target"]) {
  if (!fixtureCompose.includes(needle)) throw new Error(`WF-06B real two-hop fixture topology missing: ${needle}`);
}
for (const needle of ["wf06b_fixture", "NEXATERM_FIXTURE_WF06B_OUTER_HOST_KEY", "NEXATERM_FIXTURE_WF06B_INNER_HOST_KEY", "NEXATERM_FIXTURE_WF06B_TARGET_HOST_KEY"]) {
  if (!fixtureScript.includes(needle)) throw new Error(`WF-06B fixture smoke wiring missing: ${needle}`);
}
for (const needle of ["wf06b_fixture_two_hop_terminal_sftp_and_cleanup", "Jump-1 authentication must fail", "assert_chain_drained"]) {
  if (!sessionFixture.includes(needle)) throw new Error(`WF-06B Terminal/SFTP fixture evidence missing: ${needle}`);
}
for (const needle of ["wf06b_fixture_two_hop_tunnels", "two_hop_local_forward", "two_hop_dynamic_forward", "two_hop_remote_forward"]) {
  if (!tunnelFixture.includes(needle)) throw new Error(`WF-06B tunnel fixture evidence missing: ${needle}`);
}
if (!plan.includes("当前限制或拒绝嵌套不能算多跳完成")) {
  throw new Error("WF-06B must remain grounded in the Delivery Plan multi-hop requirement.");
}
if (!spec.includes("WS-N02") || !spec.includes("每一跳失败能定位到具体节点并释放中间资源")) {
  throw new Error("WF-06B must remain grounded in WS-N02.");
}

console.log("WF-06B two-hop plan, node UX, real Terminal/SFTP/Tunnel fixture and cleanup source gate passed");
