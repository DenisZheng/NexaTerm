import { expect, it } from "vitest";
import { translate, type Locale, type Translate } from "../../shared/i18n";
import { terminalStatusLabel } from "./terminalStatusLabel";

const translator = (locale: Locale): Translate => (key, params) => translate(locale, key, params);

it("两种语言生成的退出码后缀随当前显示语言变化，保留退出码", () => {
  for (const status of ["已断开，退出码 -1", "已断开, exit code -1"]) {
    expect(terminalStatusLabel(status, translator("en"))).toBe("Disconnected, exit code -1");
    expect(terminalStatusLabel(status, translator("zh-CN"))).toBe("已断开，退出码 -1");
  }
});

it("已本地化步骤与未知诊断原样保留，不伪造状态", () => {
  for (const status of ["Connected", "Custom diagnostic", "已断开：自定义原因", ""]) {
    expect(terminalStatusLabel(status, translator("en"))).toBe(status);
  }
});
