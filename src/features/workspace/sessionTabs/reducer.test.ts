import { describe, expect, it } from "vitest";

import type { CloseSnapshot } from "./closeDecision";
import { initialSessionPointerState, sessionPointerReducer, type SessionPointerState } from "./reducer";

const home: SessionPointerState = { ...initialSessionPointerState, homeActive: true };

describe("基本", () => {
  it("未知 action 与无变化返回原引用", () => {
    expect(sessionPointerReducer(home, { type: "x" } as never)).toBe(home);
    expect(sessionPointerReducer(home, { type: "tabs/consumeFollowUp" })).toBe(home);
    expect(sessionPointerReducer(home, { type: "tabs/goHome" })).toBe(home);
  });
});

describe("激活", () => {
  it("activateTerminal 一次写齐 view/mode/home/connection/tab 与记忆", () => {
    const next = sessionPointerReducer(
      { ...home, activeView: "settings" },
      { type: "tabs/activateTerminal", connectionId: "a", tabId: "t1", rememberUnified: true },
    );
    expect(next).toMatchObject({
      activeView: "workspace",
      mode: "ssh",
      homeActive: false,
      activeConnectionId: "a",
      activeTabId: "t1",
      activeTabByConnectionId: { a: "t1" },
      activeUnifiedTabByConnectionId: { a: { kind: "terminal", id: "t1" } },
    });
  });

  it("activateTerminal 在非 unified 模式不写 unified 记忆", () => {
    const next = sessionPointerReducer(home, {
      type: "tabs/activateTerminal",
      connectionId: "a",
      tabId: "t1",
      rememberUnified: false,
    });
    expect(next.activeUnifiedTabByConnectionId).toEqual({});
  });

  it("activateLocal / activateRdp / activateVnc 各写对应指针，不碰其它类型指针", () => {
    const base = { ...home, activeTabId: "t1", activeConnectionId: "a" };
    const local = sessionPointerReducer(base, { type: "tabs/activateLocal", tabId: "l1" });
    expect(local).toMatchObject({ mode: "local", homeActive: false, activeLocalTerminalTabId: "l1", activeTabId: "t1", activeConnectionId: "a" });
    const rdp = sessionPointerReducer(base, { type: "tabs/activateRdp", connectionId: "b", sessionId: "r1" });
    expect(rdp).toMatchObject({ mode: "rdp", activeConnectionId: "b", activeRdpSessionId: "r1", activeTabId: "t1" });
    const vnc = sessionPointerReducer(base, { type: "tabs/activateVnc", connectionId: "c", sessionId: "v1" });
    expect(vnc).toMatchObject({ mode: "vnc", activeConnectionId: "c", activeVncSessionId: "v1" });
  });

  it("activateFile 不改 activeView，同连接终端 tab 一并激活并记忆", () => {
    const next = sessionPointerReducer(
      { ...home, activeView: "settings" },
      { type: "tabs/activateFile", connectionId: "a", fileTabId: "f1", rememberUnified: true, terminalTabId: "t2" },
    );
    expect(next).toMatchObject({
      activeView: "settings",
      mode: "ssh",
      homeActive: false,
      activeConnectionId: "a",
      activeRemoteFileTabId: "f1",
      activeTabId: "t2",
      activeTabByConnectionId: { a: "t2" },
      activeUnifiedTabByConnectionId: { a: { kind: "file", id: "f1" } },
    });
  });

  it("activateFile 无终端 tab 时不动 activeTabId", () => {
    const next = sessionPointerReducer(
      { ...home, activeTabId: "keep" },
      { type: "tabs/activateFile", connectionId: "a", fileTabId: "f1", rememberUnified: false, terminalTabId: null },
    );
    expect(next.activeTabId).toBe("keep");
    expect(next.activeTabByConnectionId).toEqual({});
  });

  it("activateSplitHost：ssh 宿主写 connectionId，local 宿主不写", () => {
    const ssh = sessionPointerReducer(home, { type: "tabs/activateSplitHost", host: { kind: "ssh", connectionId: "a" } });
    expect(ssh).toMatchObject({ mode: "ssh", activeConnectionId: "a", homeActive: false });
    const local = sessionPointerReducer({ ...home, activeConnectionId: "z" }, { type: "tabs/activateSplitHost", host: { kind: "local" } });
    expect(local).toMatchObject({ mode: "local", activeConnectionId: "z" });
  });
});

