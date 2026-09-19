import { describe, expect, it } from "vitest";

import { defaultMcpSettings, isLoopbackHost } from "./mcpSettingsTypes";

// 输入集与 src-tauri/src/mcp.rs 的 loopback_host_detection_matches_sidecar_definition 保持完全一致：
// 前端展示与 sidecar 实际监听必须对同一个 host 给出同一个答案，否则会出现
// 「界面显示 loopback、实际监听 0.0.0.0」这种最危险的不一致。改任一侧用例时必须同步另一侧。
describe("isLoopbackHost（与 Rust is_loopback_host 同义）", () => {
  it.each(["localhost", "127.0.0.1", "::1"])("%s 是 loopback", (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each(["127.0.0.2", "::ffff:127.0.0.1", "0.0.0.0", "192.168.1.10", ""])(
    "%o 不是 loopback",
    (host) => {
      expect(isLoopbackHost(host)).toBe(false);
    },
  );
});

describe("defaultMcpSettings", () => {
  it("默认监听 loopback，且远程暴露未确认", () => {
    expect(isLoopbackHost(defaultMcpSettings.remote_host)).toBe(true);
    expect(defaultMcpSettings.remote_host_stored).toBe(defaultMcpSettings.remote_host);
    expect(defaultMcpSettings.remote_host_downgraded).toBe(false);
    expect(defaultMcpSettings.remote_exposure_acknowledged).toBe(false);
  });

  it("默认关闭远程服务、SSH 操作与危险命令", () => {
    expect(defaultMcpSettings.enabled).toBe(false);
    expect(defaultMcpSettings.remote_enabled).toBe(false);
    expect(defaultMcpSettings.ssh_operations_enabled).toBe(false);
    expect(defaultMcpSettings.allow_dangerous_commands).toBe(false);
    expect(defaultMcpSettings.remote_token).toBeNull();
  });
});
