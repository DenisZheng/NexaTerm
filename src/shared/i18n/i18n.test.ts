import { describe, expect, it } from "vitest";

import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import { resolveLocale, translate } from "./index";

describe("resolveLocale", () => {
  it("显式偏好直接生效，不看系统语言", () => {
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
  });

  it("system 按系统首选语言：中文任意地区归 zh-CN，其它归 en", () => {
    expect(resolveLocale("system", ["zh-TW", "en-US"])).toBe("zh-CN");
    expect(resolveLocale("system", ["en-GB", "zh-CN"])).toBe("en");
    expect(resolveLocale("system", ["fr-FR"])).toBe("en");
  });

  it("拿不到系统语言时按 en", () => {
    expect(resolveLocale("system", [])).toBe("en");
  });
});

describe("translate", () => {
  it("按 locale 取文案并替换具名参数", () => {
    expect(translate("zh-CN", "titlebar.closeItem", { label: "prod · 终端" })).toBe("关闭 prod · 终端");
    expect(translate("en", "titlebar.closeItem", { label: "prod · Terminal" })).toBe("Close prod · Terminal");
  });

  it("数字参数按字面量输出", () => {
    expect(translate("en", "item.sshTerminalN", { n: 2, name: "prod" })).toBe("prod · Terminal 2");
  });

  it("缺参数时保留占位符，不静默吞掉", () => {
    expect(translate("en", "titlebar.closeItem")).toBe("Close {label}");
  });
});

describe("locale catalogs", () => {
  it("en 与 zh-CN 键集合一致", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
  });

  it("两种语言中同一键的占位符一致", () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(zhCN[key]), key).toEqual(placeholders(en[key]));
    }
  });
});
