import { FileText, List } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { useI18n } from "../../shared/i18n";

export type WorkspaceSidebarView = "sessions" | "files";

export interface WorkspaceSidebarFileContext {
  connectionId: string;
  connectionName: string | null;
  instanceTitle?: string | null;
  address?: string | null;
  status?: string;
  paneNumber?: number | null;
  path: string | null;
  tabId: string;
}

interface WorkspaceSidebarProps {
  activeView: WorkspaceSidebarView;
  fileContext: WorkspaceSidebarFileContext | null;
  files?: ReactNode;
  onViewChange: (view: WorkspaceSidebarView) => void;
  sessions: ReactNode;
}

export const workspaceSidebarViewStorageKey = "mxterm.workspaceSidebarView.v1";

function browserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredWorkspaceSidebarView(
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): WorkspaceSidebarView {
  try {
    return storage?.getItem(workspaceSidebarViewStorageKey) === "files" ? "files" : "sessions";
  } catch {
    return "sessions";
  }
}

export function writeStoredWorkspaceSidebarView(
  view: WorkspaceSidebarView,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
) {
  try {
    storage?.setItem(workspaceSidebarViewStorageKey, view);
  } catch {
    // Sidebar selection is non-critical UI state; storage failures must not block the workspace.
  }
}

export function WorkspaceSidebar({
  activeView,
  fileContext,
  files,
  onViewChange,
  sessions,
}: WorkspaceSidebarProps) {
  const { t } = useI18n();
  const sessionsTabRef = useRef<HTMLButtonElement | null>(null);
  const filesTabRef = useRef<HTMLButtonElement | null>(null);

  function selectAndFocus(view: WorkspaceSidebarView) {
    onViewChange(view);
    (view === "sessions" ? sessionsTabRef : filesTabRef).current?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let next: WorkspaceSidebarView | null = null;
    if (event.key === "ArrowLeft" || event.key === "Home") {
      next = "sessions";
    } else if (event.key === "ArrowRight" || event.key === "End") {
      next = "files";
    }
    if (!next) {
      return;
    }
    event.preventDefault();
    selectAndFocus(next);
  }

  return (
    <section className="workspace-sidebar app-sidebar" aria-label={t("sidebar.workspace")}>
      <div className="workspace-sidebar-switcher" role="tablist" aria-label={t("sidebar.switcher")}>
        <button
          aria-controls="workspace-sidebar-panel-sessions"
          aria-selected={activeView === "sessions"}
          className="workspace-sidebar-tab"
          id="workspace-sidebar-tab-sessions"
          ref={sessionsTabRef}
          role="tab"
          tabIndex={activeView === "sessions" ? 0 : -1}
          type="button"
          onClick={() => onViewChange("sessions")}
          onKeyDown={handleTabKeyDown}
        >
          <List className="ui-icon" aria-hidden="true" />
          <span>{t("sidebar.sessions")}</span>
        </button>
        <button
          aria-controls="workspace-sidebar-panel-files"
          aria-selected={activeView === "files"}
          className="workspace-sidebar-tab"
          id="workspace-sidebar-tab-files"
          ref={filesTabRef}
          role="tab"
          tabIndex={activeView === "files" ? 0 : -1}
          type="button"
          onClick={() => onViewChange("files")}
          onKeyDown={handleTabKeyDown}
        >
          <FileText className="ui-icon" aria-hidden="true" />
          <span>{t("sidebar.files")}</span>
        </button>
      </div>

      {activeView === "sessions" ? (
        <div
          aria-labelledby="workspace-sidebar-tab-sessions"
          className="workspace-sidebar-content"
          id="workspace-sidebar-panel-sessions"
          role="tabpanel"
        >
          {sessions}
        </div>
      ) : (
        <WorkspaceSidebarFiles fileContext={fileContext} files={files} />
      )}
    </section>
  );
}

function WorkspaceSidebarFiles({
  fileContext,
  files,
}: {
  fileContext: WorkspaceSidebarFileContext | null;
  files?: ReactNode;
}) {
  const { t } = useI18n();
  const live = Boolean(fileContext && files);
  return (
    <div
      aria-labelledby="workspace-sidebar-tab-files"
      className={`workspace-sidebar-files ${live ? "is-live" : ""}`}
      data-connection-id={fileContext?.connectionId}
      data-terminal-id={fileContext?.tabId}
      id="workspace-sidebar-panel-files"
      role="tabpanel"
    >
      {live ? (
        <>
          <header className="workspace-sidebar-instance" aria-label={t("sidebar.filesContext")}>
            <strong title={fileContext?.instanceTitle || fileContext?.connectionName || undefined}>
              {fileContext?.instanceTitle || fileContext?.connectionName}
            </strong>
            {fileContext?.address ? <span title={fileContext.address}>{fileContext.address}</span> : null}
            <small>
              {fileContext?.paneNumber ? t("sidebar.filesPane", { n: fileContext.paneNumber }) : t("kind.ssh")}
              {fileContext?.status ? ` · ${fileContext.status}` : ""}
            </small>
          </header>
          {files}
        </>
      ) : (
        <>
          <header className="workspace-sidebar-files-head">
            <FileText className="ui-icon" aria-hidden="true" />
            <div className="workspace-sidebar-files-copy">
              <strong>{t("sidebar.filesTitle")}</strong>
              <p>{fileContext ? t("sidebar.filesBound") : t("sidebar.filesUnavailable")}</p>
            </div>
          </header>
          <p className="workspace-sidebar-files-note">{t("sidebar.filesPlaceholder")}</p>
        </>
      )}
    </div>
  );
}
