import { useEffect, useReducer, useRef, useState } from "react";
import { X } from "lucide-react";
import { useI18n, type MessageKey } from "../../shared/i18n";
import type { createWorkspaceActionExecutor } from "../shortcuts/actionExecutor";
import { actionReasonKeys } from "../shortcuts/actionPresentation";
import type { WorkspaceActionRequest } from "../shortcuts/actionRegistry";
import type { NewSessionMenuProps } from "./NewSessionMenu";
import { AppMenuBar } from "./AppMenuBar";
import { AppToolbar } from "./AppToolbar";
import "../../styles/actionbar.css";

/** 4C presentation boundary. The shell injects its stable executor in 4D. */
export function AppActionBar({ executor, newSession, activeActions }: {
  executor: ReturnType<typeof createWorkspaceActionExecutor>;
  newSession: NewSessionMenuProps;
  activeActions?: Readonly<Record<string, boolean>>;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function run(request: WorkspaceActionRequest) {
    setMessage(null);
    try {
      const pending = executor.run(request);
      refresh();
      const result = await pending;
      if (!mounted.current) return;
      setMessage(result.status === "failed" ? "actionBar.failed"
        : result.status === "disabled" && result.state.reason ? actionReasonKeys[result.state.reason] : null);
    } catch {
      if (mounted.current) setMessage("actionBar.failed");
    } finally {
      if (mounted.current) refresh();
    }
  }
  const props = { newSession, resolveAction: executor.resolve, onRunAction: (request: WorkspaceActionRequest) => { void run(request); } };
  return (
    <div className="app-actionbar-container">
      <div className="app-actionbar">
        <AppMenuBar {...props} />
        <AppToolbar {...props} activeActions={activeActions} />
      </div>
      {message ? (
        <div className="app-action-feedback" role="alert">
          <span>{t(message)}</span>
          <button type="button" className="app-toolbar-button" aria-label={t("actionBar.dismiss")} onClick={() => setMessage(null)}>
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
