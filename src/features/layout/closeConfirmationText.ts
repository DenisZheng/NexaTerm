import type { Translate } from "../../shared/i18n";
import type { CloseConfirmation } from "../workspace/sessionTabs/itemClose";

export interface CloseConfirmationCopy {
  confirmLabel: string;
  description: string;
  title: string;
}

/**
 * 关闭确认对话框文案（WS-F08 未保存编辑的关闭确认）：一次确认汇总本次关闭的实例数、分屏组成员数、随终端关闭的远程文件
 * 与将被丢弃的未保存文件。句子之间的分隔由语言目录决定（中文无空格）。
 */
export function closeConfirmationCopy(confirmation: CloseConfirmation, t: Translate): CloseConfirmationCopy {
  const sentences = [t("close.instances", { count: confirmation.instanceCount })];
  if (confirmation.splitPaneCount > 1) {
    sentences.push(t("close.splitGroup", { count: confirmation.splitPaneCount }));
  }
  if (confirmation.cascadeConnectionCount > 0) {
    sentences.push(t("close.cascadeFiles"));
  }
  if ((confirmation.activeTransferCount ?? 0) > 0) {
    sentences.push(t("close.activeTransfers", { count: confirmation.activeTransferCount ?? 0 }));
  }
  const [firstDirty] = confirmation.dirtyFileNames;
  if (confirmation.dirtyFileNames.length === 1 && firstDirty !== undefined) {
    sentences.push(t("close.dirtyOne", { name: firstDirty }));
  } else if (confirmation.dirtyFileNames.length > 1) {
    sentences.push(t("close.dirtyMany", { count: confirmation.dirtyFileNames.length }));
  }
  return {
    confirmLabel: confirmation.dirtyFileNames.length > 0 ? t("close.confirmDiscard") : t("close.confirm"),
    description: sentences.join(t("common.sentenceSeparator")),
    title: t("close.title"),
  };
}
