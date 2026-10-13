import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { t as tr, useI18n } from "../../shared/i18n";

import {
  credentialDelete,
  credentialList,
  credentialUpsert,
} from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import type { CredentialProfile, CredentialProfileInput } from "./connectionTypes";

function demoCredentials(): CredentialProfile[] {
  return [
  {
    id: "demo-credential-root-password",
    name: tr("demo.credential.passwordName"),
    username: "root",
    kind: "password",
    password: "",
    notes: tr("demo.credential.notes"),
    created_at: "demo",
    updated_at: "demo",
  },
  {
    id: "demo-credential-cloud-key",
    name: tr("demo.credential.privateKeyName"),
    username: "deploy",
    kind: "private_key",
    private_key_path: "~/.ssh/cloud.pem",
    private_key_passphrase: "",
    notes: tr("demo.credential.notes"),
    created_at: "demo",
    updated_at: "demo",
  },
];
}

export function useCredentials(options: { enabled?: boolean } = {}) {
  const { locale } = useI18n();
  const [credentials, setCredentials] = useState<CredentialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isTauri = hasTauriRuntime();
  const enabled = options.enabled ?? true;
  const live = useRef(true);
  const availability = useRef(enabled);
  const lifecycle = useRef(0);
  const readRevision = useRef(0);
  const mutationPending = useRef(false);
  const pendingReads = useRef(0);
  const reloadAfterMutation = useRef(false);
  const reloadRef = useRef<() => Promise<void>>(async () => {});
  if (availability.current !== enabled) { availability.current = enabled; lifecycle.current += 1; readRevision.current += 1; }
  useEffect(() => { live.current = true; return () => { live.current = false; lifecycle.current += 1; readRevision.current += 1; }; }, []);

  function canApply(epoch: number) { return live.current && availability.current && lifecycle.current === epoch; }
  function beginMutation() {
    if (!live.current || !availability.current) throw Object.assign(new Error(tr("credentials.error.locked")), { code: "vault_locked" });
    if (mutationPending.current) throw Object.assign(new Error(tr("credentials.error.busy")), { code: "credential_operation_in_progress" });
    mutationPending.current = true;
    reloadAfterMutation.current = pendingReads.current > 0;
    readRevision.current += 1;
    return lifecycle.current;
  }
  function finishMutation(epoch: number) {
    mutationPending.current = false;
    if (canApply(epoch)) setLoading(false);
    if (live.current && availability.current && (lifecycle.current !== epoch || reloadAfterMutation.current)) void reloadRef.current();
  }

  const reload = useCallback(async () => {
    const revision = ++readRevision.current;
    const epoch = lifecycle.current;
    if (!live.current) return;
    setLoading(true);
    setError(null);

    if (!availability.current) {
      setCredentials([]);
      setLoading(false);
      return;
    }

    if (!isTauri) {
      setCredentials(demoCredentials());
      setLoading(false);
      return;
    }

    pendingReads.current += 1;
    if (mutationPending.current) reloadAfterMutation.current = true;
    try {
      const profiles = await credentialList();
      if (canApply(epoch) && readRevision.current === revision) setCredentials(profiles.map(metadataOnly));
    } catch (nextError) {
      if (canApply(epoch) && readRevision.current === revision) setError(formatError(nextError));
    } finally {
      pendingReads.current -= 1;
      if (canApply(epoch) && readRevision.current === revision) setLoading(false);
    }
  }, [enabled, isTauri, locale]);
  reloadRef.current = reload;

  useEffect(() => {
    void reload();
  }, [reload]);

  const upsert = useCallback(async (input: CredentialProfileInput) => {
    const epoch = beginMutation();
    try {
      const normalized = normalizeCredentialInput(input);
      const profile = metadataOnly(isTauri ? await credentialUpsert(normalized) : {
        ...normalized, id: normalized.id || `preview-credential-${Date.now()}`,
        name: normalized.name || defaultCredentialName(normalized), created_at: "preview", updated_at: "preview",
      });
      readRevision.current += 1;
      if (canApply(epoch)) { setCredentials((items) => upsertLocal(items, profile)); setLoading(false); }
      return profile;
    } catch (nextError) {
      const error = credentialActionError(nextError);
      if (canApply(epoch)) setError(formatError(error));
      throw error;
    } finally { finishMutation(epoch); }
  }, [isTauri]);

  const remove = useCallback(async (id: string) => {
    const epoch = beginMutation();
    try {
      if (isTauri) await credentialDelete(id);
      readRevision.current += 1;
      if (canApply(epoch)) { setCredentials((items) => items.filter((item) => item.id !== id)); setLoading(false); }
    } catch (nextError) {
      const error = credentialActionError(nextError);
      if (canApply(epoch)) setError(formatError(error));
      throw error;
    } finally { finishMutation(epoch); }
  }, [isTauri]);

  return useMemo(
    () => ({
      credentials: enabled ? credentials : [],
      error: enabled ? error : null,
      loading: enabled && loading,
      reload,
      remove,
      upsert,
    }),
    [credentials, enabled, error, loading, reload, remove, upsert],
  );
}
function normalizeCredentialInput(input: CredentialProfileInput): CredentialProfileInput {
  const trim = (value: string | undefined | null) => value?.trim() || undefined;
  const password = input.password || undefined;
  const privateKeyPassphrase = input.private_key_passphrase || undefined;
  const passwordTouched =
    typeof input.password_touched === "boolean" ? input.password_touched : Boolean(password);
  const privateKeyPassphraseTouched =
    typeof input.private_key_passphrase_touched === "boolean"
      ? input.private_key_passphrase_touched
      : Boolean(privateKeyPassphrase);
  return {
    id: trim(input.id),
    kind: input.kind,
    name: trim(input.name),
    username: trim(input.username),
    notes: trim(input.notes),
    password: input.kind === "password" && passwordTouched ? password : undefined,
    password_touched: input.kind === "password" ? passwordTouched : false,
    private_key_path:
      input.kind === "private_key" ? trim(input.private_key_path) : undefined,
    private_key_passphrase:
      input.kind === "private_key" && privateKeyPassphraseTouched
        ? privateKeyPassphrase
        : undefined,
    private_key_passphrase_touched:
      input.kind === "private_key" ? privateKeyPassphraseTouched : false,
  };
}

function defaultCredentialName(input: CredentialProfileInput) {
  return input.kind === "private_key" ? tr("demo.credential.defaultPrivateKey") : tr("demo.credential.defaultPassword");
}

function upsertLocal(items: CredentialProfile[], profile: CredentialProfile) {
  const index = items.findIndex((item) => item.id === profile.id);
  if (index === -1) {
    return [...items, profile];
  }
  return items.map((item) => (item.id === profile.id ? profile : item));
}

function formatError(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return String(error);
}

function metadataOnly(profile: CredentialProfile): CredentialProfile {
  return { ...profile, password: undefined, private_key_passphrase: undefined };
}

function credentialActionError(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "secret_store_delete_rollback_failed") {
    return { ...error, message: tr("credentials.error.restoreFailed") };
  }
  return error;
}
