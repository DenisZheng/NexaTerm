import { describe, expect, it } from "vitest";

import { defaultMcpSettings } from "./mcpSettingsTypes";

describe("defaultMcpSettings", () => {
  it("Remote MCP 固定使用 canonical loopback", () => {
    expect(defaultMcpSettings.remote_host).toBe("127.0.0.1");
    expect(defaultMcpSettings.remote_host_stored).toBe("127.0.0.1");
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
