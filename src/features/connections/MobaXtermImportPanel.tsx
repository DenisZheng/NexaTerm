import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Upload,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { useI18n, type Translate } from "../../shared/i18n";
import {
  mobaxtermImportApply,
  mobaxtermImportPreview,
} from "../../shared/tauri/commands";
import { selectMobaXtermSessionsImportPath } from "../../shared/tauri/dialog";
import type {
  MobaXtermImportApplyResult,
  MobaXtermImportItem,
  MobaXtermImportPreviewResult,
  MobaXtermImportSelection,
} from "./mobaxtermImportTypes";

interface MobaXtermImportPanelProps {
  onBack: () => void;
  onBusyChange: (busy: boolean) => void;
  onImported: () => void | Promise<void>;
}

export function MobaXtermImportPanel({
  onBack,
  onBusyChange,
  onImported,
}: MobaXtermImportPanelProps) {
  const { t, locale } = useI18n();
  const [path, setPath] = useState("");
  const [defaultUsername, setDefaultUsername] = useState("");
  const [preview, setPreview] = useState<MobaXtermImportPreviewResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [names, setNames] = useState<Record<number, string>>({});
  const [result, setResult] = useState<MobaXtermImportApplyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importableCount = useMemo(
    () => preview?.items.filter((item) => item.selectable).length ?? 0,
    [preview],
  );

  function updateBusy(next: boolean) {
    setBusy(next);
    onBusyChange(next);
  }

  async function choosePath() {
    setError(null);
    try {
      const selectedPath = await selectMobaXtermSessionsImportPath();
      if (selectedPath) {
        setPath(selectedPath);
        resetPreview();
      }
    } catch (selectionError) {
      setError(formatError(selectionError, t("mobaxterm.error.filePicker")));
    }
  }

  function resetPreview() {
    setPreview(null);
    setSelected(new Set());
    setNames({});
    setResult(null);
  }

  function changeDefaultUsername(value: string) {
    setDefaultUsername(value);
    setError(null);
    resetPreview();
  }

  async function runPreview(event: FormEvent) {
    event.preventDefault();
    if (!path) {
      setError(t("mobaxterm.error.fileRequired"));
      return;
    }
    updateBusy(true);
    setError(null);
    try {
      const next = await mobaxtermImportPreview(path, defaultUsername);
      setPreview(next);
      const nextSelected = new Set<number>();
      const nextNames: Record<number, string> = {};
      for (const item of next.items) {
        nextNames[item.source_index] = item.suggested_name || item.name;
        if (item.selectable) {
          nextSelected.add(item.source_index);
        }
      }
      setSelected(nextSelected);
      setNames(nextNames);
    } catch (previewError) {
      resetPreview();
      setError(formatError(previewError, t("mobaxterm.error.preview")));
    } finally {
      updateBusy(false);
    }
  }

  function toggleItem(item: MobaXtermImportItem) {
    if (!item.selectable || busy) {
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(item.source_index)) {
        next.delete(item.source_index);
      } else {
        next.add(item.source_index);
      }
      return next;
    });
  }

  async function applyImport() {
    if (!preview || !selected.size) {
      setError(t("mobaxterm.error.selection"));
      return;
    }
    const selections: MobaXtermImportSelection[] = preview.items
      .filter((item) => selected.has(item.source_index))
      .map((item) => ({
        source_index: item.source_index,
        name: (names[item.source_index] || item.suggested_name || item.name).trim(),
      }));
    if (selections.some((item) => !item.name)) {
      setError(t("mobaxterm.error.name"));
      return;
    }

    updateBusy(true);
    setError(null);
    try {
      const nextResult = await mobaxtermImportApply(
        path,
        preview.fingerprint,
        defaultUsername,
        selections,
      );
      setResult(nextResult);
      await onImported();
    } catch (importError) {
      setError(formatError(importError, t("mobaxterm.error.import")));
    } finally {
      updateBusy(false);
    }
  }

  if (result) {
    return (
      <div className="connection-transfer-complete">
        <CheckCircle2 className="ui-icon" aria-hidden="true" />
        <strong>{t("mobaxterm.complete.title")}</strong>
        <span>
          {t("mobaxterm.complete.created", { count: result.created })}
          {result.skipped_exact_duplicates
            ? t("mobaxterm.complete.skipped", { count: result.skipped_exact_duplicates })
            : ""}
        </span>
        <Dialog.Close asChild>
          <button className="primary-button" type="button">
            {t("mobaxterm.complete.done")}
          </button>
        </Dialog.Close>
      </div>
    );
  }

  return (
    <form className="connection-transfer-form" onSubmit={(event) => void runPreview(event)}>
      <button
        className="connection-transfer-source-button"
        disabled={busy}
        type="button"
        onClick={onBack}
      >
        <ArrowLeft className="ui-icon" aria-hidden="true" />
        {t("mobaxterm.back")}
      </button>

      <div className="connection-transfer-field">
        <span>{t("mobaxterm.file")}</span>
        <button
          className="connection-transfer-file"
          disabled={busy}
          type="button"
          title={path || undefined}
          onClick={() => void choosePath()}
        >
          <Upload className="ui-icon" aria-hidden="true" />
          <span>{path ? fileName(path) : t("mobaxterm.file.none")}</span>
          <FolderOpen className="ui-icon" aria-hidden="true" />
        </button>
      </div>

      <label className="connection-transfer-field" htmlFor="mobaxterm-default-username">
        <span>{t("mobaxterm.defaultUsername")}</span>
        <input
          id="mobaxterm-default-username"
          autoComplete="username"
          disabled={busy}
          placeholder={t("mobaxterm.defaultUsername.placeholder")}
          value={defaultUsername}
          onChange={(event) => changeDefaultUsername(event.target.value)}
        />
      </label>

      <p className="connection-transfer-note">
        <AlertTriangle className="ui-icon" aria-hidden="true" />
        {t("mobaxterm.note")}
      </p>

      {preview ? (
        <MobaPreview
          busy={busy}
          names={names}
          locale={locale}
          t={t}
          preview={preview}
          selected={selected}
          onNameChange={(index, name) => {
            setNames((current) => ({ ...current, [index]: name }));
            setError(null);
          }}
          onToggle={toggleItem}
        />
      ) : null}

      {error ? (
        <p className="connection-transfer-error" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="connection-transfer-actions">
        <Dialog.Close asChild>
          <button disabled={busy} type="button">
            {t("mobaxterm.cancel")}
          </button>
        </Dialog.Close>
        {preview ? (
          <button
            className="primary-button"
            disabled={busy || selected.size === 0}
            type="button"
            onClick={() => void applyImport()}
          >
            {busy ? (
              <Loader2 className="ui-icon spin" aria-hidden="true" />
            ) : (
              <Upload className="ui-icon" aria-hidden="true" />
            )}
            {t("mobaxterm.import", { count: selected.size })}
          </button>
        ) : (
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? (
              <Loader2 className="ui-icon spin" aria-hidden="true" />
            ) : (
              <Upload className="ui-icon" aria-hidden="true" />
            )}
            {t("mobaxterm.preview")}
          </button>
        )}
      </footer>

      {preview && importableCount === 0 ? (
        <p className="connection-transfer-note">
          <AlertTriangle className="ui-icon" aria-hidden="true" />
          {t("mobaxterm.noneImportable")}
        </p>
      ) : null}
    </form>
  );
}

