import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import type { SecretVaultStatus } from "../../shared/tauri/commands";

interface SecretVaultGateProps {
  error: string | null;
  loading: boolean;
  masterPasswordEnabled: boolean;
  onRetry: () => Promise<SecretVaultStatus | null>;
  onUnlock: (masterPassword: string) => Promise<SecretVaultStatus | null>;
  status: SecretVaultStatus | null;
  unlocking: boolean;
}

export function SecretVaultGate({
  error,
  loading,
  masterPasswordEnabled,
  onRetry,
  onUnlock,
  status,
  unlocking,
}: SecretVaultGateProps) {
  const { t } = useI18n();
  const [masterPassword, setMasterPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acceptsPassword = masterPasswordEnabled && status !== null;
  const title = !masterPasswordEnabled
    ? t("vault.title.autoUnlockFailed")
    : status === null
      ? t("vault.title.readStatus")
      : status.initialized ? t("vault.title.unlock") : t("vault.title.create");
  const buttonLabel = !masterPasswordEnabled
    ? t("vault.action.retryAuto")
    : status === null
      ? t("vault.action.retryStatus")
      : status.initialized ? t("vault.action.unlock") : t("vault.action.createUnlock");

  useEffect(() => {
    if (!loading && acceptsPassword) {
      inputRef.current?.focus();
    }
  }, [acceptsPassword, loading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || unlocking) {
      return;
    }
    if (!acceptsPassword) {
      await onRetry();
      return;
    }
    const password = masterPassword.trim();
    if (!password) {
      setLocalError(t("vault.error.passwordRequired"));
      return;
    }

    setLocalError(null);
    const nextStatus = await onUnlock(password);
    if (nextStatus?.unlocked) {
      setMasterPassword("");
    }
  }

  return (
    <div className="vault-gate-overlay" role="presentation">
      <form className="vault-gate-panel" onSubmit={handleSubmit} aria-label={title}>
        <header className="vault-gate-head">
          <span className="vault-gate-icon" aria-hidden="true">
            <LockKeyhole className="ui-icon" />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{t("vault.description")}</small>
          </span>
        </header>

        {loading ? (
          <div className="vault-gate-loading" aria-live="polite">
            <Loader2 className="ui-icon spinning" />
            <span>{unlocking ? t("vault.loading.unlock") : t("vault.loading.status")}</span>
          </div>
        ) : acceptsPassword ? (
          <label className="vault-gate-field">
            <span>{t("vault.password")}</span>
            <span className="vault-gate-secret-field">
              <input
                ref={inputRef}
                value={masterPassword}
                type={showPassword ? "text" : "password"}
                autoComplete={status?.initialized ? "current-password" : "new-password"}
                onChange={(event) => setMasterPassword(event.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? t("vault.password.hide") : t("vault.password.show")}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff className="ui-icon" /> : <Eye className="ui-icon" />}
              </button>
            </span>
          </label>
        ) : null}

        <p className="vault-gate-note">
          {!masterPasswordEnabled
            ? t("vault.note.autoUnlock")
            : acceptsPassword
              ? t("vault.note.password")
              : t("vault.note.status")}
        </p>

        {localError || error ? (
          <p className="vault-gate-error" role="alert">
            {localError || error}
          </p>
        ) : null}

        <footer className="vault-gate-actions">
          <button className="primary-button" type="submit" disabled={loading || unlocking}>
            {unlocking ? <Loader2 className="ui-icon spinning" /> : null}
            {buttonLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