describe("回首页", () => {
  const busy: SessionPointerState = {
    ...home,
    activeConnectionId: "a",
    activeTabId: "t1",
    activeRdpSessionId: "r1",
    activeVncSessionId: "v1",
    activeLocalTerminalTabId: "l1",
    activeRemoteFileTabId: "f1",
    homeActive: false,
    mode: "ssh",
    activeView: "settings",
  };

  it("goHome 只改 view/mode/home，保留指针", () => {
    const next = sessionPointerReducer(busy, { type: "tabs/goHome" });
    expect(next).toMatchObject({ activeView: "workspace", mode: "home", homeActive: true, activeTabId: "t1", activeConnectionId: "a" });
  });

  it("returnHomeIfEmpty 有任一会话时不动", () => {
    expect(sessionPointerReducer(busy, { type: "tabs/returnHomeIfEmpty", counts: { local: 0, rdp: 0, ssh: 1, vnc: 0 } })).toBe(busy);
  });

  it("returnHomeIfEmpty 全空时清五个指针并回首页，但保留 activeView 与 remoteFile 指针（与原实现一致）", () => {
    const next = sessionPointerReducer(busy, { type: "tabs/returnHomeIfEmpty", counts: { local: 0, rdp: 0, ssh: 0, vnc: 0 } });
    expect(next).toMatchObject({
      activeConnectionId: null,
      activeTabId: null,
      activeRdpSessionId: null,
      activeVncSessionId: null,
      activeLocalTerminalTabId: null,
      mode: "home",
      homeActive: true,
      activeView: "settings",
      activeRemoteFileTabId: "f1",
    });
  });

  it("fallbackHomeKeepPointers 只清 connection 并回首页", () => {
    const next = sessionPointerReducer(busy, { type: "tabs/fallbackHomeKeepPointers" });
    expect(next).toMatchObject({ activeConnectionId: null, mode: "home", homeActive: true, activeTabId: "t1" });
  });
});

describe("记忆表", () => {
  it("rememberActive 同值同引用，异值新对象", () => {
    const a = sessionPointerReducer(home, { type: "tabs/rememberActive", connectionId: "a", tabId: "t1" });
    expect(a.activeTabByConnectionId).toEqual({ a: "t1" });
    expect(sessionPointerReducer(a, { type: "tabs/rememberActive", connectionId: "a", tabId: "t1" })).toBe(a);
  });

  it("forgetConnections 删除存在的键，空数组或无命中返回原引用", () => {
    const a = sessionPointerReducer(home, { type: "tabs/rememberActive", connectionId: "a", tabId: "t1" });
    expect(sessionPointerReducer(a, { type: "tabs/forgetConnections", connectionIds: [] })).toBe(a);
    expect(sessionPointerReducer(a, { type: "tabs/forgetConnections", connectionIds: ["zz"] })).toBe(a);
    expect(sessionPointerReducer(a, { type: "tabs/forgetConnections", connectionIds: ["a"] }).activeTabByConnectionId).toEqual({});
  });

  it("rememberUnified 按 kind+id 判等", () => {
    const a = sessionPointerReducer(home, { type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "file", id: "f1" } });
    expect(sessionPointerReducer(a, { type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "file", id: "f1" } })).toBe(a);
    expect(
      sessionPointerReducer(a, { type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "terminal", id: "f1" } })
        .activeUnifiedTabByConnectionId,
    ).toEqual({ a: { kind: "terminal", id: "f1" } });
  });

  it("forgetUnified 删除存在的键，空数组或无命中返回原引用", () => {
    const a = sessionPointerReducer(home, { type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "file", id: "f1" } });
    expect(sessionPointerReducer(a, { type: "tabs/forgetUnified", connectionIds: [] })).toBe(a);
    expect(sessionPointerReducer(a, { type: "tabs/forgetUnified", connectionIds: ["zz"] })).toBe(a);
    expect(sessionPointerReducer(a, { type: "tabs/forgetUnified", connectionIds: ["a"] }).activeUnifiedTabByConnectionId).toEqual({});
  });
});

describe("WF-00B：单值 setter 的意图型替代", () => {
  it("focusPaneBinding 只改对应类型的一个指针", () => {
    const ssh = sessionPointerReducer(home, { type: "tabs/focusPaneBinding", binding: { kind: "ssh", tabId: "t1" } });
    expect(ssh).toMatchObject({ activeTabId: "t1", activeLocalTerminalTabId: null, mode: "home" });
    const local = sessionPointerReducer(home, { type: "tabs/focusPaneBinding", binding: { kind: "local", tabId: "l1" } });
    expect(local).toMatchObject({ activeLocalTerminalTabId: "l1", activeTabId: null });
  });

  it("startConnecting 写 mode/home/connection/tab 与记忆，但不改 activeView", () => {
    const next = sessionPointerReducer({ ...home, activeView: "settings" }, { type: "tabs/startConnecting", connectionId: "a", tabId: "c1" });
    expect(next).toMatchObject({
      activeView: "settings",
      mode: "ssh",
      homeActive: false,
      activeConnectionId: "a",
      activeTabId: "c1",
      activeTabByConnectionId: { a: "c1" },
    });
    expect(next.activeUnifiedTabByConnectionId).toEqual({});
  });

  it("openSettings / closeSettings 只改 activeView；clearActiveFile 只清文件指针", () => {
    const opened = sessionPointerReducer(home, { type: "tabs/openSettings" });
    expect(opened.activeView).toBe("settings");
    expect(sessionPointerReducer(opened, { type: "tabs/closeSettings" }).activeView).toBe("workspace");
    expect(sessionPointerReducer(home, { type: "tabs/closeSettings" })).toBe(home);
    const withFile = { ...home, activeRemoteFileTabId: "f1", activeTabId: "t1" };
    expect(sessionPointerReducer(withFile, { type: "tabs/clearActiveFile" })).toMatchObject({ activeRemoteFileTabId: null, activeTabId: "t1" });
    expect(sessionPointerReducer(home, { type: "tabs/clearActiveFile" })).toBe(home);
  });
});

