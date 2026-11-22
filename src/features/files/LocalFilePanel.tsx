import { ArrowUp, FileText, Folder, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";

import { localFileList } from "../../shared/tauri/commands";
import { selectLocalDirectory } from "../../shared/tauri/dialog";
import { useI18n } from "../../shared/i18n";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import type { LocalFileEntry } from "./remoteFileTypes";
import { localDirectoryParent } from "./localFilePaths";

import { LOCAL_FILE_DROP_TYPE, REMOTE_FILE_DROP_TYPE, readRemoteFileDrop, type RemoteFileDrop } from "./remoteFileDrop";
export { LOCAL_FILE_DROP_TYPE } from "./remoteFileDrop";

interface LocalFilePanelProps {
  active: boolean;
  onDownload?: (source: RemoteFileDrop, localDirectory: string) => void;
}

export function LocalFilePanel({ active, onDownload }: LocalFilePanelProps) {
  const { t } = useI18n();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  useEffect(() => () => { requestGeneration.current += 1; }, [active]);

  const loadDirectory = useCallback(async (path: string) => {
    const normalized = path.trim();
    if (!normalized) {
      setError(t("files.local.invalidPath"));
      return;
    }
    setLoading(true);
    setError(null);
    const generation = ++requestGeneration.current;
    try {
      const nextEntries = await localFileList(normalized);
      if (generation !== requestGeneration.current) return;
      setCurrentPath(normalized);
      setPathInput(normalized);
      setEntries(nextEntries);
    } catch (loadError) {
      if (generation !== requestGeneration.current) return;
      setError(formatLocalFileError(loadError, t("files.local.error")));
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!active) {
      return;
    }
    setLoading(false);
  }, [active]);

  if (!active) {
    return <aside className="local-file-panel is-hidden" aria-hidden="true" />;
  }

  const canNavigateToParent = currentPath ? localDirectoryParent(currentPath) !== currentPath : false;

  function submitPath(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadDirectory(pathInput);
  }

  function chooseDirectory() {
    if (!hasTauriRuntime()) {
      setError(t("files.local.unavailable"));
      return;
    }
    const generation = ++requestGeneration.current;
    setLoading(false);
    void selectLocalDirectory()
      .then((path) => {
        if (generation !== requestGeneration.current) return;
        if (path) {
          return loadDirectory(path);
        }
        return undefined;
      })
      .catch((selectError) => {
        if (generation !== requestGeneration.current) return;
        setError(formatLocalFileError(selectError, t("files.local.error")));
      });
  }

  function handleEntryDragStart(event: DragEvent<HTMLButtonElement>, entry: LocalFileEntry) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(LOCAL_FILE_DROP_TYPE, JSON.stringify({ paths: [entry.path] }));
    event.dataTransfer.setData("text/plain", entry.path);
  }

  function allowRemoteDrop(event: DragEvent<HTMLElement>) {
    if (!currentPath || !onDownload || !Array.from(event.dataTransfer.types).includes(REMOTE_FILE_DROP_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function receiveRemoteDrop(event: DragEvent<HTMLElement>, target: string | null) {
    if (!target || !onDownload) return;
    const source = readRemoteFileDrop(event.dataTransfer.getData(REMOTE_FILE_DROP_TYPE));
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    onDownload(source, target);
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
          onClick={() => currentPath && void loadDirectory(localDirectoryParent(currentPath))}
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
      <div className="file-list local-file-list" onDragOver={allowRemoteDrop} onDrop={(event) => receiveRemoteDrop(event, currentPath)}>
        {error ? <p className="file-panel-error" role="alert">{error}</p> : null}
        {!hasTauriRuntime() ? (
          <p className="file-panel-empty">{t("files.local.unavailable")}</p>
        ) : !currentPath ? (
          <p className="file-panel-empty">{t("files.local.selectHint")}</p>
        ) : (
          <>
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
                      draggable={entry.kind === "file" || isDirectory}
                      key={entry.path}
                      type="button"
                      onClick={() => isDirectory && void loadDirectory(entry.path)}
                      onDragStart={(event) => handleEntryDragStart(event, entry)}
                      onDragOver={isDirectory ? allowRemoteDrop : undefined}
                      onDrop={isDirectory ? (event) => receiveRemoteDrop(event, entry.path) : undefined}
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

function formatLocalFileError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message: unknown }).message);
    return message || fallback;
  }
  return error ? String(error) : fallback;
}
