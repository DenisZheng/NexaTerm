import { describe, expect, it } from "vitest";

import {
  groupByConnection,
  selectActiveConnectedTerminalTab,
  selectActiveSession,
  selectActiveTerminalSplitBinding,
  selectActiveTerminalTab,
  selectConnectionSessions,
} from "./selectors";

const rdp = (id: string, connectionId: string) => ({ connectionId, id });

describe("groupByConnection", () => {
  it("按 connectionId 分组并保持插入顺序", () => {
    const groups = groupByConnection([rdp("1", "a"), rdp("2", "b"), rdp("3", "a")]);
    expect([...groups.keys()]).toEqual(["a", "b"]);
    expect(groups.get("a")?.map((s) => s.id)).toEqual(["1", "3"]);
  });

  it("空输入返回空 Map", () => {
    expect(groupByConnection([]).size).toBe(0);
  });
});

describe("selectConnectionSessions", () => {
  it("终端 → RDP → VNC 顺序合并同一连接的 tab", () => {
    const t = new Map([["a", [{ id: "t1" }]]]);
    const r = new Map([["a", [{ id: "r1" }]], ["b", [{ id: "r2" }]]]);
    const v = new Map([["a", [{ id: "v1" }]]]);
    expect(selectConnectionSessions(t, r, v)).toEqual([
      { connectionId: "a", tabs: [{ id: "t1" }, { id: "r1" }, { id: "v1" }] },
      { connectionId: "b", tabs: [{ id: "r2" }] },
    ]);
  });

  it("不改变输入 Map 里的数组", () => {
    const tabs = [{ id: "t1" }];
    const t = new Map([["a", tabs]]);
    selectConnectionSessions(t, new Map([["a", [{ id: "r1" }]]]), new Map());
    expect(tabs).toEqual([{ id: "t1" }]);
  });
});

describe("selectActiveSession", () => {
  const sessions = [rdp("1", "a"), rdp("2", "a"), rdp("3", "b")];
  const byConn = groupByConnection(sessions);

  it("activeSessionId 命中且属于活动连接时返回它", () => {
    expect(selectActiveSession(sessions, byConn, "2", "a")?.id).toBe("2");
  });

  it("activeSessionId 属于别的连接时回退到活动连接的第一个", () => {
    expect(selectActiveSession(sessions, byConn, "3", "a")?.id).toBe("1");
  });

  it("没有 activeConnectionId 时 activeSessionId 直接生效", () => {
    expect(selectActiveSession(sessions, byConn, "3", null)?.id).toBe("3");
  });

  it("都没有时返回 null", () => {
    expect(selectActiveSession(sessions, byConn, null, null)).toBeNull();
    expect(selectActiveSession(sessions, byConn, "9", "zz")).toBeNull();
  });
});

describe("终端 tab 派生", () => {
  const tabs = [
    { id: "t1", sessionId: "s1", type: "terminal" as const },
    { id: "t2", type: "connecting" as const },
    { id: "t3", type: "terminal" as const },
  ];

  it("selectActiveTerminalTab 按 id 查找", () => {
    expect(selectActiveTerminalTab(tabs, "t2")?.id).toBe("t2");
    expect(selectActiveTerminalTab(tabs, null)).toBeNull();
    expect(selectActiveTerminalTab(tabs, "nope")).toBeNull();
  });

  it("selectActiveConnectedTerminalTab 只认已建会话的 terminal", () => {
    expect(selectActiveConnectedTerminalTab(tabs[0]!)?.id).toBe("t1");
    expect(selectActiveConnectedTerminalTab(tabs[1]!)).toBeNull();
    expect(selectActiveConnectedTerminalTab(tabs[2]!)).toBeNull();
    expect(selectActiveConnectedTerminalTab(null)).toBeNull();
  });

  it("selectActiveTerminalSplitBinding 按 mode 选 ssh/local，其它模式为 null", () => {
    expect(selectActiveTerminalSplitBinding("ssh", { id: "t1" }, { id: "l1" })).toEqual({ kind: "ssh", tabId: "t1" });
    expect(selectActiveTerminalSplitBinding("local", { id: "t1" }, { id: "l1" })).toEqual({ kind: "local", tabId: "l1" });
    expect(selectActiveTerminalSplitBinding("ssh", null, { id: "l1" })).toBeNull();
    expect(selectActiveTerminalSplitBinding("rdp", { id: "t1" }, { id: "l1" })).toBeNull();
    expect(selectActiveTerminalSplitBinding("home", { id: "t1" }, { id: "l1" })).toBeNull();
  });
});
