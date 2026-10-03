import { describe, expect, it } from "vitest";

import { initialMultiExecState, multiExecReducer } from "./reducer";

describe("multiExecReducer", () => {
  it("unknown action and no-op preserve the original reference", () => {
    expect(multiExecReducer(initialMultiExecState, { type: "x" } as never)).toBe(initialMultiExecState);
    expect(
      multiExecReducer(initialMultiExecState, { type: "multiExec/setMode", mode: "off" }),
    ).toBe(initialMultiExecState);
  });

  it("supports the unified off/live/send modes", () => {
    const live = multiExecReducer(initialMultiExecState, {
      type: "multiExec/setMode",
      mode: "live",
    });
    expect(live.mode).toBe("live");

    const send = multiExecReducer(live, {
      type: "multiExec/setMode",
      mode: "send",
    });
    expect(send.mode).toBe("send");

    expect(
      multiExecReducer(send, { type: "multiExec/setMode", mode: "off" }).mode,
    ).toBe("off");
  });

  it("keeps the temporary setLive compatibility action", () => {
    const live = multiExecReducer(initialMultiExecState, {
      type: "multiExec/setLive",
      enabled: true,
    });
    expect(live.mode).toBe("live");
    expect(
      multiExecReducer(live, { type: "multiExec/setLive", enabled: false }).mode,
    ).toBe("off");
  });

  it("setTargets is the only action that can explicitly add targets", () => {
    const next = multiExecReducer(initialMultiExecState, {
      type: "multiExec/setTargets",
      targets: (current) => new Set([...current, "ssh:a", "ssh:b"]),
    });
    expect(next.targets).toEqual(new Set(["ssh:a", "ssh:b"]));
  });

  it("focus changes never add or replace explicit targets", () => {
    const state = {
      error: null,
      mode: "live" as const,
      targets: new Set(["ssh:a", "ssh:b"]),
    };
    const next = multiExecReducer(state, {
      type: "multiExec/targetsAvailable",
      availableKeys: new Set(["ssh:a", "ssh:b", "ssh:c"]),
      focusedKey: "ssh:c",
      splitActive: true,
    });

    expect(next.targets).toBe(state.targets);
    expect(next.targets).toEqual(new Set(["ssh:a", "ssh:b"]));
    expect(next.mode).toBe("live");
  });

  it("availability removes disconnected targets without auto-joining a replacement instance", () => {
    const state = {
      error: null,
      mode: "send" as const,
      targets: new Set(["ssh:old-a", "ssh:b"]),
    };
    const next = multiExecReducer(state, {
      type: "multiExec/targetsAvailable",
      // ssh:new-a represents a reconnected/new instance of the same profile.
      availableKeys: new Set(["ssh:new-a", "ssh:b"]),
      focusedKey: "ssh:new-a",
      splitActive: true,
    });

    expect(next.targets).toEqual(new Set(["ssh:b"]));
    expect(next.targets.has("ssh:new-a")).toBe(false);
    expect(next.mode).toBe("send");
  });

  it("legacy split availability can turn live off but never changes send mode", () => {
    const live = {
      error: null,
      mode: "live" as const,
      targets: new Set(["ssh:a", "ssh:b"]),
    };
    expect(
      multiExecReducer(live, {
        type: "multiExec/targetsAvailable",
        availableKeys: new Set(["ssh:a", "ssh:b"]),
        splitActive: false,
      }).mode,
    ).toBe("off");

    const send = { ...live, mode: "send" as const };
    expect(
      multiExecReducer(send, {
        type: "multiExec/targetsAvailable",
        availableKeys: new Set(["ssh:a"]),
        splitActive: false,
      }),
    ).toMatchObject({
      mode: "send",
      targets: new Set(["ssh:a"]),
    });
  });

  it("availability preserves the target set reference when nothing changed", () => {
    const state = {
      error: null,
      mode: "off" as const,
      targets: new Set(["ssh:a", "ssh:b"]),
    };
    const next = multiExecReducer(state, {
      type: "multiExec/targetsAvailable",
      availableKeys: new Set(["ssh:a", "ssh:b"]),
      focusedKey: "ssh:z",
      splitActive: true,
    });
    expect(next).toBe(state);
  });
});
