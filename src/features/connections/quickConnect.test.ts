import { describe, expect, it } from "vitest";

import {
  buildTemporaryConnectionProfile,
  isQuickConnectCredentialError,
  parseQuickConnectAddress,
  shouldOfferQuickConnect,
} from "./quickConnect";

describe("WF-02B Quick Connect address parsing", () => {
  it("parses user@host with the default SSH port", () => {
    expect(parseQuickConnectAddress("ops@example.com")).toStrictEqual({
      kind: "valid",
      target: {
        canonicalAddress: "ssh://ops@example.com:22",
        host: "example.com",
        port: 22,
        username: "ops",
      },
    });
  });

  it("parses structured ssh URLs and does not accept URL passwords", () => {
    expect(parseQuickConnectAddress("ssh://ops@example.com:2202")).toMatchObject({
      kind: "valid",
      target: { host: "example.com", port: 2202, username: "ops" },
    });
    expect(parseQuickConnectAddress("ssh://ops:secret@example.com")).toStrictEqual({
      kind: "invalid",
      code: "password",
    });
  });

  it("supports missing usernames and bracketed IPv6", () => {
    expect(parseQuickConnectAddress("ssh://[2001:db8::1]:2222")).toMatchObject({
      kind: "valid",
      target: { host: "2001:db8::1", port: 2222 },
    });
    expect(parseQuickConnectAddress("ops@[2001:db8::1]")).toMatchObject({
      kind: "valid",
      target: { host: "2001:db8::1", port: 22, username: "ops" },
    });
  });

  it("rejects ambiguous raw ports, invalid ranges and shell-like input", () => {
    expect(parseQuickConnectAddress("ops@example.com:2202")).toStrictEqual({
      kind: "invalid",
      code: "address",
    });
    expect(parseQuickConnectAddress("ssh://ops@example.com:65536")).toStrictEqual({
      kind: "invalid",
      code: "port",
    });
    expect(parseQuickConnectAddress("ops@example.com;rm -rf /")).toStrictEqual({
      kind: "invalid",
      code: "address",
    });
  });

  it("offers host-only Quick Connect when saved search has no matches", () => {
    expect(shouldOfferQuickConnect("example.com", 0)).toBe(true);
    expect(shouldOfferQuickConnect("example.com", 2)).toBe(false);
  });

  it("builds a non-persistent prompt profile without secrets", () => {
    const parsed = parseQuickConnectAddress("ops@example.com");
    if (parsed.kind !== "valid") throw new Error("expected valid target");
    expect(buildTemporaryConnectionProfile("opaque-ref", parsed.target)).toMatchObject({
      id: "opaque-ref",
      username: "ops",
      credential_mode: "prompt",
      created_at: "temporary",
    });
    expect(JSON.stringify(buildTemporaryConnectionProfile("opaque-ref", parsed.target))).not.toContain("password");
  });

  it("re-prompts only credential failures", () => {
    expect(isQuickConnectCredentialError("terminal_auth_rejected")).toBe(true);
    expect(isQuickConnectCredentialError("terminal_private_key_invalid")).toBe(true);
    expect(isQuickConnectCredentialError("terminal_connect_timeout")).toBe(false);
  });
});
