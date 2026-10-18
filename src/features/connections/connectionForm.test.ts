import { describe, expect, it } from "vitest";
import { duplicateFormFromConnection, formFromConnection, normalizeForSubmit } from "./connectionForm";
import { defaultAdvancedConfig, defaultJumpConfig, defaultProxyConfig, defaultRdpConfig, defaultRloginConfig, defaultSerialConfig, defaultTelnetConfig, defaultVncConfig } from "./connectionTypes";
import { normalizeRloginInput } from "./rloginProfile";
import { normalizeConnectionInput } from "./useConnections";
import type { ConnectionProfile, ConnectionProfileInput, CredentialProfile } from "./connectionTypes";

const profile = (): ConnectionProfile => ({
  id: "fixture", name: "Fixture", host: "example.invalid", port: 22, username: "typed-user",
  credential_mode: "prompt", proxy: { ...defaultProxyConfig }, jump: { ...defaultJumpConfig },
  advanced: { ...defaultAdvancedConfig }, is_favorite: true, created_at: "old", updated_at: "old",
  last_connected_at: "recent", remote_os_id: "fixture-os", remote_os_name: "Fixture OS", remote_os_version: "1",
});

describe("Rlogin independent form data", () => {
  const request = (): ConnectionProfileInput => ({ ...mixedForm(), protocol: "rlogin", port: 513, rlogin: { ...defaultRloginConfig, local_address: "127.0.0.1", local_user: "LocalCase" } });
  it("keeps independent users/config/encoding through both actual submit stages", () => {
    const input = request(); input.username = " RemoteCase "; input.rlogin!.local_user = " LocalCase "; input.advanced.terminal_encoding = "big5";
    const before = structuredClone(input);
    const out = normalizeConnectionInput(normalizeForSubmit(input, [credential]));
    expect(out.protocol).toBe("rlogin"); expect(out.username).toBe("RemoteCase"); expect(out.rlogin!.local_user).toBe("LocalCase");
    expect(out.advanced.terminal_encoding).toBe("big5"); expect(out.port).toBe(513); expect(out.credential_mode).toBe("prompt");
    for (const key of ["credential_id", "inline_auth_kind", "inline_password", "prompt_auth_kind", "rdp", "vnc", "telnet", "serial"] as const) expect(out[key]).toBeUndefined();
    expect(out.proxy).toEqual({ kind: "none" }); expect(out.jump).toEqual({ kind: "none" }); expect(input).toEqual(before);
  });
  it("edits and duplicates imported Rlogin without SSH auth defaults or changing protocol", () => {
    const imported: ConnectionProfile = { ...profile(), protocol: "rlogin", rlogin: request().rlogin, advanced: { ...defaultAdvancedConfig, terminal_encoding: "gbk" } };
    const form = formFromConnection(imported); const copy = duplicateFormFromConnection(imported, []);
    expect(form.protocol).toBe("rlogin"); expect(form.inline_auth_kind).toBeUndefined(); expect(form.prompt_auth_kind).toBeUndefined();
    expect(form.rlogin).toEqual(imported.rlogin); expect(copy.rlogin).toEqual(imported.rlogin);
    expect(copy.source_connection_id).toBe(imported.id); expect(copy.id).toBeUndefined(); expect(copy.last_connected_at).toBeUndefined();
  });
  it("never substitutes a different target port or speed for invalid numeric input", () => {
    const input = request(); input.port = 0; input.rlogin!.speed = 0;
    const out = normalizeConnectionInput(normalizeForSubmit(input, [])); expect(out.port).toBe(0); expect(out.rlogin!.speed).toBe(0);
  });
  it("does not carry transient consent/runtime fields or legacy auth through metadata normalization", () => {
    const input = { ...request(), password: "fixture-private", private_key_path: "fixture.key", allow_plaintext: true, reservation_id: "fixture-runtime", rlogin: { ...request().rlogin!, allow_plaintext: true } };
    const out = normalizeRloginInput(input);
    for (const key of ["password", "private_key_path", "allow_plaintext", "reservation_id"]) expect(out).not.toHaveProperty(key);
    expect(out.rlogin).not.toHaveProperty("allow_plaintext");
  });
  it.each(["ssh", "rdp", "vnc", "telnet", "serial"] as const)("clears Rlogin config when submitting active %s", (protocol) => {
    const input = { ...mixedForm(), protocol, rlogin: request().rlogin };
    expect(normalizeConnectionInput(normalizeForSubmit(input, [credential])).rlogin).toBeUndefined();
  });
});
const credential: CredentialProfile = { id: "account", name: "Account", username: "saved-user", kind: "password", created_at: "t", updated_at: "t" };
const mixedForm = (): ConnectionProfileInput => ({
  ...formFromConnection(profile()), protocol: "ssh", credential_mode: "saved", credential_id: "account",
  rdp: structuredClone(defaultRdpConfig), vnc: structuredClone(defaultVncConfig),
  telnet: { ...defaultTelnetConfig }, serial: { ...defaultSerialConfig, port_name: "fixture-port" },
});

