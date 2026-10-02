export interface TerminalScopedEvent {
  request_id: string | null;
  session_id: string;
}

export function matchesTerminalEvent(
  event: TerminalScopedEvent,
  sessionId: string | null,
  activeRequestId: string | null,
) {
  return (
    (Boolean(sessionId) && event.session_id === sessionId) ||
    (Boolean(activeRequestId) && event.request_id === activeRequestId)
  );
}
