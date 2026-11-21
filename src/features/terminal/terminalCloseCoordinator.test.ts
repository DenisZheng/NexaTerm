import { describe, expect, it, vi } from "vitest";
import { createTerminalCloseCoordinator } from "./terminalCloseCoordinator";

describe("terminal close coordinator", () => {
  it("retains a failed close and clears it after a successful retry", async () => {
    let attempts = 0;
    const closeSession = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary close failure");
      }
    });
    const onPendingChange = vi.fn();
    const coordinator = createTerminalCloseCoordinator(
      closeSession,
      onPendingChange,
      (error) => error instanceof Error ? error.message : "unknown error",
    );

    await coordinator.close("session-a");

    expect(coordinator.getPending()).toEqual([
      { sessionId: "session-a", message: "temporary close failure" },
    ]);

    await coordinator.retryPending();

    expect(closeSession).toHaveBeenCalledTimes(2);
    expect(coordinator.getPending()).toEqual([]);
    expect(onPendingChange).toHaveBeenLastCalledWith([]);
  });

  it("deduplicates concurrent close requests for the same session", async () => {
    let release!: () => void;
    const closeSession = vi.fn(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const coordinator = createTerminalCloseCoordinator(
      closeSession,
      () => undefined,
      () => "close failed",
    );

    const first = coordinator.close("session-a");
    const second = coordinator.close("session-a");
    await Promise.resolve();

    expect(closeSession).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);

    expect(coordinator.getPending()).toEqual([]);
  });

  it("keeps failures isolated to the affected session", async () => {
    const closeSession = vi.fn(async (sessionId: string) => {
      if (sessionId === "session-a") {
        throw new Error("session-a failed");
      }
    });
    const coordinator = createTerminalCloseCoordinator(
      closeSession,
      () => undefined,
      (error) => error instanceof Error ? error.message : "unknown error",
    );

    await coordinator.close("session-a");
    await coordinator.close("session-b");

    expect(coordinator.getPending()).toEqual([
      { sessionId: "session-a", message: "session-a failed" },
    ]);
  });
});
