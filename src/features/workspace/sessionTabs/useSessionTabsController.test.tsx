// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RemoteFileEditorTab } from "../../editor/remoteFileEditorTypes";

import { useSessionTabsController } from "./useSessionTabsController";

// Characterization：锁住从 WorkspaceShell 原样迁出的两个按连接归一 effect。
// 用例先在“机械搬家”的实现上跑绿，2c 换成 reducer 后必须原样仍绿。
// 假数据：id / 连接名均为占位串，不含真实主机或凭据。

interface Tab {
  connectionId: string;
  id: string;
}

const tab = (id: string, connectionId: string): Tab => ({ connectionId, id });
const fileTab = (id: string, connectionId: string): RemoteFileEditorTab => ({
  connectionId,
  connectionName: `conn-${connectionId}`,
  content: "",
  dirty: false,
  error: null,
  id,
  metadata: null,
  name: `${id}.txt`,
  path: `/tmp/${id}.txt`,
  saveState: "idle" as RemoteFileEditorTab["saveState"],
  savedContent: "",
  statusMessage: null,
});

function setup(defaultRemoteFileOpenMode: "split" | "unified" = "split") {
  return renderHook(() => useSessionTabsController<Tab>({ defaultRemoteFileOpenMode }));
}

describe("初始状态", () => {
  it("集合为空、指针为 null、模式为 home、首页记忆位为 true", () => {
    const { result } = setup();
    const c = result.current;
    expect(c.terminalTabs).toEqual([]);
    expect(c.rdpSessions).toEqual([]);
    expect(c.vncSessions).toEqual([]);
    expect(c.localTerminalTabs).toEqual([]);
    expect(c.remoteFileTabs).toEqual([]);
    expect(c.activeTabId).toBeNull();
    expect(c.activeConnectionId).toBeNull();
    expect(c.activeWorkspaceMode).toBe("home");
    expect(c.homeActive).toBe(true);
    expect(c.activeView).toBe("workspace");
    expect(c.activeTabByConnectionId).toEqual({});
    expect(c.terminalFileLayoutByConnectionId).toEqual({});
    expect(c.activeUnifiedTabByConnectionId).toEqual({});
  });
});

describe("文件布局记忆归一（原 1558 行 effect）", () => {
  it("打开文件 tab 的连接自动获得默认布局", () => {
    const { result } = setup("unified");
    act(() => result.current.setRemoteFileTabs([fileTab("f1", "a")]));
    expect(result.current.terminalFileLayoutByConnectionId).toEqual({ a: "unified" });
  });

  it("已有记忆的连接不会被默认值覆盖", () => {
    const { result } = setup("split");
    act(() => {
      result.current.setTerminalFileLayoutByConnectionId({ a: "unified" });
      result.current.setRemoteFileTabs([fileTab("f1", "a")]);
    });
    expect(result.current.terminalFileLayoutByConnectionId).toEqual({ a: "unified" });
  });

  it("连接既无终端也无文件 tab 时记忆被清除；仅有终端 tab 时保留", () => {
    const { result } = setup();
    act(() => {
      result.current.setTerminalFileLayoutByConnectionId({ a: "unified", b: "split" });
      result.current.setTerminalTabs([tab("t1", "a")]);
    });
    expect(result.current.terminalFileLayoutByConnectionId).toEqual({ a: "unified" });
  });

  it("无变化时保持同一引用", () => {
    const { result } = setup();
    act(() => {
      result.current.setTerminalTabs([tab("t1", "a")]);
      result.current.setTerminalFileLayoutByConnectionId({ a: "split" });
    });
    const before = result.current.terminalFileLayoutByConnectionId;
    act(() => result.current.setTerminalTabs([tab("t1", "a"), tab("t2", "a")]));
    expect(result.current.terminalFileLayoutByConnectionId).toBe(before);
  });
});