describe("WF-00B：关闭/删除 action 经 closeDecision 落到指针与 followUp", () => {
  const snapshot = {
    localTerminalTabs: [],
    rdpSessions: [{ connectionId: "b", id: "r1" }],
    remoteFileTabs: [],
    terminalTabs: [],
    vncSessions: [],
  };
  const sshActive: SessionPointerState = { ...home, activeTabId: "t1", activeConnectionId: "a", mode: "ssh", homeActive: false, activeTabByConnectionId: { a: "t1" } };

  it("closeTerminals：无终端无文件时写 followUp（rdp），清指针并忘记记忆", () => {
    const next = sessionPointerReducer(sshActive, { type: "tabs/closeTerminals", closingTabs: [{ connectionId: "a", id: "t1" }], snapshot });
    expect(next).toMatchObject({
      activeTabId: null,
      activeConnectionId: null,
      activeTabByConnectionId: {},
      followUp: { kind: "rdp", connectionId: "b", sessionId: "r1" },
      mode: "ssh",
    });
  });

  it("closeTerminals：切到同连接下一个 tab 时记忆更新且无 followUp", () => {
    const next = sessionPointerReducer(sshActive, {
      type: "tabs/closeTerminals",
      closingTabs: [{ connectionId: "a", id: "t1" }],
      snapshot: { ...snapshot, terminalTabs: [{ connectionId: "a", id: "t2" }] },
    });
    expect(next).toMatchObject({ activeTabId: "t2", activeTabByConnectionId: { a: "t2" }, followUp: null });
  });

  it("consumeFollowUp 清除标记；关闭非活动 tab 无变化返回原引用", () => {
    const withFollowUp = sessionPointerReducer(sshActive, { type: "tabs/closeTerminals", closingTabs: [{ connectionId: "a", id: "t1" }], snapshot });
    const consumed = sessionPointerReducer(withFollowUp, { type: "tabs/consumeFollowUp" });
    expect(consumed.followUp).toBeNull();
    expect(sessionPointerReducer(consumed, { type: "tabs/consumeFollowUp" })).toBe(consumed);
    const untouched = sessionPointerReducer(sshActive, {
      type: "tabs/closeTerminals",
      closingTabs: [{ connectionId: "a", id: "t2" }],
      snapshot: { ...snapshot, terminalTabs: [{ connectionId: "a", id: "t1" }] },
    });
    expect(untouched).toBe(sshActive);
  });

  it("closeConnections(delete) 全空回首页；removeRdp 全空清五个指针", () => {
    const deleted = sessionPointerReducer(sshActive, {
      type: "tabs/closeConnections",
      connectionIds: ["a"],
      snapshot: { ...snapshot, rdpSessions: [] },
      variant: "delete",
    });
    expect(deleted).toMatchObject({ activeTabId: null, activeConnectionId: null, mode: "home", homeActive: true, followUp: null });
    const rdpActive: SessionPointerState = { ...home, activeRdpSessionId: "r1", activeConnectionId: "b", mode: "rdp", homeActive: false, activeLocalTerminalTabId: "l0" };
    const removed = sessionPointerReducer(rdpActive, { type: "tabs/removeRdp", closingIds: ["r1"], snapshot: { ...snapshot, rdpSessions: [] } });
    expect(removed).toMatchObject({ activeRdpSessionId: null, activeLocalTerminalTabId: null, activeConnectionId: null, mode: "home", homeActive: true });
  });

  it("closeLocalTerminals / removeVnc 走对应决策", () => {
    const localActive: SessionPointerState = { ...home, activeLocalTerminalTabId: "l1", mode: "local", homeActive: false };
    const next = sessionPointerReducer(localActive, { type: "tabs/closeLocalTerminals", closingIds: ["l1"], snapshot: { ...snapshot, rdpSessions: [], terminalTabs: [{ connectionId: "a", id: "t1" }] } });
    expect(next).toMatchObject({ activeLocalTerminalTabId: null, mode: "ssh", followUp: null });
    const vncActive: SessionPointerState = { ...home, activeVncSessionId: "v1", activeConnectionId: "c", mode: "vnc", homeActive: false };
    const removed = sessionPointerReducer(vncActive, { type: "tabs/removeVnc", closingIds: ["v1"], snapshot });
    expect(removed).toMatchObject({ activeVncSessionId: null, followUp: { kind: "rdp", connectionId: "b", sessionId: "r1" } });
  });
});

