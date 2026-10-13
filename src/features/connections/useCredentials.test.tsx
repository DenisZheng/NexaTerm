// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { credentialDelete, credentialList, credentialUpsert } from "../../shared/tauri/commands";
import type { CredentialProfile, CredentialProfileInput } from "./connectionTypes";
import { useCredentials } from "./useCredentials";

vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));
vi.mock("../../shared/tauri/commands", () => ({ credentialDelete: vi.fn(), credentialList: vi.fn(), credentialUpsert: vi.fn() }));
const profile: CredentialProfile = { id: "fixture", name: "Fixture", username: "fixture", kind: "password", created_at: "fixture-time", updated_at: "fixture-time" };
const input: CredentialProfileInput = { name: " Fixture ", username: " fixture ", kind: "password", password: " secret-marker ", password_touched: true };
function deferred<T>() {
  let resolve!: (result: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let backend: CredentialProfile[];
const flush = () => act(async () => { await Promise.resolve(); });
beforeEach(() => {
  vi.resetAllMocks(); backend = [profile];
  vi.mocked(credentialList).mockImplementation(async () => [...backend]);
  vi.mocked(credentialDelete).mockImplementation(async (id) => { backend = backend.filter((item) => item.id !== id); });
  vi.mocked(credentialUpsert).mockResolvedValue(profile);
});
afterEach(cleanup);
const setup = () => renderHook(({ enabled }) => useCredentials({ enabled }), { initialProps: { enabled: true } });

describe("credential boundaries", () => {
  it("drops a delayed list after vault availability is disabled", async () => {
    const io = deferred<CredentialProfile[]>(); vi.mocked(credentialList).mockReturnValueOnce(io.promise);
    const h = setup(); h.rerender({ enabled: false });
    await act(async () => { io.resolve([profile]); await io.promise; });
    expect(h.result.current.credentials).toEqual([]); expect(h.result.current.loading).toBe(false);
  });
  it("does not let a list started before delete restore the removed row", async () => {
    const h = setup(); await flush(); const io = deferred<CredentialProfile[]>();
    vi.mocked(credentialList).mockReturnValueOnce(io.promise);
    let read!: Promise<void>; act(() => { read = h.result.current.reload(); });
    await act(() => h.result.current.remove(profile.id));
    await act(async () => { io.resolve([profile]); await read; });
    expect(h.result.current.credentials).toEqual([]); expect(h.result.current.loading).toBe(false);
  });
  it("keeps the record when a referenced credential is rejected", async () => {
    vi.mocked(credentialDelete).mockRejectedValue({ code: "credential_in_use", message: "fixture in use" });
    const h = setup(); await flush();
    await act(async () => { await expect(h.result.current.remove(profile.id)).rejects.toMatchObject({ code: "credential_in_use" }); });
    expect(h.result.current.credentials).toEqual([profile]);
  });
  it("does not enter native mutations while disabled or after unmount", async () => {
    const h = setup(); await flush(); h.rerender({ enabled: false });
    await expect(h.result.current.upsert(input)).rejects.toMatchObject({ code: "vault_locked" });
    await expect(h.result.current.remove(profile.id)).rejects.toMatchObject({ code: "vault_locked" });
    const api = h.result.current; h.unmount(); await expect(api.remove(profile.id)).rejects.toMatchObject({ code: "vault_locked" });
    expect(credentialUpsert).not.toHaveBeenCalled(); expect(credentialDelete).not.toHaveBeenCalled();
  });
  it("preserves exact secrets, trims metadata, and removes secret values from the cache", async () => {
    vi.mocked(credentialUpsert).mockResolvedValue({ ...profile, password: "secret-marker", private_key_passphrase: "phrase-marker" });
    const h = setup(); await flush();
    await act(() => h.result.current.upsert(input));
    expect(credentialUpsert).toHaveBeenCalledWith(expect.objectContaining({ name: "Fixture", username: "fixture", password: " secret-marker ", password_touched: true }));
    expect(JSON.stringify(h.result.current.credentials)).not.toContain("secret-marker");
    expect(JSON.stringify(h.result.current.credentials)).not.toContain("phrase-marker");
  });
  it("preserves exact private-key passphrase and untouched reveal semantics", async () => {
    const h = setup(); await flush();
    await act(() => h.result.current.upsert({ ...input, kind: "private_key", private_key_path: " ~/.ssh/fixture_key ", private_key_passphrase: " phrase-marker ", private_key_passphrase_touched: true }));
    expect(credentialUpsert).toHaveBeenLastCalledWith(expect.objectContaining({ password: undefined, private_key_path: "~/.ssh/fixture_key", private_key_passphrase: " phrase-marker " }));
    await act(() => h.result.current.upsert({ ...input, id: "fixture", password_touched: false }));
    expect(credentialUpsert).toHaveBeenLastCalledWith(expect.objectContaining({ password: undefined, password_touched: false }));
  });
  it("only enters one mutation for same-event repeated submissions", async () => {
    const io = deferred<CredentialProfile>(); vi.mocked(credentialUpsert).mockReturnValue(io.promise);
    const h = setup(); await flush(); let job!: Promise<CredentialProfile>, duplicate!: Promise<CredentialProfile>;
    act(() => { job = h.result.current.upsert(input); duplicate = h.result.current.upsert(input); });
    await expect(duplicate).rejects.toMatchObject({ code: "credential_operation_in_progress" });
    expect(credentialUpsert).toHaveBeenCalledOnce();
    await act(async () => { io.resolve(profile); await job; });
  });
  it("ignores a late upsert while locked and reads fresh data after a new availability cycle", async () => {
    const io = deferred<CredentialProfile>(); vi.mocked(credentialUpsert).mockReturnValue(io.promise);
    const h = setup(); await flush(); let job!: Promise<CredentialProfile>;
    act(() => { job = h.result.current.upsert(input); }); h.rerender({ enabled: false });
    await act(async () => { io.resolve({ ...profile, name: "Changed" }); await job; });
    expect(h.result.current.credentials).toEqual([]);
    backend = [{ ...profile, name: "Backend current" }]; h.rerender({ enabled: true }); await flush();
    expect(h.result.current.credentials[0].name).toBe("Backend current");
  });
  it("cleans up pending reads and supports StrictMode replay", async () => {
    const h = renderHook(() => useCredentials(), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    await flush(); expect(h.result.current.credentials).toEqual([profile]);
    const io = deferred<CredentialProfile[]>(); vi.mocked(credentialList).mockReturnValueOnce(io.promise);
    let job!: Promise<void>; act(() => { job = h.result.current.reload(); }); const before = h.result.current;
    h.unmount(); io.resolve([]); await job; expect(h.result.current).toBe(before);
  });
});
