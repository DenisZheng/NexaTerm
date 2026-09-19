import { describe, expect, it } from "vitest";

import {
  connectionNetworkKind,
  errorDiagnosticId,
  isConnectTimeoutCode,
  isConnectionStageError,
  type ConnectionNetworkKind,
} from "./connectionErrorCodes";

const networkKindCases: Array<[string, ConnectionNetworkKind]> = [
  ["terminal_connect_timeout", "timeout"],
  ["terminal_tcp_connect_refused", "refused"],
  ["remote_exec_connect_unreachable", "unreachable"],
  ["remote_sftp_connect_reset", "reset"],
  ["jump_connect_timeout", "timeout"],
  ["proxy_connect_refused", "refused"],
];

describe("connectionNetworkKind", () => {
  it.each(networkKindCases)("稳定 code %s 映射为 %s", (code, kind) => {
    expect(connectionNetworkKind(code)).toBe(kind);
  });

  it.each([
    "terminal_auth_timeout",
    "terminal_connect_failed",
    "host_key_changed",
    "vault_locked",
    "",
  ])("非网络层分类 code %o 返回 null", (code) => {
    expect(connectionNetworkKind(code)).toBeNull();
  });
});

describe("isConnectionStageError", () => {
  it.each([
    "terminal_connect_timeout",
    "terminal_connect_failed",
    "terminal_tcp_connect_failed",
    "remote_exec_connect_failed",
    "tunnel_ssh_connect_failed",
    "remote_sftp_connect_failed",
    "jump_connect_failed",
    "proxy_auth_rejected",
  ])("建链阶段 code %s 判定为连接阶段失败", (code) => {
    expect(isConnectionStageError(code)).toBe(true);
  });

  it.each(["terminal_auth_timeout", "terminal_pty_failed", "host_key_changed", "vault_unlock_failed"])(
    "认证/通道/密钥阶段 code %s 不算连接阶段失败",
    (code) => {
      expect(isConnectionStageError(code)).toBe(false);
    },
  );
});

describe("isConnectTimeoutCode", () => {
  it("只认 *_connect_timeout，不再匹配操作系统文本", () => {
    expect(isConnectTimeoutCode("terminal_connect_timeout")).toBe(true);
    expect(isConnectTimeoutCode("terminal_auth_timeout")).toBe(false);
    expect(isConnectTimeoutCode("connection timed out")).toBe(false);
  });
});

describe("errorDiagnosticId", () => {
  it("读取字符串 diagnostic_id", () => {
    expect(errorDiagnosticId({ code: "x", diagnostic_id: "diag-test-0001" })).toBe("diag-test-0001");
  });

  it.each([null, undefined, "diag", { code: "x" }, { diagnostic_id: 42 }])(
    "缺失或非字符串输入 %o 返回空串",
    (input) => {
      expect(errorDiagnosticId(input)).toBe("");
    },
  );
});
