import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  secretVaultDisableMasterPassword,
  secretVaultEnableMasterPassword,
  secretVaultLock,
  secretVaultStatus,
  secretVaultUnlock,
  secretVaultUnlockLocal,
  type SecretVaultStatus,
} from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";

const previewStatus: SecretVaultStatus = {
  initialized: true,
  unlocked: true,
};

export function useSecretVault({
  autoLockMinutes,
  masterPasswordEnabled,
}: {
  autoLockMinutes: 0 | 5 | 15 | 30 | 60;
  masterPasswordEnabled: boolean;
}) {
  const isTauri = hasTauriRuntime();
  const canAutoUnlockLocal = isTauri && !masterPasswordEnabled;
  // 未查询成功与确实不存在是两种状态，不能因读取失败提示用户重建保险库。
  const [status, setStatus] = useState<SecretVaultStatus | null>(
    isTauri ? null : previewStatus,
  );
  const [loading, setLoading] = useState(isTauri);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localAutoUnlockAttemptedRef = useRef(false);
  const localUnlockInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!isTauri) {
      setStatus(previewStatus);
      setLoading(false);
      setError(null);
      return previewStatus;
    }

    setLoading(true);
    setError(null);
    try {
      const nextStatus = await secretVaultStatus();
      setStatus(nextStatus);
      return nextStatus;
    } catch (nextError) {
      setError(formatError(nextError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [isTauri]);

  useEffect(() => {
    if (canAutoUnlockLocal) {
      return;
    }
    void refresh();
  }, [canAutoUnlockLocal, refresh]);

  useEffect(() => {
    localAutoUnlockAttemptedRef.current = false;
  }, [isTauri, masterPasswordEnabled]);

  const unlock = useCallback(
    async (masterPassword: string) => {
      if (!isTauri) {
        setStatus(previewStatus);
        return previewStatus;
      }

      setUnlocking(true);
      setError(null);
      try {
        const nextStatus = await secretVaultUnlock(masterPassword);
        setStatus(nextStatus);
        return nextStatus;
      } catch (nextError) {
        setError(formatError(nextError));
        return null;
      } finally {
        setUnlocking(false);
      }
    },
    [isTauri],
  );

  const unlockLocal = useCallback(async () => {
    if (!isTauri) {
      setStatus(previewStatus);
      return previewStatus;
    }

    if (localUnlockInFlightRef.current) {
      return null;
    }
    localUnlockInFlightRef.current = true;
    setUnlocking(true);
    setLoading(true);
    // 重试期间保留错误门禁，避免清空 error 后短暂露出未解锁的工作区。
    try {
      const currentStatus = await secretVaultStatus();
      setStatus(currentStatus);
      const nextStatus = currentStatus.unlocked ? currentStatus : await secretVaultUnlockLocal();
      setStatus(nextStatus);
      setError(null);
      return nextStatus;
    } catch (nextError) {
      setError(formatError(nextError));
      return null;
    } finally {
      localUnlockInFlightRef.current = false;
      setUnlocking(false);
      setLoading(false);
    }
  }, [isTauri]);

  useEffect(() => {
    if (!canAutoUnlockLocal || localAutoUnlockAttemptedRef.current) {
      return;
    }
    localAutoUnlockAttemptedRef.current = true;
    void unlockLocal();
  }, [canAutoUnlockLocal, unlockLocal]);

  const lock = useCallback(async () => {
    if (!isTauri) {
      setStatus(previewStatus);
      return previewStatus;
    }

    setError(null);
    try {
      const nextStatus = await secretVaultLock();
      setStatus(nextStatus);
      return nextStatus;
    } catch (nextError) {
      setError(formatError(nextError));
      return null;
    }
  }, [isTauri]);

  useEffect(() => {
    if (
      !isTauri ||
      canAutoUnlockLocal ||
      masterPasswordEnabled ||
      loading ||
      unlocking ||
      status?.unlocked ||
      localAutoUnlockAttemptedRef.current
    ) {
      return;
    }
    localAutoUnlockAttemptedRef.current = true;
    void unlockLocal();
  }, [
    canAutoUnlockLocal,
    isTauri,
    loading,
    masterPasswordEnabled,
    status?.unlocked,
    unlockLocal,
    unlocking,
  ]);

  useEffect(() => {
    if (!isTauri || !masterPasswordEnabled || !status?.unlocked || autoLockMinutes === 0) {
      return;
    }

    let timer = window.setTimeout(() => {
      void lock();
    }, autoLockMinutes * 60 * 1000);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void lock();
      }, autoLockMinutes * 60 * 1000);
    };
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("pointerdown", resetTimer);
    window.addEventListener("wheel", resetTimer);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("pointerdown", resetTimer);
      window.removeEventListener("wheel", resetTimer);
    };
  }, [autoLockMinutes, isTauri, lock, masterPasswordEnabled, status?.unlocked]);

  const enableMasterPassword = useCallback(
    async (masterPassword: string) => {
      if (!isTauri) {
        setStatus(previewStatus);
        return previewStatus;
      }

      setUnlocking(true);
      setError(null);
      try {
        const nextStatus = await secretVaultEnableMasterPassword(masterPassword);
        setStatus(nextStatus);
        return nextStatus;
      } catch (nextError) {
        setError(formatError(nextError));
        return null;
      } finally {
        setUnlocking(false);
      }
    },
    [isTauri],
  );

  const disableMasterPassword = useCallback(async () => {
    if (!isTauri) {
      setStatus(previewStatus);
      return previewStatus;
    }

    setUnlocking(true);
    setError(null);
    try {
      const nextStatus = await secretVaultDisableMasterPassword();
      setStatus(nextStatus);
      return nextStatus;
    } catch (nextError) {
      setError(formatError(nextError));
      return null;
    } finally {
      setUnlocking(false);
    }
  }, [isTauri]);

  return useMemo(
    () => ({
      disableMasterPassword,
      enableMasterPassword,
      error,
      loading,
      lock,
      ready: !isTauri || Boolean(status?.unlocked),
      requiresUnlock: isTauri && !status?.unlocked && (masterPasswordEnabled || Boolean(error)),
      refresh,
      retry: canAutoUnlockLocal ? unlockLocal : refresh,
      status,
      unlock,
      unlocking,
    }),
    [
      canAutoUnlockLocal,
      disableMasterPassword,
      enableMasterPassword,
      error,
      isTauri,
      loading,
      lock,
      masterPasswordEnabled,
      refresh,
      status,
      unlock,
      unlockLocal,
      unlocking,
    ],
  );
}

function formatError(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return String(error);
}
