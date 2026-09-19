import { describe, expect, it } from "vitest";

import {
  clampTerminalSplitRatio,
  closeTerminalSplitPane,
  collectTerminalSplitPanes,
  collectTerminalSplitResizers,
  createTerminalFourPaneLayout,
  createTerminalSplitLayout,
  equalizeTerminalSplitLayout,
  findTerminalSplitPaneByBinding,
  moveTerminalSplitBinding,
  removeTerminalSplitBindings,
  replaceTerminalSplitPane,
  splitTerminalPane,
  terminalPaneBindingKey,
  terminalPaneBindingsEqual,
  terminalSplitMaxPanes,
  terminalSplitMaxRatio,
  terminalSplitMinRatio,
  updateTerminalSplitRatio,
  type TerminalPaneBinding,
} from "./terminalSplitLayout";

const ssh = (tabId: string): TerminalPaneBinding => ({ kind: "ssh", tabId });
const local = (tabId: string): TerminalPaneBinding => ({ kind: "local", tabId });

function twoPaneRow() {
  return splitTerminalPane(createTerminalSplitLayout("p1", ssh("tab-1")), "p1", "row", "s1", "p2", ssh("tab-2"));
}

describe("clampTerminalSplitRatio", () => {
  it("把比例夹在 [0.2, 0.8]", () => {
    expect(clampTerminalSplitRatio(0)).toBe(terminalSplitMinRatio);
    expect(clampTerminalSplitRatio(1)).toBe(terminalSplitMaxRatio);
    expect(clampTerminalSplitRatio(Number.POSITIVE_INFINITY)).toBe(terminalSplitMaxRatio);
    expect(clampTerminalSplitRatio(0.5)).toBe(0.5);
  });

  // 现状记录：NaN 不会被夹紧而是原样返回。拖拽计算若出现 0/0 会把 NaN 写进布局。
  // 是否在 seam 层做输入校验由 Task 04 决定，这里不改生产代码。
  it.todo("NaN 比例的处理策略（待 Task 04 决定）");
});

describe("binding 标识", () => {
  it("同 tab 不同 kind 视为不同 binding", () => {
    expect(terminalPaneBindingKey(ssh("1"))).toBe("ssh:1");
    expect(terminalPaneBindingsEqual(ssh("1"), local("1"))).toBe(false);
    expect(terminalPaneBindingsEqual(ssh("1"), ssh("1"))).toBe(true);
  });

  it("任一侧缺失时不相等（两个未绑定 pane 不能被当成同一个）", () => {
    expect(terminalPaneBindingsEqual(undefined, undefined)).toBe(false);
    expect(terminalPaneBindingsEqual(ssh("1"), undefined)).toBe(false);
  });
});

describe("createTerminalSplitLayout / collect", () => {
  it("单 pane 布局占满整个区域且没有 resizer", () => {
    const layout = createTerminalSplitLayout("p1", ssh("tab-1"));

    expect(collectTerminalSplitPanes(layout)).toEqual([
      { binding: ssh("tab-1"), bounds: { height: 1, left: 0, top: 0, width: 1 }, id: "p1" },
    ]);
    expect(collectTerminalSplitResizers(layout)).toEqual([]);
  });
});

describe("splitTerminalPane", () => {
  it("横向切分产生左右各半的两个 pane 与一个 ratio 0.5 的 resizer", () => {
    const layout = twoPaneRow();

    expect(collectTerminalSplitPanes(layout).map((pane) => [pane.id, pane.bounds])).toEqual([
      ["p1", { height: 1, left: 0, top: 0, width: 0.5 }],
      ["p2", { height: 1, left: 0.5, top: 0, width: 0.5 }],
    ]);
    expect(collectTerminalSplitResizers(layout)).toEqual([
      { bounds: { height: 1, left: 0, top: 0, width: 1 }, direction: "row", id: "s1", ratio: 0.5 },
    ]);
  });

  it("新 pane 未指定 binding 时保持空绑定", () => {
    const layout = splitTerminalPane(createTerminalSplitLayout("p1", ssh("tab-1")), "p1", "column", "s1", "p2");
    expect(findTerminalSplitPaneByBinding(layout, ssh("tab-1"))?.id).toBe("p1");
    expect(collectTerminalSplitPanes(layout).find((pane) => pane.id === "p2")?.binding).toBeUndefined();
  });

  it("目标 pane 不存在时返回原布局引用，不做无谓复制", () => {
    const layout = createTerminalSplitLayout("p1", ssh("tab-1"));
    expect(splitTerminalPane(layout, "missing", "row", "s1", "p2")).toBe(layout);
  });

  it("不改变输入布局（不可变更新）", () => {
    const layout = createTerminalSplitLayout("p1", ssh("tab-1"));
    const snapshot = structuredClone(layout);
    splitTerminalPane(layout, "p1", "row", "s1", "p2");
    expect(layout).toEqual(snapshot);
  });
});

