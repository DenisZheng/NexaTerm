import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function read(path) {
  return readFileSync(path, "utf8");
}

test("managed Remote MCP always resolves and persists canonical loopback", () => {
  const backend = read("src-tauri/src/mcp.rs");

  assert.match(backend, /pub const DEFAULT_REMOTE_HOST: &str = "127\.0\.0\.1"/);
  assert.match(
    backend,
    /let remote_host = DEFAULT_REMOTE_HOST\.to_string\(\);[\s\S]*let remote_exposure_acknowledged = false;/,
  );
  assert.match(
    backend,
    /pub fn resolve_effective_remote_host[\s\S]*DEFAULT_REMOTE_HOST\.to_string\(\)/,
  );
  assert.doesNotMatch(backend, /mcp_remote_host_not_acknowledged/);
});

test("MCP sidecar independently rejects non-loopback --host values", () => {
  const sidecar = read("src-tauri/src/bin/mxterm_mcp.rs");

  assert.match(sidecar, /fn validate_http_host/);
  assert.match(sidecar, /!mcp::is_loopback_host\(host\)/);
  assert.match(sidecar, /mcp_remote_host_loopback_only/);
  assert.match(sidecar, /let host = validate_http_host\(&host\)\?/);
  assert.match(sidecar, /TcpListener::bind\(\(host\.as_str\(\), port\)\)/);
  assert.match(sidecar, /if !source\.is_loopback\(\)/);
});

test("settings UI exposes port and SSH tunnel guidance, not LAN bind controls", () => {
  const settings = read("src/features/settings/SettingsView.tsx");
  const en = JSON.parse(read("src/shared/i18n/locales/en.json"));
  const zh = JSON.parse(read("src/shared/i18n/locales/zh-CN.json"));

  assert.match(settings, /value="127\.0\.0\.1"[\s\S]*disabled[\s\S]*readOnly/);
  assert.match(settings, /t\("settings\.mcp\.remote\.description"\)/);
  assert.match(en["settings.mcp.remote.description"], /SSH tunnel/i);
  assert.match(zh["settings.mcp.remote.description"], /跨机器访问只允许通过 SSH 隧道转发/);
  assert.match(settings, /ssh -N -L/);
  assert.doesNotMatch(settings, /setRemoteHostDraft/);
  assert.doesNotMatch(settings, /允许 MCP 服务监听非本机地址/);
  assert.doesNotMatch(settings, /监听局域网地址/);
});
