// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  collectTerminalSplitPanes,
  createTerminalSplitLayout,
  splitTerminalPane,
  terminalPaneBindingKey,
  type TerminalPaneBinding,
  type TerminalSplitNode,
} from "../../terminal/terminalSplitLayout";
import {
  useTerminalSplitController,
  type TerminalSplitControllerInputs,
} from "./useTerminalSplitController";

// Characterization：锁住从 WorkspaceShell 原样迁出的分屏行为。
// 这些用例先在“机械搬家”的实现上跑绿，1b 换成 useReducer 后必须原样仍绿。
// 假数据：tab id / session id 全是占位串，不含任何真实连接信息。

const ssh = (tabId: string): TerminalPaneBinding => ({ kind: "ssh", tabId });
const local = (tabId: string): TerminalPaneBinding => ({ kind: "local", tabId });
const connected = (id: string) => ({ id, sessionId: `session-${id}`, status: "已连接" });
const connecting = (id: string) => ({ id, status: "连接中" });

function setup(overrides: Partial<TerminalSplitControllerInputs> = {}) {
  const onCollapseToStandalone = vi.fn();
  const initial: TerminalSplitControllerInputs = {
    activeTerminalSplitBinding: null,
    localTerminalTabs: [],
    onCollapseToStandalone,
    terminalTabs: [connected("a"), connected("b"), connected("c")],
    ...overrides,
  };
  const hook = renderHook((props: TerminalSplitControllerInputs) => useTerminalSplitController(props), {
    initialProps: initial,
  });
  return { ...hook, initial, onCollapseToStandalone };
}

/** 用 hook 自己的 setter 建两 pane 横排布局，模拟 WorkspaceShell 的 open 流程。 */
function openTwoPanes(result: ReturnType<typeof setup>["result"], first = ssh("a"), second = ssh("b")) {
  act(() => {
    const c = result.current;
    const p1 = c.nextTerminalSplitId("terminal-pane");
    const p2 = c.nextTerminalSplitId("terminal-pane");
    const s1 = c.nextTerminalSplitId("terminal-split");
    c.setTerminalSplitLayout(splitTerminalPane(createTerminalSplitLayout(p1, first), p1, "row", s1, p2, second));
    c.setTerminalSplitHost({ kind: "ssh", connectionId: "conn-1" });
    c.setTerminalSplitTabActive(true);
    c.setFocusedTerminalPaneId(p1);
  });
}

describe("初始状态", () => {
  it("没有布局、没有宿主、不激活、不同步", () => {
    const { result } = setup();
    const c = result.current;
    expect(c.terminalSplitLayout).toBeNull();
    expect(c.terminalSplitHost).toBeNull();
    expect(c.terminalSplitPanes).toEqual([]);
    expect(c.terminalSplitExists).toBe(false);
    expect(c.terminalSplitActive).toBe(false);
    expect(c.terminalSplitCanAddPane).toBe(true);
    expect(c.terminalSplitSyncEnabled).toBe(false);
    expect(c.terminalSplitSyncParticipantKeys.size).toBe(0);
    expect(c.terminalSplitLayoutRevision).toBe(0);
    expect(c.terminalSplitAutoCreateSameSession).toBe(true);
  });

  it("id 生成器单调递增且带前缀", () => {
    const { result } = setup();
    expect(result.current.nextTerminalSplitId("terminal-pane")).toBe("terminal-pane-1");
    expect(result.current.nextTerminalSplitId("terminal-split")).toBe("terminal-split-2");
  });
});

describe("打开两 pane", () => {
  it("派生 panes / exists / active / focused binding 一致", () => {
    const { result } = setup();
    openTwoPanes(result);
    const c = result.current;
    expect(c.terminalSplitPanes).toHaveLength(2);
    expect(c.terminalSplitExists).toBe(true);
    expect(c.terminalSplitActive).toBe(true);
    expect(c.focusedTerminalSplitBinding).toEqual(ssh("a"));
    expect(c.terminalSplitMemberKeys).toEqual(new Set(["ssh:a", "ssh:b"]));
    expect(c.terminalSplitPaneByBinding.get("ssh:b")?.id).toBe("terminal-pane-2");
    expect(c.terminalSplitCanAddPane).toBe(true);
  });

  it("tabActive=false 时 exists 仍为 true 但 active 为 false", () => {
    const { result } = setup();
    openTwoPanes(result);
    act(() => result.current.setTerminalSplitTabActive(false));
    expect(result.current.terminalSplitExists).toBe(true);
    expect(result.current.terminalSplitActive).toBe(false);
  });
});