describe("existing connection form behavior before Rlogin extension", () => {
  it("keeps legacy SSH auth selection while never filling a secret into the editor", () => {
    const form = formFromConnection({ ...profile(), auth_kind: "private_key", private_key_path: "fixture.key", password: "fixture-private" });
    expect(form.protocol).toBe("ssh"); expect(form.inline_auth_kind).toBe("private_key");
    expect(form.inline_private_key_path).toBe("fixture.key"); expect(form.inline_password).toBe("");
    expect(form.inline_password_touched).toBe(false); expect(form.prompt_auth_kind).toBe("private_key");
  });
  it("copies logical metadata and resets runtime/favorite/system fields", () => {
    const first = duplicateFormFromConnection(profile(), []);
    const second = duplicateFormFromConnection(profile(), [{ ...profile(), name: first.name! }]);
    expect(first.id).toBeUndefined(); expect(first.source_connection_id).toBe("fixture");
    expect(first.is_favorite).toBe(false); expect(first.last_connected_at).toBeUndefined();
    expect(first.remote_os_id).toBeUndefined(); expect(first.remote_os_name).toBeUndefined(); expect(first.remote_os_version).toBeUndefined();
    expect(second.name).not.toBe(first.name); expect(second.name).toMatch(/\(2\)$/);
  });
  it("backfills saved SSH user, preserves source id and removes desktop/character payloads", () => {
    const form = { ...mixedForm(), source_connection_id: "source", port: 0 };
    const before = structuredClone(form); const out = normalizeForSubmit(form, [credential]);
    expect(out.username).toBe("saved-user"); expect(out.port).toBe(22); expect(out.source_connection_id).toBe("source");
    for (const key of ["rdp", "vnc", "telnet", "serial"] as const) expect(out[key]).toBeUndefined();
    expect(form).toEqual(before);
  });
  it.each(["rdp", "vnc"] as const)("preserves %s inline password intent and isolates other configs", (protocol) => {
    const form = { ...mixedForm(), protocol, port: 0, credential_mode: "inline" as const, inline_password: "fixture-private", inline_password_touched: true };
    const out = normalizeForSubmit(form, [credential]);
    expect(out.protocol).toBe(protocol); expect(out.port).toBe(protocol === "rdp" ? 3389 : 5900);
    expect(out.inline_auth_kind).toBe("password"); expect(out.inline_password).toBe("fixture-private"); expect(out.inline_password_touched).toBe(true);
    expect(out[protocol]).toEqual(form[protocol]); expect(out[protocol === "rdp" ? "vnc" : "rdp"]).toBeUndefined();
    expect(out.proxy).toEqual({ kind: "none" }); expect(out.jump).toEqual({ kind: "none" });
    expect(out.telnet).toBeUndefined(); expect(out.serial).toBeUndefined();
  });
  it("keeps Telnet controls and clears SSH credential selections", () => {
    const out = normalizeForSubmit({ ...mixedForm(), protocol: "telnet", port: 0, telnet: { enter_mode: "cr", backspace_mode: "ctrl_h" } }, [credential]);
    expect(out.port).toBe(23); expect(out.username).toBe(""); expect(out.credential_mode).toBe("prompt"); expect(out.credential_id).toBeUndefined();
    expect(out.telnet).toEqual({ enter_mode: "cr", backspace_mode: "ctrl_h" }); expect(out.serial).toBeUndefined();
  });
  it("keeps a Serial device endpoint and its placeholder port", () => {
    const out = normalizeForSubmit({ ...mixedForm(), protocol: "serial" }, [credential]);
    expect(out.host).toBe("fixture-port"); expect(out.port).toBe(1); expect(out.username).toBe("");
    expect(out.serial?.baud_rate).toBe(9600); expect(out.credential_mode).toBe("prompt"); expect(out.telnet).toBeUndefined();
  });
});
