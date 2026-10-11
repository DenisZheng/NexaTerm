import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocalePreference, type Locale } from "../../shared/i18n";

import type { TunnelRule } from "./tunnelTypes";
import { resolveTunnelRuleConnection } from "./tunnelRuleConnectionState";

const rule: TunnelRule = {
  id: "rule-a",
  name: "Local app",
  kind: "local",
  connection_id: "ssh-a",
  local_host: "127.0.0.1",
  local_port: 15432,
  remote_host: "127.0.0.1",
  remote_port: 5432,
  auto_start: false,
  created_at: "2026-10-03",
  updated_at: "2026-10-03",
};

// 本文件断言英文文案：固定 locale，避免随宿主机系统语言（如 zh-CN）变化而失败。
let previousLocale: Locale;
beforeEach(() => { previousLocale = getLocale(); setLocalePreference("en"); });
afterEach(() => { setLocalePreference(previousLocale); });

describe("WF-06A tunnel rule connection association", () => {
  it("resolves the saved SSH connection used by the rule", () => {
    expect(resolveTunnelRuleConnection(rule, [{
      id: "ssh-a",
      name: "Production DB",
      host: "10.0.0.10",
      port: 22,
    }])).toEqual({
      canStart: true,
      connection: {
        id: "ssh-a",
        name: "Production DB",
        host: "10.0.0.10",
        port: 22,
      },
      label: "Production DB",
    });
  });

  it("marks an orphan rule unavailable instead of letting Start fail later", () => {
    expect(resolveTunnelRuleConnection(rule, [])).toEqual({
      canStart: false,
      connection: null,
      label: "The linked SSH connection no longer exists",
    });
  });

  it("uses host and port when the saved connection has no display name", () => {
    expect(resolveTunnelRuleConnection(rule, [{
      id: "ssh-a",
      name: "",
      host: "example.internal",
      port: 2222,
    }]).label).toBe("example.internal:2222");
  });
});
