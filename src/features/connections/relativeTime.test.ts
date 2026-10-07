import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate, type Locale, type Translate } from "../../shared/i18n";
import { formatRelativeTime } from "./relativeTime";

const now = new Date("2026-10-07T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const translator = (locale: Locale): Translate => (key, params) => translate(locale, key, params);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe("最近连接相对时间", () => {
  it.each([
    [0, "Just now"], [1, "1 minute ago"], [2, "2 minutes ago"], [59, "59 minutes ago"],
    [60, "1 hour ago"], [120, "2 hours ago"], [1439, "23 hours ago"],
    [1440, "Yesterday"], [2879, "Yesterday"], [2880, "2 days ago"],
  ])("英文 %s 分钟的单复数与边界", (minutes, expected) => {
    expect(formatRelativeTime(ago(minutes), translator("en"))).toBe(expected);
  });
  it.each([[1, "1 分钟前"], [2, "2 分钟前"], [60, "1 小时前"], [120, "2 小时前"], [1440, "昨天"], [2880, "2 天前"]])(
    "中文 %s 分钟保持原文案", (minutes, expected) => {
      expect(formatRelativeTime(ago(minutes), translator("zh-CN"))).toBe(expected);
    },
  );
  it.each([null, undefined, "", "bad timestamp", "demo", "PREVIEW"])("缺失或预览时间 %s 保持兜底", (value) => {
    expect(formatRelativeTime(value, translator("en"))).toBe(translate("en", "workspace.recent"));
  });
  it("未来时间保持 Just now，同一时间可随语言切换", () => {
    expect(formatRelativeTime(ago(-1), translator("en"))).toBe("Just now");
    expect(formatRelativeTime(ago(60), translator("zh-CN"))).toBe("1 小时前");
    expect(formatRelativeTime(ago(60), translator("en"))).toBe("1 hour ago");
  });
});
