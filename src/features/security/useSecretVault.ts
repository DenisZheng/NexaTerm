import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { secretVaultDisableMasterPassword, secretVaultEnableMasterPassword, secretVaultLock, secretVaultStatus, secretVaultUnlock, secretVaultUnlockLocal, type SecretVaultStatus } from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { createSecretVaultOperations, type VaultOperationKind } from "./secretVaultOperations";
import { useVaultIdleLock } from "./useVaultIdleLock";

const previewStatus: SecretVaultStatus = { initialized: true, unlocked: true };

export function useSecretVault({ autoLockMinutes, masterPasswordEnabled }: { autoLockMinutes: 0 | 5 | 15 | 30 | 60; masterPasswordEnabled: boolean }) {
  const isTauri = hasTauriRuntime();
  const canAutoUnlockLocal = isTauri && !masterPasswordEnabled;
  const [status, setStatus] = useState<SecretVaultStatus | null>(isTauri ? null : previewStatus);
  const [error, setError] = useState<string | null>(null);
  const [operations] = useState(createSecretVaultOperations);
  const [activity, setActivity] = useState({ reading: isTauri, mutation: null as VaultOperationKind | null });
  const localAutoUnlockAttemptedRef = useRef(false);
  const failedLockRef = useRef(false);
  const modeRef = useRef(masterPasswordEnabled);
  modeRef.current = masterPasswordEnabled;
  const deferredRefreshRef = useRef(false);
  const autoUnlockConfigRef = useRef<string | null>(null);
  const loading = activity.reading || activity.mutation === "local" || activity.mutation === "lock";
  const unlocking = activity.mutation !== null;

  useEffect(() => {
    operations.activate();
    return () => operations.suspend();
  }, [operations]);

  const execute = useCallback(async (kind: VaultOperationKind, request: (isCurrent: () => boolean) => Promise<SecretVaultStatus | null>) => {
    if (!isTauri) { setStatus(previewStatus); setError(null); setActivity({ reading: false, mutation: null }); return previewStatus; }
    const operation = operations.begin(kind);
    if (!operation) return null;
    if (kind === "local") localAutoUnlockAttemptedRef.current = true;
    if (kind === "lock") { setStatus(null); failedLockRef.current = true; }
    // local 重试成功前保持原错误门禁，避免短暂露出工作区。
    if (kind !== "local") setError(null);
    setActivity(operations.activity());
    try {
      const result = await operations.run(operation, () => request(() => operations.isCurrent(operation)));
      const current = operations.isCurrent(operation) && !(kind === "local" && modeRef.current);
      if (result && current) { setStatus(result); setError(null); failedLockRef.current = false; }
      // 已完成的 rekey 必须通知 settings 真实模式；lock 仍优先决定 UI availability。
      return current || kind === "enable" || kind === "disable" ? result : null;
    } catch (nextError) {
      if (operations.isCurrent(operation)) {
        if (kind === "refresh") setStatus(null);
        setError(formatError(nextError));
      }
      return null;
    } finally {
      const finished = operations.finish(operation);
      if (finished && operations.isActive()) setActivity(operations.activity());
    }
  }, [isTauri, operations]);

  const refresh = useCallback(() => execute("refresh", () => secretVaultStatus()), [execute]);
  const unlock = useCallback((password: string) => execute("unlock", () => secretVaultUnlock(password)), [execute]);
  const unlockLocal = useCallback(() => execute("local", async (isCurrent) => {
    const current = await secretVaultStatus();
    if (modeRef.current || !isCurrent()) return null;
    return current.unlocked ? current : secretVaultUnlockLocal();
  }), [execute, operations]);
  const lock = useCallback(() => execute("lock", () => secretVaultLock()), [execute]);
  const enableMasterPassword = useCallback((password: string) => execute("enable", () => secretVaultEnableMasterPassword(password)), [execute]);
  const disableMasterPassword = useCallback(() => execute("disable", () => secretVaultDisableMasterPassword()), [execute]);

  useEffect(() => {
    const config = `${isTauri}:${masterPasswordEnabled}`;
    if (autoUnlockConfigRef.current !== config) localAutoUnlockAttemptedRef.current = false;
    autoUnlockConfigRef.current = config;
  }, [isTauri, masterPasswordEnabled]);
  useEffect(() => {
    if (canAutoUnlockLocal) { deferredRefreshRef.current = false; return; }
    if (operations.hasMutation()) { deferredRefreshRef.current = true; return; }
    deferredRefreshRef.current = false;
    void refresh();
  }, [canAutoUnlockLocal, operations, refresh]);
  useEffect(() => {
    if (deferredRefreshRef.current && !unlocking && !operations.hasMutation()) {
      deferredRefreshRef.current = false;
      void refresh();
    }
  }, [operations, refresh, unlocking]);
  useEffect(() => {
    if (canAutoUnlockLocal && !localAutoUnlockAttemptedRef.current && !operations.hasMutation()) void unlockLocal();
  }, [canAutoUnlockLocal, operations, unlockLocal, unlocking]);

  useVaultIdleLock({ enabled: isTauri && masterPasswordEnabled && Boolean(status?.unlocked), minutes: autoLockMinutes, onLock: lock });
  return useMemo(() => ({
    disableMasterPassword, enableMasterPassword, error, loading, lock,
    ready: !isTauri || Boolean(status?.unlocked),
    requiresUnlock: isTauri && !status?.unlocked && (masterPasswordEnabled || Boolean(error)),
    refresh, retry: failedLockRef.current ? lock : canAutoUnlockLocal ? unlockLocal : refresh,
    status, unlock, unlocking,
  }), [canAutoUnlockLocal, disableMasterPassword, enableMasterPassword, error, isTauri, loading, lock, masterPasswordEnabled, refresh, status, unlock, unlockLocal, unlocking]);
}

function formatError(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}
