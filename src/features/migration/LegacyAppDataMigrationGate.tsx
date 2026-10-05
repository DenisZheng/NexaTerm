import { type ReactNode, useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";

import { settingsStorageKey } from "../settings/startupSettings";
import { useI18n } from "../../shared/i18n";
import {
  legacyAppDataMigrationApply,
  legacyAppDataMigrationPreview,
  legacyWebviewSettingsProbeStart,
  legacyWebviewSettingsProbeTake,
  type LegacyAppDataMigrationPreview,
} from "../../shared/tauri/commands";

import "./LegacyAppDataMigrationGate.css";

interface LegacyAppDataMigrationGateProps {
  children: ReactNode;
}

interface LegacySettingsProbeOutcome {
  complete: boolean;
  reason: string | null;
  supported: boolean;
  value: string | null;
}

const settingsMigrationMarkerKey = "nexaterm.brandMigration.settings.v1";
type SettingsMigrationMarker = "done" | "none" | "unsupported" | "unsupported-ack";
const legacySettingsProbeAttempts = 50;
const legacySettingsProbeIntervalMs = 50;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function describeError(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.code === "string") return record.code;
  }
  return "unknown error";
}

function readSettingsMigrationMarker(): SettingsMigrationMarker | null {
  try {
    const value = window.localStorage.getItem(settingsMigrationMarkerKey);
    return value === "done" ||
      value === "none" ||
      value === "unsupported" ||
      value === "unsupported-ack"
      ? value
      : null;
  } catch {
    return null;
  }
}

function settingsMigrationMarked() {
  const marker = readSettingsMigrationMarker();
  return marker === "done" || marker === "none" || marker === "unsupported-ack";
}

function markSettingsMigration(status: SettingsMigrationMarker) {
  try {
    window.localStorage.setItem(settingsMigrationMarkerKey, status);
  } catch {
    // A restricted WebView may not expose localStorage; the next launch can retry.
  }
}

function installLegacySettings(value: string) {
  window.localStorage.setItem(settingsStorageKey, value);
  markSettingsMigration("done");
}

