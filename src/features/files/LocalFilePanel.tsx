import { ArrowUp, FileText, Folder, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from "react";

import { localFileList } from "../../shared/tauri/commands";
import { selectLocalDirectory } from "../../shared/tauri/dialog";
import { useI18n } from "../../shared/i18n";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import type { LocalFileEntry } from "./remoteFileTypes";

export const LOCAL_FILE_DROP_TYPE = "application/x-nexaterm-local-file";

interface LocalFilePanelProps {
  active: boolean;
}

export function LocalFilePanel({ active }: LocalFilePanelProps) {
  const { t } = useI18n();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    const normalized = path.trim();
    if (!normalized) {
      setError(t("files.local.invalidPath"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextEntries = await localFileList(normalized);
      setCurrentPath(normalized);
      setPathInput(normalized);
      setEntries(nextEntries);
    } catch (loadError) {
      setError(formatLocalFileError(loadError, t("files.local.error")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!active) {
      return;
    }
    setError(null);
  }, [active]);

  if (!active) {
    return <aside className="local-file-panel is-hidden" aria-hidden="true" />;
  }

  const canNavigateToParent = currentPath ? localPathParent(currentPath) !== currentPath : false;

  function submitPath(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadDirectory(pathInput);
  }

  function chooseDirectory() {
    if (!hasTauriRuntime()) {
      setError(t("files.local.unavailable"));
      return;
    }
    void selectLocalDirectory()
      .then((path) => {
        if (path) {
          return loadDirectory(path);
        }
        return undefined;
      })
      .catch((selectError) => {
        setError(formatLocalFileError(selectError, t("files.local.error")));
      });
  }

  function handleEntryDragStart(event: DragEvent<HTMLButtonElement>, entry: LocalFileEntry) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(LOCAL_FILE_DROP_TYPE, JSON.stringify({ paths: [entry.path] }));
    event.dataTransfer.setData("text/plain", entry.path);
  }

  return (
    <aside className="local-file-panel" aria-label={t("files.local.title")}>
      <header className="local-file-panel-header">
        <div className="local-file-panel-title">
          <FolderOpen className="ui-icon" aria-hidden="true" />
          <strong>{t("files.local.title")}</strong>
        </div>
        <button className="secondary-button local-file-choose" type="button" onClick={chooseDirectory}>
          {t("files.local.chooseDirectory")}
        </button>
      </header>
      <div className="local-file-panel-toolbar">
        <button
          className="mini-action"
          type="button"
          aria-label={t("files.local.parent")}
          disabled={!canNavigateToParent || loading}
          onClick={() => currentPath && void loadDirectory(localPathParent(currentPath))}
        >
          <ArrowUp className="ui-icon" aria-hidden="true" />
        </button>
        <form className="local-file-path-form" onSubmit={submitPath}>
          <input
            className="path-input"
            aria-label={t("files.local.pathAria")}
            disabled={!currentPath || loading}
            spellCheck={false}
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
          />
        </form>
        <button
          className="mini-action"
          type="button"
          aria-label={t("files.local.refresh")}
          disabled={!currentPath || loading}
          onClick={() => currentPath && void loadDirectory(currentPath)}
        >
          <RefreshCw className={`ui-icon ${loading ? "spin" : ""}`} aria-hidden="true" />
        </button>
      </div>
      <div className="file-list local-file-list">
        {!hasTauriRuntime() ? (
          <p className="file-panel-empty">{t("files.local.unavailable")}</p>
        ) : !currentPath ? (
          <p className="file-panel-empty">{t("files.local.selectHint")}</p>
        ) : (
          <>
            {error ? <p className="file-panel-error">{error}</p> : null}
            {loading && entries.length === 0 ? (
              <p className="file-panel-empty">{t("files.local.reading")}</p>
            ) : entries.length === 0 ? (
              error ? null : <p className="file-panel-empty">{t("files.local.empty")}</p>
            ) : (
              <section className="remote-file-tree" aria-label={t("files.local.title")}>
                {entries.map((entry) => {
                  const isDirectory = entry.kind === "directory";
                  return (
                    <button
                      className="remote-file-row local-file-row"
                      draggable
                      key={entry.path}
                      type="button"
                      onClick={() => isDirectory && void loadDirectory(entry.path)}
                      onDragStart={(event) => handleEntryDragStart(event, entry)}
                    >
                      {isDirectory ? (
                        <Folder className="ui-icon" aria-hidden="true" />
                      ) : (
                        <FileText className="ui-icon" aria-hidden="true" />
                      )}
                      <span className="local-file-name">{entry.name}</span>
                      <span className="local-file-kind">
                        {isDirectory ? t("files.local.directory") : t("files.local.file")}
                      </span>
                    </button>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function localPathParent(path: string) {
  const trimmed = path.trim();
  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(
    withoutTrailingSeparators.lastIndexOf("/"),
    withoutTrailingSeparators.lastIndexOf("\\"),
  );
  if (separatorIndex < 0) {
    return trimmed;
  }
  const parent = withoutTrailingSeparators.slice(0, separatorIndex);
  if (!parent) {
    return withoutTrailingSeparators.startsWith("/") ? "/" : trimmed;
  }
  if (/^[A-Za-z]:$/.test(parent)) {
    return `${parent}\\`;
  }
  return parent;
}

function formatLocalFileError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message: unknown }).message);
    return message || fallback;
  }
  return error ? String(error) : fallback;
}
