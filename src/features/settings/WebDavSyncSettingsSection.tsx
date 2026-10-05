import { useEffect, useState, type FormEvent } from "react";
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Wifi,
} from "lucide-react";

import { useI18n, type Translate } from "../../shared/i18n";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { usernameInputAttributes } from "../../shared/ui/inputAttributes";
import {
  webdavDownloadSnapshot,
  webdavFetchRemoteInfo,
  webdavSettingsGet,
  webdavSettingsSave,
  webdavTestConnection,
  webdavUploadSnapshot,
} from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { SettingsRow, SettingsToggle } from "./SettingsControls";
import type {
  WebDavRemoteInfo,
  WebDavSettings,
  WebDavSettingsInput,
  WebDavSyncResult,
} from "./webdavSyncTypes";

type WebDavBusyAction = "load" | "save" | "test" | "remote" | "upload" | "download" | null;
type WebDavConfirmAction = "upload" | "download" | null;

interface WebDavSyncFormState {
  enabled: boolean;
  base_url: string;
  username: string;
  password: string;
  password_touched: boolean;
  remote_root: string;
  profile: string;
}

export function WebDavSyncSettingsSection() {
  const { locale, t } = useI18n();
  const [settings, setSettings] = useState<WebDavSettings | null>(null);
  const [form, setForm] = useState<WebDavSyncFormState>(() =>
    formFromSettings(previewWebDavSettings()),
  );
  const [syncPassword, setSyncPassword] = useState("");
  const [remoteInfo, setRemoteInfo] = useState<WebDavRemoteInfo | null>(null);
  const [busyAction, setBusyAction] = useState<WebDavBusyAction>(null);
  const [confirmAction, setConfirmAction] = useState<WebDavConfirmAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWebDavPassword, setShowWebDavPassword] = useState(false);
  const [showSyncPassword, setShowSyncPassword] = useState(false);
  const runtimeAvailable = hasTauriRuntime();
  const busy = busyAction !== null;
  const passwordStatus = form.password_touched
    ? form.password.trim()
      ? t("settings.sync.password.willUpdate")
      : t("settings.sync.password.willClear")
    : settings?.password_saved
      ? t("settings.sync.password.saved")
      : t("settings.sync.password.notSaved");

  useEffect(() => {
    let disposed = false;

    async function load() {
      setBusyAction("load");
      setError(null);
      try {
        const loaded = runtimeAvailable ? await webdavSettingsGet() : previewWebDavSettings();
        if (disposed) {
          return;
        }
        setSettings(loaded);
        setForm(formFromSettings(loaded));
      } catch (nextError) {
        if (!disposed) {
          setError(formatWebDavError(nextError));
        }
      } finally {
        if (!disposed) {
          setBusyAction(null);
        }
      }
    }

    void load();
    return () => {
      disposed = true;
    };
  }, [runtimeAvailable]);

  async function runAction<T>(action: Exclude<WebDavBusyAction, null>, task: () => Promise<T>) {
    setBusyAction(action);
    setError(null);
    setMessage(null);
    try {
      return await task();
    } catch (nextError) {
      setError(formatWebDavError(nextError));
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runtimeAvailable) {
      setError(t("settings.sync.error.saveDesktop"));
      return;
    }

    const saved = await runAction("save", () => webdavSettingsSave(formToInput(form)));
    if (saved) {
      setSettings(saved);
      setForm(formFromSettings(saved));
      setMessage(t("settings.sync.message.saved"));
    }
  }

  async function testConnection() {
    if (!runtimeAvailable) {
      setError(t("settings.sync.error.testDesktop"));
      return;
    }

    const result = await runAction("test", () => webdavTestConnection(formToInput(form)));
    if (result?.ok) {
      setMessage(result.message || t("settings.sync.message.testOk"));
    }
  }

  async function fetchRemoteInfo() {
    if (!runtimeAvailable) {
      setError(t("settings.sync.error.readDesktop"));
      return;
    }

    const result = await runAction("remote", () => webdavFetchRemoteInfo());
    if (result) {
      setRemoteInfo(result);
      setMessage(remoteInfoMessage(result, t));
    }
  }

  async function confirmUpload() {
    if (!runtimeAvailable) {
      setError(t("settings.sync.error.uploadDesktop"));
      return;
    }

    const result = await runAction("upload", () =>
      webdavUploadSnapshot({
        sync_password: trimmedOrNull(syncPassword),
      }),
    );
    if (result) {
      setMessage(syncResultMessage(result, t));
      setRemoteInfo(null);
    }
  }

  async function confirmDownload() {
    if (!runtimeAvailable) {
      setError(t("settings.sync.error.downloadDesktop"));
      return;
    }

    const result = await runAction("download", () =>
      webdavDownloadSnapshot({
        sync_password: trimmedOrNull(syncPassword),
      }),
    );
    if (result) {
      setMessage(syncResultMessage(result, t));
      setRemoteInfo(null);
    }
  }

  return (
    <section className="settings-page-section webdav-sync-section">
      <header className="settings-section-head settings-section-head-row">
        <span>
          <h1>{t("settings.sync.title")}</h1>
          <p>{t("settings.sync.description")}</p>
        </span>
        <span className={`webdav-sync-state ${form.enabled ? "enabled" : ""}`}>
          {busyAction === "load" ? t("settings.sync.status.loading") : form.enabled ? t("settings.sync.status.enabled") : t("settings.sync.status.disabled")}
        </span>
      </header>

      <form className="settings-panel webdav-sync-panel" onSubmit={submitSettings}>
        <SettingsRow
          className="webdav-sync-enable-row"
          icon={Cloud}
          title={t("settings.sync.toggle.title")}
          description={t("settings.sync.toggle.description")}
        >
          <SettingsToggle
            checked={form.enabled}
            label={t("settings.sync.toggle.label")}
            onChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
          />
        </SettingsRow>

        <div className="webdav-sync-fields">
          <label className="credential-field credential-field-full">
            <span>{t("settings.sync.field.server")}</span>
            <input
              className="settings-input"
              value={form.base_url}
              placeholder="https://dav.example.com/remote.php/dav/files/user"
              spellCheck={false}
              onChange={(event) => {
                const value = event.target?.value;
                if (value !== undefined) {
                  setForm((current) => ({ ...current, base_url: value }));
                }
              }}
            />
          </label>

          <label className="credential-field">
            <span>{t("settings.sync.field.username")}</span>
            <input
              className="settings-input"
              {...usernameInputAttributes}
              value={form.username}
              autoComplete="username"
              onChange={(event) => {
                const value = event.target?.value;
                if (value !== undefined) {
                  setForm((current) => ({ ...current, username: value }));
                }
              }}
            />
          </label>

          <label className="credential-field">
            <span>{t("settings.sync.field.password", { status: passwordStatus })}</span>
            <div className="credential-secret-field">
              <LockKeyhole className="ui-icon" aria-hidden="true" />
              <input
                type={showWebDavPassword ? "text" : "password"}
                value={form.password}
                autoComplete="current-password"
                placeholder={settings?.password_saved ? t("settings.sync.password.keepPlaceholder") : t("settings.sync.password.inputPlaceholder")}
                onChange={(event) => {
                  const value = event.target?.value;
                  if (value !== undefined) {
                    setForm((current) => ({
                      ...current,
                      password: value,
                      password_touched: true,
                    }));
                  }
                }}
              />
              <button
                type="button"
                aria-label={showWebDavPassword ? t("settings.sync.password.hide") : t("settings.sync.password.show")}
                onClick={() => setShowWebDavPassword((value) => !value)}
              >
                {showWebDavPassword ? (
                  <EyeOff className="ui-icon" aria-hidden="true" />
                ) : (
                  <Eye className="ui-icon" aria-hidden="true" />
                )}
              </button>
            </div>
          </label>

          <label className="credential-field">
            <span>{t("settings.sync.field.remoteRoot")}</span>
            <input
              className="settings-input"
              value={form.remote_root}
              spellCheck={false}
              onChange={(event) => {
                const value = event.target?.value;
                if (value !== undefined) {
                  setForm((current) => ({ ...current, remote_root: value }));
                }
              }}
            />
          </label>

          <label className="credential-field">
            <span>{t("settings.sync.field.profile")}</span>
            <input
              className="settings-input"
              value={form.profile}
              spellCheck={false}
              onChange={(event) => {
                const value = event.target?.value;
                if (value !== undefined) {
                  setForm((current) => ({ ...current, profile: value }));
                }
              }}
            />
          </label>
        </div>

        <footer className="credential-form-actions webdav-sync-actions">
          <span className="webdav-sync-action-note">
            {runtimeAvailable ? t("settings.sync.note.ready") : t("settings.sync.note.desktop")}
          </span>
          <div>
            <button
              type="button"
              disabled={busy || !runtimeAvailable}
              onClick={() => void testConnection()}
            >
              <Wifi className="ui-icon" aria-hidden="true" />
              {busyAction === "test" ? t("settings.sync.action.testing") : t("settings.sync.action.test")}
            </button>
            <button className="primary-button" type="submit" disabled={busy || !runtimeAvailable}>
              <Save className="ui-icon" aria-hidden="true" />
              {busyAction === "save" ? t("settings.sync.action.saving") : t("settings.sync.action.save")}
            </button>
          </div>
        </footer>
      </form>

      <div className="webdav-sync-grid">
        <section className="settings-panel webdav-sync-card" aria-label={t("settings.sync.remote.aria")}>
          <header className="local-terminal-panel-head">
            <span>
              <strong>{t("settings.sync.remote.title")}</strong>
              <small>{remoteInfo ? remoteInfoSummary(remoteInfo, t, locale) : t("settings.sync.remote.manifestHint")}</small>
            </span>
            <button
              className="settings-action-button"
              type="button"
              disabled={busy || !runtimeAvailable}
              onClick={() => void fetchRemoteInfo()}
            >
              <RefreshCw className="ui-icon" aria-hidden="true" />
              {busyAction === "remote" ? t("settings.sync.remote.loading") : t("settings.sync.remote.read")}
            </button>
          </header>

          {remoteInfo ? (
            <div className="webdav-remote-info">
              <div className="webdav-remote-summary">
                <span className={`webdav-remote-badge ${remoteInfo.compatible ? "ok" : "warn"}`}>
                  {remoteInfo.compatible ? t("settings.sync.remote.compatible") : remoteInfo.exists ? t("settings.sync.remote.incompatible") : t("settings.sync.remote.emptyDirectory")}
                </span>
                <small>{remoteInfo.exists ? t("settings.sync.remote.manifestRead") : t("settings.sync.remote.noSnapshot")}</small>
              </div>
              <dl>
                <div>
                  <dt>{t("settings.sync.remote.sourceDevice")}</dt>
                  <dd>{remoteInfo.device_name || t("settings.sync.remote.none")}</dd>
                </div>
                <div>
                  <dt>{t("settings.sync.remote.snapshotTime")}</dt>
                  <dd>{formatTimestamp(remoteInfo.created_at, locale, t)}</dd>
                </div>
                <div>
                  <dt>{t("settings.sync.remote.protocolVersion")}</dt>
                  <dd>{remoteInfo.protocol_version ?? t("settings.sync.remote.none")}</dd>
                </div>
                <div>
                  <dt>{t("settings.sync.remote.dataSize")}</dt>
                  <dd>{formatBytes(remoteInfo.data_size)}</dd>
                </div>
                <div>
                  <dt>Secrets</dt>
                  <dd>{remoteInfo.secrets_size ? formatBytes(remoteInfo.secrets_size) : t("settings.sync.remote.none")}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="settings-note">{t("settings.sync.remote.readHint")}</p>
          )}
        </section>

        <section className="settings-panel webdav-sync-card" aria-label={t("settings.sync.operations.aria")}>
          <header className="local-terminal-panel-head">
            <span>
              <strong>{t("settings.sync.operations.title")}</strong>
              <small>{t("settings.sync.operations.description")}</small>
            </span>
            <ShieldCheck className="ui-icon" aria-hidden="true" />
          </header>

          <div className="webdav-operation-body">
            <label className="credential-field">
              <span>{t("settings.sync.operations.password")}</span>
              <div className="credential-secret-field">
                <KeyRound className="ui-icon" aria-hidden="true" />
                <input
                  type={showSyncPassword ? "text" : "password"}
                  value={syncPassword}
                  autoComplete="new-password"
                  placeholder={t("settings.sync.operations.passwordPlaceholder")}
                  onChange={(event) => {
                    const value = event.target?.value;
                    if (value !== undefined) {
                      setSyncPassword(value);
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={showSyncPassword ? t("settings.sync.operations.hidePassword") : t("settings.sync.operations.showPassword")}
                  onClick={() => setShowSyncPassword((value) => !value)}
                >
                  {showSyncPassword ? (
                    <EyeOff className="ui-icon" aria-hidden="true" />
                  ) : (
                    <Eye className="ui-icon" aria-hidden="true" />
                  )}
                </button>
              </div>
            </label>

            <div className="webdav-operation-actions">
              <button
                className="settings-action-button"
                type="button"
                disabled={busy || !runtimeAvailable || !syncPassword.trim()}
                onClick={() => setConfirmAction("upload")}
              >
                <CloudUpload className="ui-icon" aria-hidden="true" />
                {busyAction === "upload" ? t("settings.sync.operations.uploading") : t("settings.sync.operations.uploadLocal")}
              </button>
              <button
                className="settings-action-button danger-button"
                type="button"
                disabled={busy || !runtimeAvailable || !syncPassword.trim()}
                onClick={() => setConfirmAction("download")}
              >
                <CloudDownload className="ui-icon" aria-hidden="true" />
                {busyAction === "download" ? t("settings.sync.operations.downloading") : t("settings.sync.operations.downloadRemote")}
              </button>
            </div>
          </div>
        </section>
      </div>

      {message ? (
        <p className="webdav-sync-message" role="status">
          <Database className="ui-icon" aria-hidden="true" />
          <span>{message}</span>
        </p>
      ) : null}

      {error ? (
        <p className="form-error webdav-sync-message" role="alert">
          <Server className="ui-icon" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      {!runtimeAvailable ? (
        <p className="settings-note">{t("settings.sync.preview")}</p>
      ) : null}

      <ConfirmDialog
        confirmLabel={t("settings.sync.confirmUpload.label")}
        description={t("settings.sync.confirmUpload.description")}
        open={confirmAction === "upload"}
        title={t("settings.sync.confirmUpload.title")}
        onConfirm={confirmUpload}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
      />

      <ConfirmDialog
        confirmLabel={t("settings.sync.confirmDownload.label")}
        description={t("settings.sync.confirmDownload.description")}
        open={confirmAction === "download"}
        title={t("settings.sync.confirmDownload.title")}
        onConfirm={confirmDownload}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
      />
    </section>
  );
}

function previewWebDavSettings(): WebDavSettings {
  return {
    enabled: false,
    base_url: "",
    username: null,
    password_saved: false,
    remote_root: "mxterm-sync",
    profile: "default",
    last_sync_at: null,
    last_snapshot_id: null,
    last_remote_device_name: null,
    last_error: null,
    updated_at: "",
  };
}

function formFromSettings(settings: WebDavSettings): WebDavSyncFormState {
  return {
    enabled: settings.enabled,
    base_url: settings.base_url,
    username: settings.username || "",
    password: "",
    password_touched: false,
    remote_root: settings.remote_root || "mxterm-sync",
    profile: settings.profile || "default",
  };
}

function formToInput(form: WebDavSyncFormState): WebDavSettingsInput {
  return {
    enabled: form.enabled,
    base_url: form.base_url.trim(),
    username: trimmedOrNull(form.username),
    password: form.password_touched ? form.password : undefined,
    password_touched: form.password_touched,
    remote_root: form.remote_root.trim() || "mxterm-sync",
    profile: form.profile.trim() || "default",
  };
}

function trimmedOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatWebDavError(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function remoteInfoMessage(info: WebDavRemoteInfo, t: Translate) {
  if (!info.exists) {
    return t("settings.sync.message.remoteEmpty");
  }
  if (!info.compatible) {
    return t("settings.sync.message.remoteIncompatible");
  }
  return t("settings.sync.message.remoteRead");
}

function syncResultMessage(result: WebDavSyncResult, t: Translate) {
  const direction = result.uploaded
    ? t("settings.sync.message.uploadComplete")
    : t("settings.sync.message.downloadComplete");
  const secretNote = result.secrets_skipped ? t("settings.sync.message.secretsSkipped") : "";
  return `${direction}: ${result.device_name} / ${result.snapshot_id}${secretNote}`;
}

function remoteInfoSummary(info: WebDavRemoteInfo, t: Translate, locale: "en" | "zh-CN") {
  if (!info.exists) {
    return t("settings.sync.remote.summaryEmpty");
  }
  if (!info.compatible) {
    return t("settings.sync.remote.summaryIncompatible");
  }
  return `${info.device_name || t("settings.sync.remote.unknownDevice")} · ${formatTimestamp(info.created_at, locale, t)}`;
}

function formatTimestamp(value: string | null, locale: "en" | "zh-CN", t: Translate) {
  if (!value) {
    return t("settings.sync.remote.none");
  }
  const date = /^\d+$/.test(value) ? new Date(Number(value) * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US");
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) {
    return "无";
  }
  if (value < 1024) {
    return `${value.toString()} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