describe("WF-01：工作区项顺序表", () => {
  const emptySnapshot: CloseSnapshot = {
    localTerminalTabs: [],
    rdpSessions: [],
    remoteFileTabs: [],
    terminalTabs: [],
    vncSessions: [],
  };

  it("itemOpened 按打开顺序追加，跨类型保持全局顺序", () => {
    const first = sessionPointerReducer(home, { type: "tabs/itemOpened", itemId: "ssh:t1" });
    const second = sessionPointerReducer(first, { type: "tabs/itemOpened", itemId: "local:l1" });
    expect(second.order).toEqual(["ssh:t1", "local:l1"]);
  });

  it("itemOpened 对已在表中的 id 返回原引用，位置不变", () => {
    const opened: SessionPointerState = { ...home, order: ["ssh:t1", "local:l1"] };
    expect(sessionPointerReducer(opened, { type: "tabs/itemOpened", itemId: "ssh:t1" })).toBe(opened);
  });

  it("closeTerminals 只移除快照里已不存在的实例", () => {
    const state: SessionPointerState = { ...home, order: ["ssh:t1", "local:l1", "ssh:t2"] };
    const next = sessionPointerReducer(state, {
      type: "tabs/closeTerminals",
      closingTabs: [{ connectionId: "a", id: "t1" }],
      snapshot: { ...emptySnapshot, localTerminalTabs: [{ id: "l1" }], terminalTabs: [{ connectionId: "a", id: "t2" }] },
    });
    expect(next.order).toEqual(["local:l1", "ssh:t2"]);
  });

  it("closeConnections 移除该连接的全部实例，快照里残留的同连接 RDP / VNC 也一并移除", () => {
    const state: SessionPointerState = { ...home, order: ["ssh:t1", "rdp:r1", "vnc:v1", "local:l1", "rdp:r2"] };
    const next = sessionPointerReducer(state, {
      type: "tabs/closeConnections",
      connectionIds: ["a"],
      snapshot: {
        ...emptySnapshot,
        localTerminalTabs: [{ id: "l1" }],
        rdpSessions: [
          { connectionId: "a", id: "r1" },
          { connectionId: "b", id: "r2" },
        ],
        vncSessions: [{ connectionId: "a", id: "v1" }],
      },
      variant: "sessions",
    });
    expect(next.order).toEqual(["local:l1", "rdp:r2"]);
  });

  it("closeLocalTerminals / removeRdp / removeVnc 移除各自的实例", () => {
    const state: SessionPointerState = { ...home, order: ["local:l1", "rdp:r1", "vnc:v1"] };
    const all: CloseSnapshot = {
      ...emptySnapshot,
      localTerminalTabs: [{ id: "l1" }],
      rdpSessions: [{ connectionId: "b", id: "r1" }],
      vncSessions: [{ connectionId: "c", id: "v1" }],
    };
    expect(
      sessionPointerReducer(state, { type: "tabs/closeLocalTerminals", closingIds: ["l1"], snapshot: { ...all, localTerminalTabs: [] } })
        .order,
    ).toEqual(["rdp:r1", "vnc:v1"]);
    expect(
      sessionPointerReducer(state, { type: "tabs/removeRdp", closingIds: ["r1"], snapshot: { ...all, rdpSessions: [] } }).order,
    ).toEqual(["local:l1", "vnc:v1"]);
    expect(
      sessionPointerReducer(state, { type: "tabs/removeVnc", closingIds: ["v1"], snapshot: { ...all, vncSessions: [] } }).order,
    ).toEqual(["local:l1", "rdp:r1"]);
  });

  it("关闭非活动实例且顺序表无需裁剪时返回原引用", () => {
    const state: SessionPointerState = {
      ...home,
      activeConnectionId: "a",
      activeTabId: "t1",
      homeActive: false,
      mode: "ssh",
      order: ["ssh:t1"],
    };
    const next = sessionPointerReducer(state, {
      type: "tabs/closeTerminals",
      closingTabs: [{ connectionId: "a", id: "t2" }],
      snapshot: { ...emptySnapshot, terminalTabs: [{ connectionId: "a", id: "t1" }] },
    });
    expect(next).toBe(state);
  });
});
