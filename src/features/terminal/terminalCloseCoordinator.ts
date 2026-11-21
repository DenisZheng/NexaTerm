export type TerminalCloseFailure = {
  sessionId: string;
  message: string;
};

export type TerminalCloseCoordinator = {
  close(sessionId: string): Promise<void>;
  retryPending(): Promise<void>;
  getPending(): TerminalCloseFailure[];
};

export function createTerminalCloseCoordinator(
  closeSession: (sessionId: string) => Promise<void>,
  onPendingChange: (failures: TerminalCloseFailure[]) => void,
  formatError: (error: unknown) => string,
): TerminalCloseCoordinator {
  const pending = new Map<string, string>();
  const inFlight = new Map<string, Promise<void>>();

  function publishPending() {
    onPendingChange(
      Array.from(pending, ([sessionId, message]) => ({ sessionId, message })),
    );
  }

  function close(sessionId: string): Promise<void> {
    const existing = inFlight.get(sessionId);
    if (existing) {
      return existing;
    }

    const operation = Promise.resolve()
      .then(async () => {
        try {
          await closeSession(sessionId);
          pending.delete(sessionId);
        } catch (error) {
          pending.set(sessionId, formatError(error));
        }
        publishPending();
      })
      .finally(() => {
        if (inFlight.get(sessionId) === operation) {
          inFlight.delete(sessionId);
        }
      });

    inFlight.set(sessionId, operation);
    return operation;
  }

  async function retryPending() {
    await Promise.all(Array.from(pending.keys(), (sessionId) => close(sessionId)));
  }

  return {
    close,
    retryPending,
    getPending: () =>
      Array.from(pending, ([sessionId, message]) => ({ sessionId, message })),
  };
}
