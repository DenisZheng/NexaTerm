import type { Translate } from "../../shared/i18n";
import { connectionTimestampOf } from "./connectionSearch";

/** 最近连接时间；保留原有 Yesterday 与无效时间语义，翻译随调用方语言变化。 */
export function formatRelativeTime(value: string | null | undefined, tr: Translate) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "demo" || normalized === "preview") {
    return tr("workspace.recent");
  }

  const timestamp = connectionTimestampOf(value);

  if (!timestamp) {
    return tr("workspace.recent");
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return tr("workspace.time.justNow");
  if (diffMs < hour) {
    const count = Math.floor(diffMs / minute);
    return tr(count === 1 ? "workspace.time.minuteAgo" : "workspace.time.minutesAgo", { count });
  }
  if (diffMs < day) {
    const count = Math.floor(diffMs / hour);
    return tr(count === 1 ? "workspace.time.hourAgo" : "workspace.time.hoursAgo", { count });
  }
  if (diffMs < 2 * day) return tr("workspace.time.yesterday");
  return tr("workspace.time.daysAgo", { count: Math.floor(diffMs / day) });
}
