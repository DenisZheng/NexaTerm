import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocalePreference, type Locale } from "../../shared/i18n";
import { buildTerminalSplitSyncPaneOptions } from "./terminalSplitSyncOptions";

let previousLocale: Locale;
beforeEach(() => { previousLocale = getLocale(); setLocalePreference("zh-CN"); });
afterEach(() => { setLocalePreference(previousLocale); });

describe("分屏同步菜单目标投影", () => {
  it("保留 pane 顺序、空 pane 序号和离线状态，焦点只标记主输入", () => {
    const a = { kind: "ssh" as const, tabId: "a" };
    const b = { kind: "local" as const, tabId: "b" };
    const input = {
      focusedBinding: b,
      panes: [{ binding: a }, {}, { binding: b }],
      sessionOptions: [{ binding: a, value: "ssh:a", label: "Fixture · 1" }],
      sessionIdForBinding: (binding: typeof a | typeof b) => binding.tabId === "a" ? "runtime-a" : null,
      syncEnabled: true,
    };
    expect(buildTerminalSplitSyncPaneOptions(input)).toStrictEqual([
      { key: "ssh:a", label: "Fixture · 1", disabled: false, locked: false },
      { key: "local:b", label: "终端 3 · 主输入", disabled: true, locked: false },
    ]);
    expect(buildTerminalSplitSyncPaneOptions({ ...input, syncEnabled: false })[1].label).toBe("终端 3");
    expect(buildTerminalSplitSyncPaneOptions({ ...input, focusedBinding: null })[1].label).toBe("终端 3");
  });
});
