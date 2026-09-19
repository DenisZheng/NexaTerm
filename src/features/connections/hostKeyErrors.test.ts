import { describe, expect, it } from "vitest";

import { isHostKeyInfo, parseHostKeyError } from "./hostKeyErrors";

// 假数据：host 用保留域名，指纹/公钥用明显的占位串，不含任何真实密钥。
const hostKey = {
  host: "example.invalid",
  port: 22,
  key_algorithm: "ssh-ed25519",
  fingerprint_sha256: "SHA256:test-new-fingerprint",
  public_key: "AAAA-test-public-key-placeholder",
};

describe("parseHostKeyError", () => {
  it("解析 host_key_unknown：决定为 unknown，且没有旧指纹", () => {
    const parsed = parseHostKeyError({
      code: "host_key_unknown",
      details: { kind: "host_key_unknown", host_key: hostKey },
    });

    expect(parsed).toEqual({ decision: "unknown", hostKey, oldFingerprint: null });
  });

  it("解析 host_key_changed：决定为 changed，并携带旧指纹供并排展示", () => {
    const parsed = parseHostKeyError({
      code: "host_key_changed",
      details: {
        kind: "host_key_changed",
        host_key: hostKey,
        old_fingerprint_sha256: "SHA256:test-old-fingerprint",
      },
    });

    expect(parsed).toEqual({
      decision: "changed",
      hostKey,
      oldFingerprint: "SHA256:test-old-fingerprint",
    });
  });

  it("changed 缺少旧指纹时宁可不出确认卡片（返回 null），避免弱化风险提示", () => {
    const parsed = parseHostKeyError({
      code: "host_key_changed",
      details: { kind: "host_key_changed", host_key: hostKey },
    });

    expect(parsed).toBeNull();
  });

  it("code 与 details.kind 不一致时视为契约损坏，返回 null", () => {
    expect(
      parseHostKeyError({
        code: "host_key_changed",
        details: { kind: "host_key_unknown", host_key: hostKey },
      }),
    ).toBeNull();
    expect(
      parseHostKeyError({
        code: "host_key_unknown",
        details: {
          kind: "host_key_changed",
          host_key: hostKey,
          old_fingerprint_sha256: "SHA256:test-old-fingerprint",
        },
      }),
    ).toBeNull();
  });

  it("raw_message 不是结构化数据通道：只有 raw_message 里的 JSON 不会被解析", () => {
    const parsed = parseHostKeyError({
      code: "host_key_changed",
      raw_message: JSON.stringify({
        kind: "host_key_changed",
        host_key: hostKey,
        old_fingerprint_sha256: "SHA256:test-old-fingerprint",
      }),
    });

    expect(parsed).toBeNull();
  });

  it("非 host key 错误码返回 null，即使带了 details", () => {
    expect(
      parseHostKeyError({
        code: "terminal_connect_refused",
        details: { kind: "host_key_unknown", host_key: hostKey },
      }),
    ).toBeNull();
  });

  it("host_key 载荷字段不完整时返回 null", () => {
    const incomplete = {
      host: hostKey.host,
      port: hostKey.port,
      key_algorithm: hostKey.key_algorithm,
      fingerprint_sha256: hostKey.fingerprint_sha256,
    };
    expect(
      parseHostKeyError({
        code: "host_key_unknown",
        details: { kind: "host_key_unknown", host_key: incomplete },
      }),
    ).toBeNull();
  });

  it.each([null, undefined, "host_key_unknown", 42, {}, { code: "host_key_unknown" }])(
    "非对象或缺少 details 的输入 %o 返回 null",
    (input) => {
      expect(parseHostKeyError(input)).toBeNull();
    },
  );
});

describe("isHostKeyInfo", () => {
  it("五个必填字段类型正确时通过", () => {
    expect(isHostKeyInfo(hostKey)).toBe(true);
  });

  it("port 不是数字时拒绝", () => {
    expect(isHostKeyInfo({ ...hostKey, port: "22" })).toBe(false);
  });

  it("缺任一必填字段时拒绝", () => {
    const withoutFingerprint = {
      host: hostKey.host,
      port: hostKey.port,
      key_algorithm: hostKey.key_algorithm,
      public_key: hostKey.public_key,
    };
    expect(isHostKeyInfo(withoutFingerprint)).toBe(false);
  });

  it("null 与非对象拒绝", () => {
    expect(isHostKeyInfo(null)).toBe(false);
    expect(isHostKeyInfo("ssh-ed25519")).toBe(false);
  });
});