describe("统一 tab 记忆回退（原 1587 行 effect）", () => {
  it("记忆的 terminal tab 仍存在时保持不变", () => {
    const { result } = setup();
    act(() => {
      result.current.setTerminalTabs([tab("t1", "a")]);
      result.current.dispatchTabs({ type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "terminal", id: "t1" } });
    });
    expect(result.current.activeUnifiedTabByConnectionId).toEqual({ a: { kind: "terminal", id: "t1" } });
  });

  it("记忆的 tab 消失时优先回退到同连接的 file tab", () => {
    const { result } = setup();
    act(() => {
      result.current.setTerminalTabs([tab("t1", "a"), tab("t2", "a")]);
      result.current.setRemoteFileTabs([fileTab("f1", "a")]);
      result.current.dispatchTabs({ type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "terminal", id: "t1" } });
    });
    act(() => result.current.setTerminalTabs([tab("t2", "a")]));
    expect(result.current.activeUnifiedTabByConnectionId).toEqual({ a: { kind: "file", id: "f1" } });
  });

  it("没有 file tab 时回退到同连接第一个 terminal tab", () => {
    const { result } = setup();
    act(() => {
      result.current.setTerminalTabs([tab("t1", "a"), tab("t2", "a")]);
      result.current.dispatchTabs({ type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "terminal", id: "t1" } });
    });
    act(() => result.current.setTerminalTabs([tab("t2", "a")]));
    expect(result.current.activeUnifiedTabByConnectionId).toEqual({ a: { kind: "terminal", id: "t2" } });
  });

  it("kind 与实际 tab 类型不符视为失效（file 记忆指向 terminal id）", () => {
    const { result } = setup();
    act(() => {
      result.current.setTerminalTabs([tab("t1", "a")]);
      result.current.dispatchTabs({ type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "file", id: "t1" } });
    });
    expect(result.current.activeUnifiedTabByConnectionId).toEqual({ a: { kind: "terminal", id: "t1" } });
  });

  it("连接完全消失时记忆条目被删除", () => {
    const { result } = setup();
    act(() => {
      result.current.setTerminalTabs([tab("t1", "a")]);
      result.current.dispatchTabs({ type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "terminal", id: "t1" } });
    });
    act(() => result.current.setTerminalTabs([]));
    expect(result.current.activeUnifiedTabByConnectionId).toEqual({});
  });

  it("无变化时保持同一引用", () => {
    const { result } = setup();
    act(() => {
      result.current.setTerminalTabs([tab("t1", "a")]);
      result.current.dispatchTabs({ type: "tabs/rememberUnified", connectionId: "a", tab: { kind: "terminal", id: "t1" } });
    });
    const before = result.current.activeUnifiedTabByConnectionId;
    act(() => result.current.setRemoteFileTabs([fileTab("f1", "a")]));
    expect(result.current.activeUnifiedTabByConnectionId).toBe(before);
  });
});

describe("意图型 action 经 controller 透传", () => {
  it("指针与模式各自独立更新（原 setter 透传用例，WF-00B 改为 dispatch）", () => {
    const { result } = setup();
    act(() => {
      result.current.dispatchTabs({ type: "tabs/activateTerminal", connectionId: "a", tabId: "t1", rememberUnified: false });
      result.current.dispatchTabs({ type: "tabs/openSettings" });
      result.current.dispatchTabs({ type: "tabs/focusPaneBinding", binding: { kind: "local", tabId: "l1" } });
      result.current.setActiveRemoteFileTabId("f1");
    });
    const c = result.current;
    expect([c.activeConnectionId, c.activeTabId, c.activeWorkspaceMode, c.homeActive, c.activeView]).toEqual([
      "a",
      "t1",
      "ssh",
      false,
      "settings",
    ]);
    expect(c.activeTabByConnectionId).toEqual({ a: "t1" });
    expect([c.activeLocalTerminalTabId, c.activeRemoteFileTabId]).toEqual(["l1", "f1"]);
    act(() => {
      result.current.dispatchTabs({ type: "tabs/activateRdp", connectionId: "b", sessionId: "r1" });
    });
    expect([result.current.activeRdpSessionId, result.current.activeConnectionId, result.current.activeWorkspaceMode]).toEqual([
      "r1",
      "b",
      "rdp",
    ]);
    act(() => {
      result.current.dispatchTabs({ type: "tabs/activateVnc", connectionId: "c", sessionId: "v1" });
    });
    expect([result.current.activeVncSessionId, result.current.activeConnectionId, result.current.activeWorkspaceMode]).toEqual([
      "v1",
      "c",
      "vnc",
    ]);
  });
});

describe("WF-00B：followUp 消费", () => {
  it("关闭决策产生 followUp 时 onFollowUp 恰好调用一次，随后标记被清除", () => {
    const calls: unknown[] = [];
    const { result } = renderHook(() =>
      useSessionTabsController<Tab>({ defaultRemoteFileOpenMode: "split", onFollowUp: (f) => calls.push(f) }),
    );
    act(() => {
      result.current.dispatchTabs({ type: "tabs/activateTerminal", connectionId: "a", tabId: "t1", rememberUnified: false });
    });
    act(() => {
      result.current.dispatchTabs({
        type: "tabs/closeTerminals",
        closingTabs: [{ connectionId: "a", id: "t1" }],
        snapshot: { localTerminalTabs: [{ id: "l1" }], rdpSessions: [], remoteFileTabs: [], terminalTabs: [], vncSessions: [] },
      });
    });
    expect(calls).toEqual([{ kind: "local", tabId: "l1" }]);
    expect(result.current.activeTabId).toBeNull();
    // 再来一次无 followUp 的关闭：回调不再触发
    act(() => {
      result.current.dispatchTabs({
        type: "tabs/closeTerminals",
        closingTabs: [{ connectionId: "z", id: "zz" }],
        snapshot: { localTerminalTabs: [{ id: "l1" }], rdpSessions: [], remoteFileTabs: [], terminalTabs: [], vncSessions: [] },
      });
    });
    expect(calls).toHaveLength(1);
  });

  it("未提供 onFollowUp 时标记仍被清除，不报错", () => {
    const { result } = setup();
    act(() => {
      result.current.dispatchTabs({ type: "tabs/activateLocal", tabId: "l1" });
      result.current.dispatchTabs({
        type: "tabs/closeLocalTerminals",
        closingIds: ["l1"],
        snapshot: { localTerminalTabs: [], rdpSessions: [{ connectionId: "b", id: "r1" }], remoteFileTabs: [], terminalTabs: [], vncSessions: [] },
      });
    });
    expect(result.current.activeLocalTerminalTabId).toBeNull();
  });
});
