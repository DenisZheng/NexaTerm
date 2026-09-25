import { useMemo, useSyncExternalStore } from "react";

import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

/**
 * 最小 i18n 内核（WS-E09，WF-01）：自建 `t(key, params)` + JSON 目录 + `useLocale`，不引入 i18n 依赖。
 * 只服务新入口（顶栏、菜单、工具栏、侧栏切换等）；旧面板的全量迁移留到对应交付包。
 * 需要复数 / ICU 时再评估第三方库。
 */

export type Locale = "en" | "zh-CN";
/** 用户偏好：`system` 跟随系统语言。 */
export type LocalePreference = "system" | Locale;
export type MessageKey = keyof typeof en;
export type MessageParams = Readonly<Record<string, number | string>>;
export type Translate = (key: MessageKey, params?: MessageParams) => string;

// 以 en 为键集合基准：zh-CN 缺键时这里类型报错；多出的键由 i18n.test.ts 断言。
const catalogs: Record<Locale, Record<MessageKey, string>> = { en, "zh-CN": zhCN };

/** 偏好 → 实际语言：`system` 取系统首选语言，中文（任意地区）归 zh-CN，其它归 en。 */
export function resolveLocale(preference: LocalePreference, systemLanguages: readonly string[]): Locale {
  if (preference !== "system") {
    return preference;
  }
  return systemLanguages[0]?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** 纯函数版翻译：`{name}` 具名占位；缺参数时保留占位符原样输出，便于发现遗漏。 */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = catalogs[locale][key];
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder,
  );
}

function systemLanguages(): readonly string[] {
  if (typeof navigator === "undefined") {
    return [];
  }
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

let currentLocale: Locale = resolveLocale("system", systemLanguages());
const listeners = new Set<() => void>();

/** 设置页 / 启动时调用；语言实际变化才通知订阅者。 */
export function setLocalePreference(preference: LocalePreference) {
  const next = resolveLocale(preference, systemLanguages());
  if (next === currentLocale) {
    return;
  }
  currentLocale = next;
  listeners.forEach((listener) => listener());
}

export function getLocale(): Locale {
  return currentLocale;
}

/** 非组件场景使用；组件内用 `useI18n()`，否则语言切换时不会重新渲染。 */
export const t: Translate = (key, params) => translate(currentLocale, key, params);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** 组件内翻译：订阅语言变化，返回绑定当前语言的 `t`（同一语言下引用稳定，可放进依赖数组）。 */
export function useI18n(): { locale: Locale; t: Translate } {
  const locale = useLocale();
  return useMemo(
    () => ({ locale, t: (key: MessageKey, params?: MessageParams) => translate(locale, key, params) }),
    [locale],
  );
}
