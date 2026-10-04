import { type ReactNode, useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";

import { useI18n } from "../../shared/i18n";
import {
  legacyAppDataMigrationApply,
  legacyAppDataMigrationPreview,
  type LegacyAppDataMigrationPreview,
} from "../../shared/tauri/commands";

import "./LegacyAppDataMigrationGate.css";

interface LegacyAppDataMigrationGateProps {
  children: ReactNode;
}

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

export function LegacyAppDataMigrationGate({ children }: LegacyAppDataMigrationGateProps) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<LegacyAppDataMigrationPreview | null>(null);
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
    void legacyAppDataMigrationPreview()
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(describeError(cause));
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isTauriRuntime() || dismissed || (!checking && preview && !preview.available)) {
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
      await legacyAppDataMigrationApply();
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