function shouldMarkNoLegacySettings(outcome: LegacySettingsProbeOutcome) {
  return (
    outcome.complete &&
    outcome.supported &&
    !outcome.value &&
    (outcome.reason === "legacy-webview-data-not-found" ||
      outcome.reason === "legacy-settings-key-not-found")
  );
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function probeLegacySettings(): Promise<LegacySettingsProbeOutcome> {
  const start = await legacyWebviewSettingsProbeStart();
  if (!start.supported) {
    return { complete: true, reason: start.reason, supported: false, value: null };
  }
  if (!start.started || !start.token) {
    return { complete: true, reason: start.reason, supported: true, value: null };
  }

  for (let attempt = 0; attempt < legacySettingsProbeAttempts; attempt += 1) {
    const result = await legacyWebviewSettingsProbeTake(start.token);
    if (result.complete) {
      return {
        complete: true,
        reason: result.value ? null : "legacy-settings-key-not-found",
        supported: true,
        value: result.value,
      };
    }
    await sleep(legacySettingsProbeIntervalMs);
  }
  return { complete: false, reason: "legacy-settings-probe-timeout", supported: true, value: null };
}

export function LegacyAppDataMigrationGate({ children }: LegacyAppDataMigrationGateProps) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<LegacyAppDataMigrationPreview | null>(null);
  const [settingsOnlyValue, setSettingsOnlyValue] = useState<string | null>(null);
  const [settingsUnsupported, setSettingsUnsupported] = useState(false);
  const [checking, setChecking] = useState(isTauriRuntime);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartFailed, setRestartFailed] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    const check = async () => {
      try {
        const result = await legacyAppDataMigrationPreview();
        if (cancelled) return;
        setPreview(result);

        if (!result.available && readSettingsMigrationMarker() === "unsupported") {
          setSettingsUnsupported(true);
        } else if (!result.available && !settingsMigrationMarked()) {
          try {
            const settings = await probeLegacySettings();
            if (cancelled) return;
            if (settings.complete && settings.supported && settings.value) {
              setSettingsOnlyValue(settings.value);
            } else if (shouldMarkNoLegacySettings(settings)) {
              markSettingsMigration("none");
            }
          } catch {
            if (!cancelled) {
              setSettingsUnsupported(true);
            }
          }
        }
      } catch (cause: unknown) {
        if (!cancelled) setError(describeError(cause));
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isTauriRuntime() || dismissed) {
    return children;
  }

  if (checking) {
    return (
      <div className="app-startup-shell" role="status" aria-live="polite">
        <span className="app-startup-spinner" aria-hidden="true" />
        <span>{t("brandMigration.applying")}</span>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <MigrationCard title={t("brandMigration.title")}>
        <p className="brand-migration-error" role="alert">
          {t("brandMigration.error", { message: error })}
        </p>
        <div className="brand-migration-actions">
          <button className="brand-migration-secondary" type="button" onClick={() => setDismissed(true)}>
            {t("brandMigration.continue")}
          </button>
        </div>
      </MigrationCard>
    );
  }

  if (!preview) {
    return children;
  }

  if (!preview.available && settingsUnsupported) {
    const acknowledgeUnsupported = () => {
      markSettingsMigration("unsupported-ack");
      setDismissed(true);
    };

    return (
      <MigrationCard title={t("brandMigration.settingsUnsupportedTitle")}>
        <p>{t("brandMigration.settingsUnsupportedDescription")}</p>
        <div className="brand-migration-actions">
          <button
            className="brand-migration-primary"
            type="button"
            onClick={acknowledgeUnsupported}
          >
            {t("brandMigration.continue")}
          </button>
        </div>
      </MigrationCard>
    );
  }

  if (!preview.available && settingsOnlyValue) {
    const applySettingsOnly = async () => {
      setApplying(true);
      setError(null);
      setRestartFailed(false);
      try {
        installLegacySettings(settingsOnlyValue);
        try {
          await relaunch();
        } catch {
          setRestartFailed(true);
        }
      } catch (cause: unknown) {
        setError(describeError(cause));
      } finally {
        setApplying(false);
      }
    };

    return (
      <MigrationCard title={t("brandMigration.settingsTitle")}>
        <p>{t("brandMigration.settingsDescription")}</p>
        {error ? (
          <p className="brand-migration-error" role="alert">
            {t("brandMigration.error", { message: error })}
          </p>
        ) : null}
        {restartFailed ? (
          <p className="brand-migration-error" role="alert">
            {t("brandMigration.restartFailed")}
          </p>
        ) : null}
        <div className="brand-migration-actions">
          <button
            className="brand-migration-secondary"
            type="button"
            disabled={applying}
            onClick={() => setDismissed(true)}
          >
            {t("brandMigration.skip")}
          </button>
          <button
            className="brand-migration-primary"
            type="button"
            disabled={applying || restartFailed}
            onClick={() => void applySettingsOnly()}
          >
            {applying ? t("brandMigration.applying") : t("brandMigration.settingsApply")}
          </button>
        </div>
      </MigrationCard>
    );
  }

  if (!preview.available) {
    return children;
  }

  if (preview.blocked) {
    return (
      <MigrationCard title={t("brandMigration.blockedTitle")}>
        <p>{t("brandMigration.blockedDescription")}</p>
        <code className="brand-migration-path">{preview.legacyRoot || preview.legacyIdentifier}</code>
        <div className="brand-migration-actions">
          <button className="brand-migration-primary" type="button" onClick={() => setDismissed(true)}>
            {t("brandMigration.continue")}
          </button>
        </div>
      </MigrationCard>
    );
  }

  const apply = async () => {
    setApplying(true);
    setError(null);
    setRestartFailed(false);
    try {
      let legacySettings: LegacySettingsProbeOutcome | null = null;
      if (!settingsMigrationMarked()) {
        try {
          legacySettings = await probeLegacySettings();
        } catch {
          legacySettings = {
            complete: true,
            reason: "legacy-settings-probe-failed",
            supported: false,
            value: null,
          };
        }
      }

      await legacyAppDataMigrationApply();

      if (legacySettings?.complete && legacySettings.supported && legacySettings.value) {
        installLegacySettings(legacySettings.value);
      } else if (legacySettings && shouldMarkNoLegacySettings(legacySettings)) {
        markSettingsMigration("none");
      } else if (legacySettings?.complete && !legacySettings.supported) {
        markSettingsMigration("unsupported");
      }

      try {
        await relaunch();
      } catch {
        setRestartFailed(true);
      }
    } catch (cause: unknown) {
      setError(describeError(cause));
    } finally {
      setApplying(false);
    }
  };

  return (
    <MigrationCard title={t("brandMigration.title")}>
      <p>{t("brandMigration.description")}</p>
      <div className="brand-migration-summary">
        <strong>{t("brandMigration.files", { count: preview.files.length })}</strong>
        <code className="brand-migration-path">{preview.legacyRoot || preview.legacyIdentifier}</code>
        <ul>
          {preview.files.slice(0, 8).map((file) => <li key={file}>{file}</li>)}
          {preview.files.length > 8 ? <li>+{preview.files.length - 8}</li> : null}
        </ul>
      </div>
      {error ? (
        <p className="brand-migration-error" role="alert">
          {t("brandMigration.error", { message: error })}
        </p>
      ) : null}
      {restartFailed ? (
        <p className="brand-migration-error" role="alert">
          {t("brandMigration.restartFailed")}
        </p>
      ) : null}
      <div className="brand-migration-actions">
        <button
          className="brand-migration-secondary"
          type="button"
          disabled={applying}
          onClick={() => setDismissed(true)}
        >
          {t("brandMigration.skip")}
        </button>
        <button
          className="brand-migration-primary"
          type="button"
          disabled={applying || restartFailed}
          onClick={() => void apply()}
        >
          {applying ? t("brandMigration.applying") : t("brandMigration.apply")}
        </button>
      </div>
    </MigrationCard>
  );
}

function MigrationCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="brand-migration-screen">
      <section className="brand-migration-card" role="dialog" aria-modal="true" aria-labelledby="brand-migration-title">
        <div className="brand-migration-badge" aria-hidden="true">N</div>
        <h1 id="brand-migration-title">{title}</h1>
        {children}
      </section>
    </div>
  );
}
