import { describe, expect, it } from "vitest";

import { translate } from "../../shared/i18n";
import { closeConfirmationCopy } from "./closeConfirmationText";

const zh = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
  translate("zh-CN", key, params);
const en = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
  translate("en", key, params);

describe("closeConfirmationCopy（WS-F08 关闭确认文案）", () => {
  it("汇总实例数、分屏 pane 数、连带关闭的远程文件与未保存文件", () => {
    const copy = closeConfirmationCopy(
      { cascadeConnectionCount: 1, dirtyFileNames: ["nginx.conf"], instanceCount: 4, splitPaneCount: 2 },
      zh,
    );
    expect(copy).toEqual({
      confirmLabel: "放弃修改并关闭",
      description:
        "将关闭的会话：4 个。其中分屏组包含 2 个终端。这些连接不再有终端，其远程文件将一并关闭。“nginx.conf”尚未保存的修改将被丢弃。",
      title: "关闭会话",
    });
  });

  it("只因分屏组确认时不提文件；多个未保存文件时给出数量", () => {
    expect(
      closeConfirmationCopy({ cascadeConnectionCount: 0, dirtyFileNames: [], instanceCount: 3, splitPaneCount: 3 }, zh)
        .description,
    ).toBe("将关闭的会话：3 个。其中分屏组包含 3 个终端。");
    expect(
      closeConfirmationCopy(
        { cascadeConnectionCount: 2, dirtyFileNames: ["a", "b"], instanceCount: 2, splitPaneCount: 0 },
        en,
      ),
    ).toEqual({
      confirmLabel: "Discard and close",
      description:
        "Sessions to close: 2. Remote files of connections left without terminals will be closed too. Unsaved changes in 2 files will be discarded.",
      title: "Close sessions",
    });
  });

  it("没有未保存文件时确认按钮为普通关闭", () => {
    expect(
      closeConfirmationCopy({ cascadeConnectionCount: 0, dirtyFileNames: [], instanceCount: 2, splitPaneCount: 2 }, en)
        .confirmLabel,
    ).toBe("Close");
  });
});