describe("binding 失效清理（原 1221 行 effect）", () => {
  it("一个 tab 消失后布局收缩为单 pane，并立刻折叠为独立 tab", () => {
    const { result, rerender, initial, onCollapseToStandalone } = setup();
    openTwoPanes(result);
    rerender({ ...initial, terminalTabs: [connected("a"), connected("c")] });
    // 第一轮 effect 移除 b → 单 pane；第二轮 effect（原 1481 行）看到只剩 1 pane → 全清并回调。
    expect(result.current.terminalSplitLayout).toBeNull();
    expect(result.current.terminalSplitHost).toBeNull();
    expect(result.current.terminalSplitTabActive).toBe(false);
    expect(result.current.focusedTerminalPaneId).toBeNull();
    expect(onCollapseToStandalone).toHaveBeenCalledTimes(1);
    expect(onCollapseToStandalone).toHaveBeenCalledWith(ssh("a"));
  });

  it("三 pane 中一个消失：布局保留两 pane，焦点若丢失则落到第一个 pane", () => {
    const { result, rerender, initial } = setup();
    openTwoPanes(result);
    act(() => {
      const c = result.current;
      const layout = c.terminalSplitLayout;
      if (!layout) throw new Error("expected layout");
      const p3 = c.nextTerminalSplitId("terminal-pane");
      const s2 = c.nextTerminalSplitId("terminal-split");
      c.setTerminalSplitLayout(splitTerminalPane(layout, "terminal-pane-2", "column", s2, p3, ssh("c")));
      c.setFocusedTerminalPaneId("terminal-pane-2");
    });
    expect(result.current.terminalSplitPanes).toHaveLength(3);
    rerender({ ...initial, terminalTabs: [connected("a"), connected("c")] });
    const c = result.current;
    expect(c.terminalSplitPanes.map((pane) => pane.binding)).toEqual([ssh("a"), ssh("c")]);
    expect(c.focusedTerminalPaneId).toBe(c.terminalSplitPanes[0]?.id);
    expect(c.terminalSplitHost).toEqual({ kind: "ssh", connectionId: "conn-1" });
  });

  it("所有 binding 都消失时全部清空，不回调折叠", () => {
    const { result, rerender, initial, onCollapseToStandalone } = setup();
    openTwoPanes(result);
    rerender({ ...initial, terminalTabs: [connected("c")] });
    expect(result.current.terminalSplitLayout).toBeNull();
    expect(result.current.terminalSplitSyncEnabled).toBe(false);
    expect(onCollapseToStandalone).not.toHaveBeenCalled();
  });

  it("本地终端 binding 同样受 localTerminalTabs 约束", () => {
    const { result, rerender, initial, onCollapseToStandalone } = setup({
      localTerminalTabs: [connected("l1"), connected("l2")],
    });
    openTwoPanes(result, local("l1"), local("l2"));
    rerender({ ...initial, localTerminalTabs: [connected("l1")] });
    expect(result.current.terminalSplitLayout).toBeNull();
    expect(onCollapseToStandalone).toHaveBeenCalledWith(local("l1"));
  });
});

describe("超过 pane 上限时重建四宫格（原 1459 行 effect）", () => {
  it("五个 pane 被压回四宫格，焦点 binding 排第一", () => {
    const { result } = setup({
      terminalTabs: [connected("a"), connected("b"), connected("c"), connected("d"), connected("e")],
    });
    act(() => {
      const c = result.current;
      let layout: TerminalSplitNode = createTerminalSplitLayout("p1", ssh("a"));
      layout = splitTerminalPane(layout, "p1", "row", "s1", "p2", ssh("b"));
      layout = splitTerminalPane(layout, "p2", "column", "s2", "p3", ssh("c"));
      layout = splitTerminalPane(layout, "p3", "row", "s3", "p4", ssh("d"));
      layout = splitTerminalPane(layout, "p4", "column", "s4", "p5", ssh("e"));
      c.setTerminalSplitLayout(layout);
      c.setTerminalSplitHost({ kind: "ssh", connectionId: "conn-1" });
      c.setTerminalSplitTabActive(true);
      c.setFocusedTerminalPaneId("p3");
    });
    const c = result.current;
    expect(c.terminalSplitPanes).toHaveLength(4);
    expect(c.terminalSplitPanes[0]?.binding).toEqual(ssh("c"));
    expect(c.terminalSplitMemberKeys).toEqual(new Set(["ssh:c", "ssh:a", "ssh:b", "ssh:d"]));
    expect(c.terminalSplitCanAddPane).toBe(false);
  });
});