function MobaPreview({
  busy,
  names,
  preview,
  selected,
  onNameChange,
  onToggle,
}: {
  busy: boolean;
  names: Record<number, string>;
  preview: MobaXtermImportPreviewResult;
  selected: Set<number>;
  onNameChange: (index: number, name: string) => void;
  onToggle: (item: MobaXtermImportItem) => void;
}) {
  const blocked = preview.summary.unsupported + preview.summary.invalid + preview.summary.needs_input;
  return (
    <section className="connection-transfer-preview" aria-label="MobaXterm 导入预览">
      <div className="connection-transfer-stats">
        <div>
          <strong>{preview.summary.total.toString()}</strong>
          <span>全部会话</span>
          <small>源文件记录</small>
        </div>
        <div>
          <strong>{preview.summary.ready.toString()}</strong>
          <span>SSH 可处理</span>
          <small>仍会排除精确重复</small>
        </div>
        <div>
          <strong>{blocked.toString()}</strong>
          <span>需处理/不支持</span>
          <small>不会静默转换</small>
        </div>
      </div>

      {(preview.summary.exact_duplicates ||
        preview.summary.name_conflicts ||
        preview.summary.possible_target_duplicates) ? (
        <div className="connection-transfer-warning">
          <AlertTriangle className="ui-icon" aria-hidden="true" />
          <span>
            <strong>检测到本地冲突</strong>
            <small>
              精确重复 {preview.summary.exact_duplicates.toString()} · 同名{" "}
              {preview.summary.name_conflicts.toString()} · 疑似同目标{" "}
              {preview.summary.possible_target_duplicates.toString()}
            </small>
          </span>
        </div>
      ) : null}

      <div className="mobaxterm-import-list">
        {preview.items.map((item) => {
          const checked = selected.has(item.source_index);
          return (
            <div
              className="mobaxterm-import-row"
              data-selectable={item.selectable ? "true" : "false"}
              key={item.source_index}
            >
              <label className="mobaxterm-import-check">
                <input
                  checked={checked}
                  disabled={busy || !item.selectable}
                  type="checkbox"
                  onChange={() => onToggle(item)}
                />
                <span>{statusLabel(item)}</span>
              </label>
              <div className="mobaxterm-import-detail">
                <input
                  aria-label={`导入名称：${item.name}`}
                  disabled={busy || !item.selectable || !checked}
                  value={names[item.source_index] || item.suggested_name || item.name}
                  onChange={(event) => onNameChange(item.source_index, event.target.value)}
                />
                <small>
                  {item.kind.toUpperCase()}
                  {item.host ? ` · ${item.host}:${item.port ?? "?"}` : ""}
                  {item.effective_username ? ` · ${item.effective_username}` : ""}
                  {item.folder_path ? ` · ${item.folder_path}` : ""}
                </small>
                {item.private_key_path ? (
                  <small title={item.private_key_path}>私钥路径：{item.private_key_path}</small>
                ) : null}
                {item.warnings.length ? (
                  <small>{item.warnings.map(warningLabel).join("；")}</small>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function statusLabel(item: MobaXtermImportItem) {
  if (item.conflict === "exact_duplicate") {
    return "已存在";
  }
  if (item.conflict === "name_conflict") {
    return "同名，已建议重命名";
  }
  if (item.conflict === "possible_target_duplicate") {
    return "疑似同目标";
  }
  if (item.status === "unsupported") {
    return "暂不支持";
  }
  if (item.status === "invalid") {
    return "记录无效";
  }
  if (item.missing_fields.includes("network_settings_review")) {
    return "需手动检查 Jump/Proxy";
  }
  if (item.missing_fields.includes("username")) {
    return "需补用户名";
  }
  return "可导入";
}

function warningLabel(value: string) {
  switch (value) {
    case "private_key_path_is_local_reference":
      return "私钥仅保留本机路径引用";
    case "private_key_path_uses_current_drive_placeholder":
      return "私钥路径含 MobaXterm 驱动器占位符";
    case "startup_command_not_imported":
      return "启动命令暂不迁移";
    case "ssh_gateway_requires_review":
      return "SSH Gateway 需手动重建";
    case "proxy_requires_review":
      return "Proxy 需手动重建";
    case "x11_forwarding_not_imported":
      return "X11 设置暂不迁移";
    case "session_type_not_imported_yet":
      return "该协议当前仅识别，不导入";
    default:
      return value;
  }
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
