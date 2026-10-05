import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FolderOpen,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { useI18n } from "../../shared/i18n";
import { AppSelect } from "../../shared/ui/AppSelect";
import {
  connectionTransferExport,
  connectionTransferImport,
  connectionTransferPreview,
} from "../../shared/tauri/commands";
import {
  selectConnectionTransferExportPath,
  selectConnectionTransferImportPath,
} from "../../shared/tauri/dialog";
import type {
  ConnectionTransferConflictStrategy,
  ConnectionTransferExportResult,
  ConnectionTransferImportResult,
  ConnectionTransferMode,
  ConnectionTransferPreviewResult,
} from "./connectionTransferTypes";
import { MobaXtermImportPanel } from "./MobaXtermImportPanel";

interface ConnectionTransferDialogProps {
  mode: ConnectionTransferMode;
  open: boolean;
  onImported: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionTransferDialog({
  mode,
  open,
  onImported,
  onOpenChange,
}: ConnectionTransferDialogProps) {
  const { t } = useI18n();
  const conflictOptions = [
    { label: t("transfer.conflict.skip"), value: "skip" as const },
    { label: t("transfer.conflict.overwrite"), value: "overwrite" as const },
  ] satisfies Array<{ label: string; value: ConnectionTransferConflictStrategy }>;
  const [path, setPath] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [strategy, setStrategy] = useState<ConnectionTransferConflictStrategy>("skip");
  const [preview, setPreview] = useState<ConnectionTransferPreviewResult | null>(null);
  const [exportResult, setExportResult] = useState<ConnectionTransferExportResult | null>(null);
  const [importResult, setImportResult] = useState<ConnectionTransferImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobaxtermMode, setMobaXtermMode] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPath("");
    setPassword("");
    setPasswordConfirmation("");
    setShowPassword(false);
    setStrategy("skip");
    setPreview(null);
    setExportResult(null);
    setImportResult(null);
    setBusy(false);
    setError(null);
    setMobaXtermMode(false);
  }, [mode, open]);

  function changePassword(value: string) {
    setPassword(value);
    setPreview(null);
    setError(null);
  }

  async function choosePath() {
    setError(null);
    try {
      const selected =
        mode === "import"
          ? await selectConnectionTransferImportPath()
          : await selectConnectionTransferExportPath();
      if (selected) {
        setPath(selected);
        setPreview(null);
      }
    } catch (selectionError) {
      setError(formatError(selectionError, t("transfer.error.filePicker")));
    }
  }

  async function exportConnections(event: FormEvent) {
    event.preventDefault();
    if (!path) {
      setError(t("transfer.error.exportPath"));
      return;
    }
    if (!password) {
      setError(t("transfer.error.exportPassword"));
      return;
    }
    if (password !== passwordConfirmation) {
      setError(t("transfer.error.passwordMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setExportResult(await connectionTransferExport(path, password));
      setPassword("");
      setPasswordConfirmation("");
    } catch (exportError) {
      setError(formatError(exportError, t("transfer.error.export")));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview(event?: FormEvent, nextStrategy = strategy) {
    event?.preventDefault();
    if (!path) {
      setError(t("transfer.error.importFile"));
      return;
    }
    if (!password) {
      setError(t("transfer.error.filePassword"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPreview(await connectionTransferPreview(path, password, nextStrategy));
    } catch (previewError) {
      setPreview(null);
      setError(formatError(previewError, t("transfer.error.preview")));
    } finally {
      setBusy(false);
    }
  }

  async function importConnections() {
    if (!preview) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await connectionTransferImport(
        path,
        password,
        preview.fingerprint,
        strategy,
      );
      setImportResult(result);
      setPassword("");
    } catch (importError) {
      setError(formatError(importError, t("transfer.error.import")));
      setBusy(false);
      return;
    }
    try {
      await onImported();
    } catch (refreshError) {
      setError(formatError(refreshError, t("transfer.error.refresh")));
    } finally {
      setBusy(false);
    }
  }

  const complete = Boolean(exportResult || importResult);
  const title = mode === "import" ? t("transfer.title.import") : t("transfer.title.export");

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content
          className="connection-transfer-dialog"
          onInteractOutside={(event) => busy && event.preventDefault()}
          onPointerDownOutside={(event) => busy && event.preventDefault()}
        >
          <header className="connection-transfer-header">
            <span className="connection-transfer-heading-icon" aria-hidden="true">
              {mode === "import" ? <Upload className="ui-icon" /> : <Download className="ui-icon" />}
            </span>
            <span>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {mode === "import"
                  ? t("transfer.description.import")
                  : t("transfer.description.export")}
              </Dialog.Description>
            </span>
            <Dialog.Close asChild>
              <button className="connection-transfer-close" disabled={busy} type="button" aria-label={t("transfer.close")}>
                <X className="ui-icon" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="connection-transfer-body">
            {complete ? (
              <>
                <TransferComplete mode={mode} exportResult={exportResult} importResult={importResult} />
                {error ? <p className="connection-transfer-error connection-transfer-complete-error" role="alert">{error}</p> : null}
              </>
            ) : mode === "export" ? (
              <form className="connection-transfer-form" onSubmit={(event) => void exportConnections(event)}>
                <FilePicker path={path} busy={busy} label={t("transfer.export.location")} onChoose={() => void choosePath()} />
                <PasswordField
                  id="connection-transfer-export-password"
                  label={t("transfer.export.password")}
                  value={password}
                  visible={showPassword}
                  busy={busy}
                  onChange={changePassword}
                  onToggle={() => setShowPassword((visible) => !visible)}
                />
                <label className="connection-transfer-field" htmlFor="connection-transfer-export-confirmation">
                  <span>{t("transfer.export.confirmPassword")}</span>
                  <input
                    id="connection-transfer-export-confirmation"
                    autoComplete="new-password"
                    disabled={busy}
                    type={showPassword ? "text" : "password"}
                    value={passwordConfirmation}
                    onChange={(event) => {
                      setPasswordConfirmation(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <p className="connection-transfer-note">
                  <ShieldCheck className="ui-icon" aria-hidden="true" />
                  {t("transfer.export.note")}
                </p>
                {error ? <p className="connection-transfer-error" role="alert">{error}</p> : null}
                <footer className="connection-transfer-actions">
                  <Dialog.Close asChild><button disabled={busy} type="button">{t("transfer.cancel")}</button></Dialog.Close>
                  <button className="primary-button" disabled={busy} type="submit">
                    {busy ? <Loader2 className="ui-icon spin" aria-hidden="true" /> : <Download className="ui-icon" aria-hidden="true" />}
                    {t("transfer.export.action")}
                  </button>
                </footer>
              </form>
            ) : mobaxtermMode ? (
              <MobaXtermImportPanel
                onBack={() => {
                  if (!busy) {
                    setMobaXtermMode(false);
                    setError(null);
                  }
                }}
                onBusyChange={setBusy}
                onImported={onImported}
              />
            ) : (
              <form className="connection-transfer-form" onSubmit={(event) => void runPreview(event)}>
                <button
                  className="connection-transfer-source-button"
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    setMobaXtermMode(true);
                    setError(null);
                  }}
                >
                  <Upload className="ui-icon" aria-hidden="true" />
                  {t("transfer.mobaxterm.open")}
                </button>
                <FilePicker path={path} busy={busy} label={t("transfer.import.file")} onChoose={() => void choosePath()} />
                <PasswordField
                  id="connection-transfer-import-password"
                  label={t("transfer.import.password")}
                  value={password}
                  visible={showPassword}
                  busy={busy}
                  onChange={changePassword}
                  onToggle={() => setShowPassword((visible) => !visible)}
                />
                <label className="connection-transfer-field">
                  <span>{t("transfer.import.conflict")}</span>
                  <AppSelect ariaLabel={t("transfer.import.conflict")} disabled={busy} options={conflictOptions} value={strategy}
                    onChange={(value) => { setStrategy(value); setPreview(null); if (path && password) void runPreview(undefined, value); }} />
                </label>
                {preview ? <PreviewPanel preview={preview} /> : null}
                {error ? <p className="connection-transfer-error" role="alert">{error}</p> : null}
                <footer className="connection-transfer-actions">
                  <Dialog.Close asChild><button disabled={busy} type="button">{t("transfer.cancel")}</button></Dialog.Close>
                  {preview ? (
                    <button className="primary-button" disabled={busy} type="button" onClick={() => void importConnections()}>
                      {busy ? <Loader2 className="ui-icon spin" aria-hidden="true" /> : <Upload className="ui-icon" aria-hidden="true" />}
                      {t("transfer.import.action")}
                    </button>
                  ) : (
                    <button className="primary-button" disabled={busy} type="submit">
                      {busy ? <Loader2 className="ui-icon spin" aria-hidden="true" /> : <ShieldCheck className="ui-icon" aria-hidden="true" />}
                      {t("transfer.preview.action")}
                    </button>
                  )}
                </footer>
              </form>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FilePicker({ path, busy, label, onChoose }: { path: string; busy: boolean; label: string; onChoose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="connection-transfer-field">
      <span>{label}</span>
      <button className="connection-transfer-file" disabled={busy} type="button" title={path || undefined} onClick={onChoose}>
        <FileJson className="ui-icon" aria-hidden="true" />
        <span>{path ? fileName(path) : t("transfer.file.none")}</span>
        <FolderOpen className="ui-icon" aria-hidden="true" />
      </button>
    </div>
  );
}

function PasswordField({ id, label, value, visible, busy, onChange, onToggle }: { id: string; label: string; value: string; visible: boolean; busy: boolean; onChange: (value: string) => void; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <label className="connection-transfer-field" htmlFor={id}>
      <span>{label}</span>
      <span className="connection-transfer-password">
        <input id={id} autoComplete="new-password" disabled={busy} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} />
        <button disabled={busy} type="button" aria-label={visible ? t("transfer.password.hide") : t("transfer.password.show")} onClick={onToggle}>
          {visible ? <EyeOff className="ui-icon" aria-hidden="true" /> : <Eye className="ui-icon" aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

function PreviewPanel({ preview }: { preview: ConnectionTransferPreviewResult }) {
  const { t } = useI18n();
  const { summary } = preview;
  return (
    <section className="connection-transfer-preview" aria-label={t("transfer.preview.aria")}>
      <div className="connection-transfer-stats">
        <TransferStat label={t("transfer.preview.connections")} value={summary.connections} />
        <TransferStat label={t("transfer.preview.accounts")} value={summary.credentials} />
        <TransferStat label={t("transfer.preview.groups")} value={summary.groups} />
      </div>
      {summary.private_key_warnings.length ? (
        <div className="connection-transfer-warning">
          <AlertTriangle className="ui-icon" aria-hidden="true" />
          <span>
            <strong>{t("transfer.preview.privateKeyWarning", { count: summary.private_key_warnings.length })}</strong>
            <ul>
              {summary.private_key_warnings.map((path) => <li key={path} title={path}>{path}</li>)}
            </ul>
          </span>
        </div>
      ) : null}
    </section>
  );
}

function TransferStat({ label, value }: { label: string; value: { total: number; new: number; conflicts: number } }) {
  const { t } = useI18n();
  return <div><strong>{value.total.toString()}</strong><span>{label}</span><small>{t("transfer.preview.stat", { newCount: value.new, conflicts: value.conflicts })}</small></div>;
}

function TransferComplete({ mode, exportResult, importResult }: { mode: ConnectionTransferMode; exportResult: ConnectionTransferExportResult | null; importResult: ConnectionTransferImportResult | null }) {
  const { t } = useI18n();
  const connectionCount = exportResult?.connections ?? (importResult ? importResult.connections.created + importResult.connections.updated : 0);
  return (
    <div className="connection-transfer-complete">
      <CheckCircle2 className="ui-icon" aria-hidden="true" />
      <strong>{mode === "import" ? t("transfer.complete.import") : t("transfer.complete.export")}</strong>
      <span>{t("transfer.complete.summary", { connections: connectionCount, accounts: exportResult?.credentials ?? (importResult ? importResult.credentials.created + importResult.credentials.updated : 0) })}</span>
      {exportResult ? <small>{exportResult.file_name}</small> : null}
      <Dialog.Close asChild><button className="primary-button" type="button">{t("transfer.complete.done")}</button></Dialog.Close>
    </div>
  );
}

function fileName(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || path;
}

function formatError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message: unknown }).message).trim();
    return message || fallback;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}
