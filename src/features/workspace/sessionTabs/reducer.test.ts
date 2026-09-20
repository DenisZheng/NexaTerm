import { describe, expect, it } from "vitest";

import { initialSessionPointerState, sessionPointerReducer, type SessionPointerState } from "./reducer";

const home: SessionPointerState = { ...initialSessionPointerState, homeActive: true };

describe("基本", () => {
  it("未知 action 与无变化返回原引用", () => {
    expect(sessionPointerReducer(home, { type: "x" } as never)).toBe(home);
    expect(sessionPointerReducer(home, { type: "tabs/setHomeActive", value: true })).toBe(home);
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
});
