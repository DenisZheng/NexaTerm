import { describe, expect, it } from "vitest";

import { initialMultiExecState, multiExecReducer } from "./reducer";

describe("multiExecReducer", () => {
  it("未知 action 与无变化返回原引用", () => {
    expect(multiExecReducer(initialMultiExecState, { type: "x" } as never)).toBe(initialMultiExecState);
    expect(multiExecReducer(initialMultiExecState, { type: "multiExec/setLive", enabled: false })).toBe(
      initialMultiExecState,
    );
  });

  it("setLive 切换 mode", () => {
    const live = multiExecReducer(initialMultiExecState, { type: "multiExec/setLive", enabled: true });
    expect(live.mode).toBe("live");
    expect(multiExecReducer(live, { type: "multiExec/setLive", enabled: false }).mode).toBe("off");
  });

  it("setTargets 支持函数式更新", () => {
    const next = multiExecReducer(initialMultiExecState, {
      type: "multiExec/setTargets",
      targets: (current) => new Set([...current, "ssh:a"]),
    });
    expect(next.targets).toEqual(new Set(["ssh:a"]));
  });

  it("targetsAvailable：收缩到可用集合，live 下把焦点 key 加回", () => {
    const state = { error: null, mode: "live" as const, targets: new Set(["ssh:a", "ssh:b", "ssh:c"]) };
    const next = multiExecReducer(state, {
      type: "multiExec/targetsAvailable",
      availableKeys: new Set(["ssh:a", "ssh:d"]),
      focusedKey: "ssh:d",
      splitActive: true,
    });
    expect(next.targets).toEqual(new Set(["ssh:a", "ssh:d"]));
    expect(next.mode).toBe("live");
  });

  it("targetsAvailable：可用数 < 2 或 split 不活动时关闭 live", () => {
    const state = { error: null, mode: "live" as const, targets: new Set(["ssh:a", "ssh:b"]) };
    expect(
      multiExecReducer(state, {
        type: "multiExec/targetsAvailable",
        availableKeys: new Set(["ssh:a"]),
        focusedKey: "ssh:a",
        splitActive: true,
      }).mode,
    ).toBe("off");
    expect(
      multiExecReducer(state, {
        type: "multiExec/targetsAvailable",
        availableKeys: new Set(["ssh:a", "ssh:b"]),
        focusedKey: "ssh:a",
        splitActive: false,
      }).mode,
    ).toBe("off");
  });

  it("targetsAvailable：集合无变化时保留原 targets 引用", () => {
    const state = { error: null, mode: "off" as const, targets: new Set(["ssh:a", "ssh:b"]) };
    const next = multiExecReducer(state, {
      type: "multiExec/targetsAvailable",
      availableKeys: new Set(["ssh:a", "ssh:b"]),
      focusedKey: null,
      splitActive: true,
    });
    expect(next).toBe(state);
  });
});