describe("createTerminalFourPaneLayout", () => {
  it("四宫格 pane 数等于上限，按上到下、左到右排序，每格四分之一", () => {
    const layout = createTerminalFourPaneLayout([ssh("a"), ssh("b"), ssh("c"), ssh("d")], {
      bottomLeft: "bl",
      bottomRight: "br",
      leftSplit: "ls",
      rightSplit: "rs",
      root: "root",
      topLeft: "tl",
      topRight: "tr",
    });
    const panes = collectTerminalSplitPanes(layout);

    expect(panes).toHaveLength(terminalSplitMaxPanes);
    expect(panes.map((pane) => pane.id)).toEqual(["tl", "tr", "bl", "br"]);
    expect(panes.map((pane) => pane.binding?.tabId)).toEqual(["a", "b", "c", "d"]);
    for (const pane of panes) {
      expect(pane.bounds.width).toBeCloseTo(0.5);
      expect(pane.bounds.height).toBeCloseTo(0.5);
    }
  });
});

describe("updateTerminalSplitRatio / equalize", () => {
  it("只更新目标 split 的比例并夹紧，其它节点保持原引用", () => {
    const layout = twoPaneRow();
    const nested = splitTerminalPane(layout, "p2", "column", "s2", "p3");
    const updated = updateTerminalSplitRatio(nested, "s2", 0.95);

    expect(collectTerminalSplitResizers(updated).map((resizer) => [resizer.id, resizer.ratio])).toEqual([
      ["s1", 0.5],
      ["s2", terminalSplitMaxRatio],
    ]);
    if (updated.kind !== "split" || nested.kind !== "split") {
      throw new Error("expected split layouts");
    }
    expect(updated.first).toBe(nested.first);
  });

  it("equalize 把所有 split 比例重置为 0.5", () => {
    const layout = updateTerminalSplitRatio(twoPaneRow(), "s1", 0.3);
    const equalized = equalizeTerminalSplitLayout(layout);
    expect(collectTerminalSplitResizers(equalized).map((resizer) => resizer.ratio)).toEqual([0.5]);
  });

  it("对叶子节点调用 update 返回原引用", () => {
    const leaf = createTerminalSplitLayout("p1", ssh("tab-1"));
    expect(updateTerminalSplitRatio(leaf, "s1", 0.3)).toBe(leaf);
  });
});

describe("closeTerminalSplitPane", () => {
  it("关闭两 pane 之一时用剩余 pane 顶替整个 split", () => {
    const layout = twoPaneRow();
    const closed = closeTerminalSplitPane(layout, "p1");

    expect(closed).toEqual({ binding: ssh("tab-2"), id: "p2", kind: "leaf" });
  });

  it("关闭最后一个 pane 返回 null", () => {
    expect(closeTerminalSplitPane(createTerminalSplitLayout("p1", ssh("tab-1")), "p1")).toBeNull();
  });

  it("目标不存在时返回原布局引用", () => {
    const layout = twoPaneRow();
    expect(closeTerminalSplitPane(layout, "missing")).toBe(layout);
  });
});

describe("moveTerminalSplitBinding", () => {
  it("把 binding 移到目标 pane 后，原 pane 的同一 binding 被清空，不会重复挂载", () => {
    const layout = splitTerminalPane(createTerminalSplitLayout("p1", ssh("tab-1")), "p1", "row", "s1", "p2");
    const moved = moveTerminalSplitBinding(layout, "p2", ssh("tab-1"));
    const panes = collectTerminalSplitPanes(moved);

    expect(panes.find((pane) => pane.id === "p1")?.binding).toBeUndefined();
    expect(panes.find((pane) => pane.id === "p2")?.binding).toEqual(ssh("tab-1"));
  });
});

describe("removeTerminalSplitBindings / replace", () => {
  it("按 binding key 批量移除 pane，剩余布局收缩", () => {
    const layout = twoPaneRow();
    const remaining = removeTerminalSplitBindings(layout, new Set([terminalPaneBindingKey(ssh("tab-1"))]));
    expect(remaining).toEqual({ binding: ssh("tab-2"), id: "p2", kind: "leaf" });
  });

  it("移除全部 binding 时返回 null", () => {
    const layout = twoPaneRow();
    const keys = new Set([terminalPaneBindingKey(ssh("tab-1")), terminalPaneBindingKey(ssh("tab-2"))]);
    expect(removeTerminalSplitBindings(layout, keys)).toBeNull();
  });

  it("replace 用给定子树替换指定 pane", () => {
    const layout = twoPaneRow();
    const replaced = replaceTerminalSplitPane(layout, "p2", createTerminalSplitLayout("p9", local("wsl")));
    expect(findTerminalSplitPaneByBinding(replaced, local("wsl"))?.id).toBe("p9");
    expect(findTerminalSplitPaneByBinding(replaced, ssh("tab-2"))).toBeUndefined();
  });
});