describe("同步输入参与者（原 1500 行 effect）", () => {
  it("开启同步后，焦点 pane 自动成为参与者", () => {
    const { result } = setup();
    openTwoPanes(result);
    act(() => {
      result.current.setTerminalSplitSyncEnabled(true);
      result.current.setTerminalSplitSyncParticipantKeys(new Set(["ssh:a", "ssh:b"]));
    });
    expect(result.current.terminalSplitSyncEnabled).toBe(true);
    expect(result.current.terminalSplitSyncParticipantKeys).toEqual(new Set(["ssh:a", "ssh:b"]));
  });

  it("未连接的会话不能是参与者：参与者集合按已连接会话收缩", () => {
    const { result, rerender, initial } = setup();
    openTwoPanes(result);
    act(() => {
      result.current.setTerminalSplitSyncEnabled(true);
      result.current.setTerminalSplitSyncParticipantKeys(new Set(["ssh:a", "ssh:b"]));
    });
    rerender({ ...initial, terminalTabs: [connected("a"), connecting("b"), connected("c")] });
    // b 仍在布局里（tab 存在），但不再是同步参与者；可用参与者 < 2 → 同步自动关闭。
    expect(result.current.terminalSplitPanes).toHaveLength(2);
    expect(result.current.terminalSplitSyncParticipantKeys).toEqual(new Set(["ssh:a"]));
    expect(result.current.terminalSplitSyncEnabled).toBe(false);
  });

  it("分屏 tab 不活动时同步被关闭", () => {
    const { result } = setup();
    openTwoPanes(result);
    act(() => {
      result.current.setTerminalSplitSyncEnabled(true);
      result.current.setTerminalSplitSyncParticipantKeys(new Set(["ssh:a", "ssh:b"]));
    });
    act(() => result.current.setTerminalSplitTabActive(false));
    expect(result.current.terminalSplitSyncEnabled).toBe(false);
  });

  it("参与者集合无变化时保持同一引用（避免多余渲染）", () => {
    const { result, rerender, initial } = setup();
    openTwoPanes(result);
    act(() => {
      result.current.setTerminalSplitSyncEnabled(true);
      result.current.setTerminalSplitSyncParticipantKeys(new Set(["ssh:a", "ssh:b"]));
    });
    const before = result.current.terminalSplitSyncParticipantKeys;
    rerender({ ...initial, terminalTabs: [connected("a"), connected("b"), connected("c")] });
    expect(result.current.terminalSplitSyncParticipantKeys).toBe(before);
  });
});

describe("createTerminalFourPane / fallbackTerminalSplitBinding", () => {
  it("四宫格：不足四个 binding 时焦点落在空 pane", () => {
    const { result } = setup();
    const four = result.current.createTerminalFourPane([ssh("a"), ssh("b")]);
    expect(four.emptyPaneId).not.toBeNull();
    expect(four.focusedPaneId).toBe(four.emptyPaneId);
  });

  it("四宫格：四个 binding 时焦点落在第一个 binding 所在 pane", () => {
    const { result } = setup();
    const four = result.current.createTerminalFourPane([ssh("a"), ssh("b"), ssh("c"), ssh("d")]);
    expect(four.emptyPaneId).toBeNull();
    const focused = collectTerminalSplitPanes(four.layout).find((pane) => pane.id === four.focusedPaneId);
    expect(focused?.binding).toEqual(ssh("a"));
  });

  it("兜底 binding 优先活动终端，其次第一个 SSH tab，再其次第一个本地 tab", () => {
    expect(setup({ activeTerminalSplitBinding: local("x") }).result.current.fallbackTerminalSplitBinding()).toEqual(local("x"));
    expect(setup().result.current.fallbackTerminalSplitBinding()).toEqual(ssh("a"));
    expect(setup({ terminalTabs: [], localTerminalTabs: [connected("l1")] }).result.current.fallbackTerminalSplitBinding()).toEqual(local("l1"));
    expect(setup({ terminalTabs: [] }).result.current.fallbackTerminalSplitBinding()).toBeNull();
  });

  it("terminalSessionIdForBinding 只对已连接/预览状态返回 sessionId", () => {
    const { result } = setup({
      terminalTabs: [connected("a"), connecting("b"), { id: "p", sessionId: "session-p", status: "预览" }],
    });
    expect(result.current.terminalSessionIdForBinding(ssh("a"))).toBe("session-a");
    expect(result.current.terminalSessionIdForBinding(ssh("b"))).toBeNull();
    expect(result.current.terminalSessionIdForBinding(ssh("p"))).toBe("session-p");
    expect(result.current.terminalSessionIdForBinding(ssh("missing"))).toBeNull();
  });
});

describe("其余 setter 透传", () => {
  it("picker 请求、关闭确认、自动同会话开关、revision 各自独立", () => {
    const { result } = setup();
    act(() => {
      result.current.setTerminalSplitPickerOpenRequest({ key: 1, paneId: "p1" });
      result.current.setTerminalSplitCloseConfirmOpen(true);
      result.current.setTerminalSplitAutoCreateSameSession(false);
      result.current.setTerminalSplitLayoutRevision((value) => value + 1);
      result.current.setTerminalSplitAnchorIndex(3);
      result.current.setTerminalSplitSyncError("boom");
    });
    const c = result.current;
    expect(c.terminalSplitPickerOpenRequest).toEqual({ key: 1, paneId: "p1" });
    expect(c.terminalSplitCloseConfirmOpen).toBe(true);
    expect(c.terminalSplitAutoCreateSameSession).toBe(false);
    expect(c.terminalSplitLayoutRevision).toBe(1);
    expect(c.terminalSplitAnchorIndex).toBe(3);
    expect(c.terminalSplitSyncError).toBe("boom");
    expect(c.terminalSplitPickerPendingPaneRef.current).toBeNull();
    expect(c.terminalSplitPickerRequestRef.current).toBe(0);
  });

  it("key 相同的 binding 只按 kind:tabId 判等", () => {
    expect(terminalPaneBindingKey(ssh("a"))).toBe("ssh:a");
    expect(terminalPaneBindingKey(local("a"))).toBe("local:a");
  });
});
