import { describe, expect, it } from "vitest";

import {
  defaultSettings,
  normalizeFontFamilyInput,
  normalizeHexColor,
  normalizeSettings,
} from "./settingsTypes";

describe("normalizeSettings", () => {
  // 每个用例包成单元素数组：it.each 会把裸数组元素展开为多个参数，`[]` 会变成"零个参数"而测不到。
  it.each([[undefined], [null], ["settings"], [42], [[]], [{}]])("非对象或空输入 %o 回落到默认设置", (input) => {
    expect(normalizeSettings(input)).toEqual(defaultSettings);
  });

  it("不改变输入对象，返回的是新对象", () => {
    const stored = { basic: { reopenLastTerminal: true } };
    const snapshot = structuredClone(stored);
    const normalized = normalizeSettings(stored);

    expect(stored).toEqual(snapshot);
    expect(normalized).not.toBe(stored);
    expect(normalized.basic).not.toBe(stored.basic);
  });

  it("合法覆盖值保留，同一分区里其它字段仍取默认", () => {
    const normalized = normalizeSettings({
      basic: { reopenLastTerminal: true, recentConnectionLimit: 20 },
      appearance: { themeMode: "dark", terminalFontSize: 16 },
      security: { autoLockMinutes: 60 },
    });

    expect(normalized.basic.reopenLastTerminal).toBe(true);
    expect(normalized.basic.recentConnectionLimit).toBe(20);
    expect(normalized.basic.restoreWorkspaceOnLaunch).toBe(defaultSettings.basic.restoreWorkspaceOnLaunch);
    expect(normalized.appearance.themeMode).toBe("dark");
    expect(normalized.appearance.terminalFontSize).toBe(16);
    expect(normalized.appearance.accentColor).toBe(defaultSettings.appearance.accentColor);
    expect(normalized.security.autoLockMinutes).toBe(60);
  });

  it("枚举与数值只接受白名单，其它值回落默认而不是原样透传", () => {
    const normalized = normalizeSettings({
      basic: { recentConnectionLimit: 7, remoteFileOpenMode: "tabs", reopenLastTerminal: "yes" },
      appearance: { themeMode: "midnight", terminalFontSize: 99, cursorStyle: "beam" },
      security: { autoLockMinutes: -1 },
      fileTransfer: { concurrentTransfers: 0, conflictPolicyDefault: "merge" },
    });

    expect(normalized.basic.recentConnectionLimit).toBe(defaultSettings.basic.recentConnectionLimit);
    expect(normalized.basic.remoteFileOpenMode).toBe(defaultSettings.basic.remoteFileOpenMode);
    expect(normalized.basic.reopenLastTerminal).toBe(defaultSettings.basic.reopenLastTerminal);
    expect(normalized.appearance.themeMode).toBe(defaultSettings.appearance.themeMode);
    expect(normalized.appearance.terminalFontSize).toBe(defaultSettings.appearance.terminalFontSize);
    expect(normalized.appearance.cursorStyle).toBe(defaultSettings.appearance.cursorStyle);
    expect(normalized.security.autoLockMinutes).toBe(defaultSettings.security.autoLockMinutes);
    expect(normalized.fileTransfer.concurrentTransfers).toBe(defaultSettings.fileTransfer.concurrentTransfers);
    expect(normalized.fileTransfer.conflictPolicyDefault).toBe(defaultSettings.fileTransfer.conflictPolicyDefault);
  });

  it("本地终端 profile 列表：非法条目被丢弃，合法条目补齐默认字段", () => {
    const normalized = normalizeSettings({
      localTerminal: {
        hiddenProfileIds: ["  a ", "", 3, "b"],
        customProfiles: [
          { name: "zsh", kind: "shell", command: "/bin/zsh" },
          { name: "", kind: "shell", command: "/bin/sh" },
          "not-a-profile",
        ],
      },
    });

    expect(normalized.localTerminal.hiddenProfileIds).toEqual(["a", "b"]);
    expect(normalized.localTerminal.customProfiles).toHaveLength(1);
    expect(normalized.localTerminal.customProfiles[0]).toMatchObject({
      name: "zsh",
      kind: "shell",
      command: "/bin/zsh",
      platform: "all",
      source: "custom",
      args: [],
      cwd: null,
      env: {},
      hidden: false,
      detected: false,
    });
  });

  it("下载目录去掉 Windows 非法字符并裁剪空白；超长路径回落默认", () => {
    const normalized = normalizeSettings({
      fileTransfer: { downloadRoot: '  D:\\downloads<>"|?*  ' },
    });
    expect(normalized.fileTransfer.downloadRoot).toBe("D:\\downloads");

    const tooLong = normalizeSettings({ fileTransfer: { downloadRoot: "x".repeat(261) } });
    expect(tooLong.fileTransfer.downloadRoot).toBe(defaultSettings.fileTransfer.downloadRoot);
  });
});

describe("normalizeHexColor", () => {
  it("三位短写展开为六位并大写", () => {
    expect(normalizeHexColor("#abc", "#000000")).toBe("#AABBCC");
  });

  it("六位写法裁剪空白并大写", () => {
    expect(normalizeHexColor("  #2374c6 ", "#000000")).toBe("#2374C6");
  });

  it.each(["2374C6", "#12", "#12345", "#GGGGGG", "", 42, null])("非法输入 %o 回落 fallback", (input) => {
    expect(normalizeHexColor(input, "#000000")).toBe("#000000");
  });
});

describe("normalizeFontFamilyInput", () => {
  it("剔除会破坏 CSS 声明的字符（各替换为一个空格），保留字体栈", () => {
    expect(normalizeFontFamilyInput('"Fira Code";{}monospace', "fallback")).toBe('"Fira Code"   monospace');
  });

  it("空串或超过 180 字符回落 fallback", () => {
    expect(normalizeFontFamilyInput("   ", "fallback")).toBe("fallback");
    expect(normalizeFontFamilyInput("a".repeat(181), "fallback")).toBe("fallback");
  });
});
