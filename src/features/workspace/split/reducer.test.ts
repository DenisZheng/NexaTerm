import { describe, expect, it } from "vitest";

import {
  createTerminalSplitLayout,
  splitTerminalPane,
  type TerminalPaneBinding,
  type TerminalSplitNode,
} from "../../terminal/terminalSplitLayout";

import type { FourPaneIds } from "./actions";
import { initialSplitState, splitReducer, type SplitState } from "./reducer";

const ssh = (tabId: string): TerminalPaneBinding => ({ kind: "ssh", tabId });
let counter = 0;
const allocateIds = (): FourPaneIds => {
  counter += 1;
  const n = counter;
  return {
    bottomLeft: `bl-${n}`,
    bottomRight: `br-${n}`,
    leftSplit: `ls-${n}`,
    rightSplit: `rs-${n}`,
    root: `root-${n}`,
    topLeft: `tl-${n}`,
    topRight: `tr-${n}`,
  };
};

function twoPane(): SplitState {
  const layout = splitTerminalPane(createTerminalSplitLayout("p1", ssh("a")), "p1", "row", "s1", "p2", ssh("b"));
  return { ...initialSplitState, focusedPaneId: "p1", host: { kind: "ssh", connectionId: "c" }, layout, tabActive: true };
}

describe("splitReducer 基本 action", () => {
  it("未知 action 返回原引用", () => {
    const state = twoPane();
    expect(splitReducer(state, { type: "nope" } as never)).toBe(state);
  });

  it("值未变化时返回原引用", () => {
    const state = twoPane();
    expect(splitReducer(state, { type: "split/setTabActive", active: true })).toBe(state);
    expect(splitReducer(state, { type: "split/focusPane", paneId: "p1" })).toBe(state);
    expect(splitReducer(state, { type: "split/setLayout", layout: state.layout })).toBe(state);
  });

  it("setLayout 接受函数形式", () => {
    const state = twoPane();
    const next = splitReducer(state, { type: "split/setLayout", layout: () => null });
    expect(next.layout).toBeNull();
    expect(next.host).toEqual(state.host);
  });

  it("bumpRevision 每次自增", () => {
    const a = splitReducer(initialSplitState, { type: "split/bumpRevision" });
    expect(splitReducer(a, { type: "split/bumpRevision" }).revision).toBe(2);
  });
});

describe("split/availableBindingsChanged", () => {
  it("无布局时不做事", () => {
    expect(
      splitReducer(initialSplitState, {
        type: "split/availableBindingsChanged",
        availableKeys: new Set(),
        fallbackBinding: null,
        allocateIds,
      }),
    ).toBe(initialSplitState);
  });

  it("全部可用且焦点有效时返回原引用", () => {
    const state = twoPane();
    expect(
      splitReducer(state, {
        type: "split/availableBindingsChanged",
        availableKeys: new Set(["ssh:a", "ssh:b"]),
        fallbackBinding: null,
        allocateIds,
      }),
    ).toBe(state);
  });

  it("一个 binding 失效 → 单 pane → 整体清空并标记 collapsedTo", () => {
    const next = splitReducer(twoPane(), {
      type: "split/availableBindingsChanged",
      availableKeys: new Set(["ssh:a"]),
      fallbackBinding: null,
      allocateIds,
    });
    expect(next.layout).toBeNull();
    expect(next.host).toBeNull();
    expect(next.tabActive).toBe(false);
    expect(next.focusedPaneId).toBeNull();
    expect(next.collapsedTo).toEqual(ssh("a"));
  });

  it("全部失效 → 清空但不标记 collapsedTo", () => {
    const next = splitReducer(twoPane(), {
      type: "split/availableBindingsChanged",
      availableKeys: new Set(),
      fallbackBinding: null,
      allocateIds,
    });
    expect(next.layout).toBeNull();
    expect(next.collapsedTo).toBeNull();
  });

  it("三 pane 少一个：保留两 pane，焦点丢失则落到第一个", () => {
    const base = twoPane();
    const layout = splitTerminalPane(base.layout!, "p2", "column", "s2", "p3", ssh("c"));
    const next = splitReducer(
      { ...base, layout, focusedPaneId: "p2" },
      {
        type: "split/availableBindingsChanged",
        availableKeys: new Set(["ssh:a", "ssh:c"]),
        fallbackBinding: null,
        allocateIds,
      },
    );
    expect(next.layout).not.toBeNull();
    expect(next.focusedPaneId).toBe("p1");
    expect(next.host).toEqual(base.host);
  });

  it("超过上限时以焦点 binding 为首重建四宫格", () => {
    let layout: TerminalSplitNode = createTerminalSplitLayout("p1", ssh("a"));
    layout = splitTerminalPane(layout, "p1", "row", "s1", "p2", ssh("b"));
    layout = splitTerminalPane(layout, "p2", "column", "s2", "p3", ssh("c"));
    layout = splitTerminalPane(layout, "p3", "row", "s3", "p4", ssh("d"));
    layout = splitTerminalPane(layout, "p4", "column", "s4", "p5", ssh("e"));
    const next = splitReducer(
      { ...initialSplitState, layout, focusedPaneId: "p3", tabActive: true },
      {
        type: "split/availableBindingsChanged",
        availableKeys: new Set(["ssh:a", "ssh:b", "ssh:c", "ssh:d", "ssh:e"]),
        fallbackBinding: null,
        allocateIds,
      },
    );
    expect(next.layout?.kind).toBe("split");
    expect(next.focusedPaneId).toMatch(/^tl-/);
  });

  it("collapseHandled 清除标记", () => {
    const state = { ...initialSplitState, collapsedTo: ssh("a") };
    expect(splitReducer(state, { type: "split/collapseHandled" }).collapsedTo).toBeNull();
    expect(splitReducer(initialSplitState, { type: "split/collapseHandled" })).toBe(initialSplitState);
  });
});
