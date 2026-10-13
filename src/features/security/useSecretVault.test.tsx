// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { secretVaultStatus, secretVaultUnlock, secretVaultUnlockLocal, secretVaultLock, secretVaultEnableMasterPassword, secretVaultDisableMasterPassword, type SecretVaultStatus } from "../../shared/tauri/commands";
import { useSecretVault } from "./useSecretVault";

vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));
vi.mock("../../shared/tauri/commands", () => ({ secretVaultStatus: vi.fn(), secretVaultUnlock: vi.fn(), secretVaultUnlockLocal: vi.fn(), secretVaultLock: vi.fn(), secretVaultEnableMasterPassword: vi.fn(), secretVaultDisableMasterPassword: vi.fn() }));
const unlocked = { initialized: true, unlocked: true }, locked = { initialized: true, unlocked: false };
function deferred() {
  let resolve!: (status: SecretVaultStatus) => void, reject!: (error: unknown) => void;
  const promise = new Promise<SecretVaultStatus>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(secretVaultStatus).mockResolvedValue(unlocked);
  vi.mocked(secretVaultUnlock).mockResolvedValue(unlocked);
  vi.mocked(secretVaultUnlockLocal).mockResolvedValue(unlocked);
  vi.mocked(secretVaultLock).mockResolvedValue(locked);
  vi.mocked(secretVaultEnableMasterPassword).mockResolvedValue(unlocked);
  vi.mocked(secretVaultDisableMasterPassword).mockResolvedValue(unlocked);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Vault lifecycle", () => {
  it("does not send the same password twice in one event", async () => {
    const io = deferred(); vi.mocked(secretVaultUnlock).mockReturnValue(io.promise);
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    let one!: Promise<SecretVaultStatus | null>, two!: Promise<SecretVaultStatus | null>;
    act(() => { one = h.result.current.unlock("fixture-password"); two = h.result.current.unlock("fixture-password"); });
    await flush(); expect(secretVaultUnlock).toHaveBeenCalledTimes(1);
    await act(async () => { io.resolve(unlocked); await Promise.all([one, two]); });
  });
  it("masks availability immediately and runs lock after an already-started unlock", async () => {
    const io = deferred(), lockIO = deferred();
    vi.mocked(secretVaultUnlock).mockReturnValue(io.promise); vi.mocked(secretVaultLock).mockReturnValue(lockIO.promise);
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    let unlockJob!: Promise<SecretVaultStatus | null>, lockJob!: Promise<SecretVaultStatus | null>;
    act(() => { unlockJob = h.result.current.unlock("fixture-password"); }); await flush();
    act(() => { lockJob = h.result.current.lock(); });
    expect(h.result.current.ready).toBe(false); expect(h.result.current.requiresUnlock).toBe(true);
    expect(secretVaultLock).not.toHaveBeenCalled();
    await act(async () => { io.resolve(unlocked); expect(await unlockJob).toBeNull(); });
    expect(secretVaultLock).toHaveBeenCalledOnce(); expect(h.result.current.ready).toBe(false);
    await act(async () => { lockIO.resolve(locked); await lockJob; });
    expect(h.result.current.status).toEqual(locked);
  });
  it("does not let a delayed status query reopen a locked vault", async () => {
    const io = deferred(); vi.mocked(secretVaultStatus).mockResolvedValueOnce(unlocked).mockReturnValueOnce(io.promise);
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    let read!: Promise<SecretVaultStatus | null>, lockJob!: Promise<SecretVaultStatus | null>;
    act(() => { read = h.result.current.refresh(); }); await flush();
    act(() => { lockJob = h.result.current.lock(); });
    await act(async () => { io.resolve(unlocked); await Promise.all([read, lockJob]); });
    expect(h.result.current.ready).toBe(false); expect(h.result.current.status).toEqual(locked);
  });
  it("locks before the first input after a suspended page has exceeded its idle deadline", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 5, masterPasswordEnabled: true })); await flush();
    expect(h.result.current.ready).toBe(true);
    vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));
    fireEvent.keyDown(window, { key: "a" }); await flush();
    expect(secretVaultLock).toHaveBeenCalledOnce(); expect(h.result.current.ready).toBe(false);
  });
  it("skips an unlock not started before lock and rejects duplicate locks", async () => {
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    let jobs!: Promise<unknown>[];
    act(() => { jobs = [h.result.current.unlock("fixture-password"), h.result.current.lock(), h.result.current.lock()]; });
    await act(async () => { await Promise.all(jobs); });
    expect(secretVaultUnlock).not.toHaveBeenCalled(); expect(secretVaultLock).toHaveBeenCalledOnce();
    expect(h.result.current.ready).toBe(false);
  });
  it("keeps a failed unlock locked and allows explicit retry", async () => {
    vi.mocked(secretVaultStatus).mockResolvedValue(locked);
    vi.mocked(secretVaultUnlock).mockRejectedValueOnce(new Error("wrong password"));
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    await act(() => h.result.current.unlock("fixture-wrong"));
    expect(h.result.current.error).toBe("wrong password"); expect(h.result.current.ready).toBe(false);
    await act(() => h.result.current.unlock(" fixture-correct "));
    expect(secretVaultUnlock).toHaveBeenLastCalledWith(" fixture-correct ");
    expect(h.result.current.ready).toBe(true); expect(h.result.current.error).toBeNull();
  });
  it("keeps failed lock availability unknown and retries lock instead of reopening from status", async () => {
    vi.mocked(secretVaultLock).mockRejectedValueOnce(new Error("lock unavailable"));
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    await act(() => h.result.current.lock());
    expect(h.result.current.ready).toBe(false); expect(h.result.current.status).toBeNull();
    expect(h.result.current.error).toBe("lock unavailable");
    await act(() => h.result.current.retry());
    expect(secretVaultLock).toHaveBeenCalledTimes(2); expect(h.result.current.status).toEqual(locked);
  });
  it("discards late unlock failure and prevents new native calls after unmount", async () => {
    const io = deferred(); vi.mocked(secretVaultUnlock).mockReturnValue(io.promise);
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    let job!: Promise<SecretVaultStatus | null>;
    act(() => { job = h.result.current.unlock("fixture-password"); }); await flush();
    const api = h.result.current; h.unmount();
    io.reject(new Error("late failure")); expect(await job).toBeNull();
    expect(await api.unlock("new fixture")).toBeNull(); expect(secretVaultUnlock).toHaveBeenCalledOnce();
  });
  it("does not prompt local native storage after a lock supersedes its initial query", async () => {
    const io = deferred(); vi.mocked(secretVaultStatus).mockReturnValueOnce(io.promise);
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: false })); await flush();
    let job!: Promise<SecretVaultStatus | null>;
    act(() => { job = h.result.current.lock(); });
    await act(async () => { io.resolve(locked); await job; });
    expect(secretVaultUnlockLocal).not.toHaveBeenCalled(); expect(secretVaultLock).toHaveBeenCalledOnce();
  });
  it.each(["enable", "disable"] as const)("reports a completed %s rekey to settings while lock still wins availability", async (kind) => {
    const io = deferred(); vi.mocked(kind === "enable" ? secretVaultEnableMasterPassword : secretVaultDisableMasterPassword).mockReturnValue(io.promise);
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    let rekey!: Promise<SecretVaultStatus | null>, lockJob!: Promise<SecretVaultStatus | null>;
    act(() => { rekey = kind === "enable" ? h.result.current.enableMasterPassword(" fixture-key ") : h.result.current.disableMasterPassword(); }); await flush();
    act(() => { lockJob = h.result.current.lock(); });
    await act(async () => { io.resolve(unlocked); expect(await rekey).toEqual(unlocked); await lockJob; });
    expect(h.result.current.ready).toBe(false); expect(h.result.current.status).toEqual(locked);
  });
  it("holds one slot across enable, disable and unlock attempts", async () => {
    const io = deferred(); vi.mocked(secretVaultEnableMasterPassword).mockReturnValue(io.promise);
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    let job!: Promise<SecretVaultStatus | null>;
    act(() => { job = h.result.current.enableMasterPassword("fixture-key"); void h.result.current.disableMasterPassword(); void h.result.current.unlock("fixture-key"); }); await flush();
    expect(secretVaultEnableMasterPassword).toHaveBeenCalledOnce();
    expect(secretVaultDisableMasterPassword).not.toHaveBeenCalled(); expect(secretVaultUnlock).not.toHaveBeenCalled();
    await act(async () => { io.resolve(unlocked); await job; });
  });
  it("fails closed on a lost status query without claiming a new vault", async () => {
    vi.mocked(secretVaultStatus).mockRejectedValueOnce(new Error("unavailable"));
    const h = renderHook(() => useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled: true })); await flush();
    expect(h.result.current.status).toBeNull(); expect(h.result.current.ready).toBe(false); expect(h.result.current.error).toBe("unavailable");
    await act(() => h.result.current.retry()); expect(h.result.current.ready).toBe(true);
  });
});
