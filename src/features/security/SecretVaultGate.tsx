import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";

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
  const [masterPassword, setMasterPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acceptsPassword = masterPasswordEnabled && status !== null;
  const title = !masterPasswordEnabled
    ? "无法自动解锁保险库"
    : status === null
      ? "读取保险库状态"
      : status.initialized ? "解锁加密保险库" : "创建加密保险库";
  const buttonLabel = !masterPasswordEnabled
    ? "重试自动解锁"
    : status === null
      ? "重试读取状态"
      : status.initialized ? "解锁" : "创建并解锁";

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
      setLocalError("请输入安全密码。");
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
            <small>保存的 SSH 密码和私钥口令会写入本机加密文件。</small>
          </span>
        </header>

        {loading ? (
          <div className="vault-gate-loading" aria-live="polite">
            <Loader2 className="ui-icon spinning" />
            <span>{unlocking ? "正在解锁保险库，请留意系统授权窗口..." : "正在读取保险库状态..."}</span>
          </div>
        ) : acceptsPassword ? (
          <label className="vault-gate-field">
            <span>安全密码</span>
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
                aria-label={showPassword ? "隐藏安全密码" : "显示安全密码"}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff className="ui-icon" /> : <Eye className="ui-icon" />}
              </button>
            </span>
          </label>
        ) : null}

        <p className="vault-gate-note">
          {!masterPasswordEnabled
            ? "当前使用本机自动解锁，无需创建安全密码。如系统请求凭据访问，请在系统窗口中授权后重试。"
            : acceptsPassword
              ? "忘记安全密码后无法恢复已保存的密码和口令。"
              : "尚未确认保险库状态，请重试读取。"}
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
