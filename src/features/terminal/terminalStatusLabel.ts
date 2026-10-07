import type { MessageKey, Translate } from "../../shared/i18n";

const statusKeys = new Map<string, MessageKey>([
  ["待连接", "terminal.status.waiting"],
  ["空闲", "terminal.status.idle"],
  ["正在打开", "workspace.local.status.opening"],
  ["预览", "workspace.local.status.preview"],
  ["已连接", "workspace.local.status.connected"],
  ["正在连接", "workspace.local.status.connecting"],
  ["连接中", "workspace.local.status.connecting"],
  ["连接失败", "workspace.connection.failed"],
  ["重新连接中", "terminal.status.reconnecting"],
  ["重新连接失败", "terminal.status.reconnectFailed"],
  ["事件监听失败", "terminal.status.listenerFailed"],
]);

/** 只转换既有运行时状态的显示文案，不改写状态机或远端输出。 */
export function terminalStatusLabel(status: string, t: Translate): string {
  const key = statusKeys.get(status);
  if (key) return t(key);
  // TerminalPanel 的断开状态包含当时语言的退出码后缀；展示时按当前语言重建。
  const disconnected = /^已断开(?:(?:，退出码 |, exit code )(-?\d+))?$/.exec(status);
  if (disconnected) {
    const suffix = disconnected[1] === undefined ? "" : t("terminal.output.exitSuffix", { code: disconnected[1] });
    return t("terminal.status.disconnected") + suffix;
  }
  // 连接步骤已提供本地化文案；未知诊断信息原样保留，不能伪造为成功或空白。
  return status;
}
