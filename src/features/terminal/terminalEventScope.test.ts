import { describe, expect, it } from "vitest";

import { matchesTerminalEvent } from "./terminalEventScope";

describe("WF-03B terminal cwd event scope", () => {
  it("accepts events for the active session or active connect request", () => {
    expect(matchesTerminalEvent(
      { request_id: "req-a", session_id: "session-a" },
      "session-a",
      "req-a",
    )).toBe(true);
    expect(matchesTerminalEvent(
      { request_id: "req-a", session_id: "warming" },
      null,
      "req-a",
    )).toBe(true);
  });

  it("rejects stale output that could carry an old cwd after reconnect", () => {
    const oldEvent = { request_id: "req-old", session_id: "session-old" };
    expect(matchesTerminalEvent(oldEvent, "session-new", "req-new")).toBe(false);
  });

  it("rejects a sibling terminal event even when both terminals use the same saved profile", () => {
    expect(matchesTerminalEvent(
      { request_id: "pane-b-request", session_id: "pane-b-session" },
      "pane-a-session",
      "pane-a-request",
    )).toBe(false);
  });
});
