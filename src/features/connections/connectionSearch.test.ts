import { expect, it } from "vitest";
import { buildConnectionSearchEntries } from "./connectionSearch";
import { buildTemporaryConnectionProfile } from "./quickConnect";
import { defaultAdvancedConfig, type ConnectionProfile } from "./connectionTypes";

// 从旧 source gate 保留的真实搜索回归，使用 Vitest 加载现有 i18n 模块。
it("sorts recent sessions and searches across name, group, address, port and OS", () => {
  const connections: ConnectionProfile[] = [
    {
      ...buildTemporaryConnectionProfile("fixture", { host: "example.invalid", port: 22, canonicalAddress: "ssh://example.invalid:22" }),
      protocol: "ssh" as const,
      advanced: {
        ...defaultAdvancedConfig,
        auth_timeout_ms: 45000,
        connect_timeout_ms: 30000,
        keepalive_interval_ms: 20000,
        terminal_encoding: "utf-8",
      },
      created_at: "2026-06-01T00:00:00Z",
      credential_mode: "inline",
      group: "生产",
      host: "10.10.10.8",
      id: "prod-db",
      inline_auth_kind: "password",
      is_favorite: false,
      last_connected_at: "2026-06-18T12:00:00Z",
      name: "生产数据库",
      notes: "mysql 主库",
      port: 22,
      remote_os_name: "Ubuntu",
      remote_os_version: "22.04",
      updated_at: "2026-06-18T12:00:00Z",
      username: "root",
    },
    {
      ...buildTemporaryConnectionProfile("fixture", { host: "example.invalid", port: 22, canonicalAddress: "ssh://example.invalid:22" }),
      protocol: "ssh" as const,
      advanced: {
        ...defaultAdvancedConfig,
        auth_timeout_ms: 45000,
        connect_timeout_ms: 30000,
        keepalive_interval_ms: 20000,
        terminal_encoding: "utf-8",
      },
      created_at: "2026-06-02T00:00:00Z",
      credential_mode: "inline",
      group: "测试",
      host: "172.16.0.21",
      id: "test-api",
      inline_auth_kind: "password",
      is_favorite: true,
      last_connected_at: "2026-06-19T09:00:00Z",
      name: "测试 API",
      notes: "灰度入口",
      port: 2202,
      remote_os_name: "Debian",
      remote_os_version: "12",
      updated_at: "2026-06-19T09:00:00Z",
      username: "deploy",
    },
    {
      ...buildTemporaryConnectionProfile("fixture", { host: "example.invalid", port: 22, canonicalAddress: "ssh://example.invalid:22" }),
      protocol: "ssh" as const,
      advanced: {
        ...defaultAdvancedConfig,
        auth_timeout_ms: 45000,
        connect_timeout_ms: 30000,
        keepalive_interval_ms: 20000,
        terminal_encoding: "utf-8",
      },
      created_at: "2026-06-03T00:00:00Z",
      credential_mode: "inline",
      group: "生产",
      host: "10.10.10.9",
      id: "prod-api",
      inline_auth_kind: "password",
      is_favorite: false,
      last_connected_at: null,
      name: "生产 API",
      notes: "后端服务",
      port: 22,
      remote_os_name: "CentOS",
      remote_os_version: "7",
      updated_at: "2026-06-03T00:00:00Z",
      username: "app",
    },
  ];

  expect(buildConnectionSearchEntries(connections, "").map((entry) => entry.connection.id)).toEqual(["test-api", "prod-db", "prod-api"]);

  expect(buildConnectionSearchEntries(connections, "生产 api").map((entry) => entry.connection.id)).toEqual(["prod-api"]);

  const portMatch = buildConnectionSearchEntries(connections, "deploy 2202");
  expect(portMatch).toHaveLength(1);
  expect(portMatch[0].connection.id).toBe("test-api");

  const osMatch = buildConnectionSearchEntries(connections, "ubuntu 22.04");
  expect(osMatch).toHaveLength(1);
  expect(osMatch[0].connection.id).toBe("prod-db");

});
