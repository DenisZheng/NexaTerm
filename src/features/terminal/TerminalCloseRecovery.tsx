import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { t as tr } from "../../shared/i18n";
import { terminalClose } from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { createTerminalCloseCoordinator, type TerminalCloseFailure } from "./terminalCloseCoordinator";

export function useTerminalCloseRecovery(formatError: (error: unknown) => string) {
  const [failures, setFailures] = useState<TerminalCloseFailure[]>([]);
  const [retrying, setRetrying] = useState(false);
  const coordinatorRef = useRef<ReturnType<typeof createTerminalCloseCoordinator> | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createTerminalCloseCoordinator(terminalClose, setFailures, formatError);
  }

  function closeRuntimeTerminalSession(sessionId: string) {
    if (!hasTauriRuntime()) return Promise.resolve();
    return coordinatorRef.current?.close(sessionId) ?? Promise.resolve();
  }

  function closeRuntimeTerminalSessions(tabs: Array<{ sessionId?: string }>) {
    const sessionIds = new Set(
      tabs.map((tab) => tab.sessionId).filter((sessionId): sessionId is string => Boolean(sessionId)),
    );
    sessionIds.forEach((sessionId) => {
      void closeRuntimeTerminalSession(sessionId);
    });
  }

  async function retryFailedTerminalCloses() {
    if (retrying || failures.length === 0) return;
    setRetrying(true);
    try {
      await coordinatorRef.current?.retryPending();
    } finally {
      setRetrying(false);
    }
  }

  return { failures, retrying, closeRuntimeTerminalSession, closeRuntimeTerminalSessions, retryFailedTerminalCloses };
}

export function TerminalCloseRecoveryBanner({
  count,
  retrying,
  onRetry,
}: {
  count: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="terminal-close-failures" role="alert">
      <span>{tr("workspace.terminalClose.failed", { count })}</span>
      <button type="button" disabled={retrying} onClick={onRetry}>
        <RefreshCw className={retrying ? "ui-icon spin" : "ui-icon"} aria-hidden="true" />
        {retrying ? tr("workspace.terminalClose.retrying") : tr("workspace.terminalClose.retry")}
      </button>
    </div>
  );
}
