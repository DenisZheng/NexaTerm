import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appCss = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
const actionbarCss = readFileSync(new URL("../src/styles/actionbar.css", import.meta.url), "utf8");

function rule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

// 源码契约只保护布局归属；实际高度、文本宽度与主题观感仍需 GUI 验证。
test("设置页位于标题栏和操作栏之后的内容行", () => {
  assert.match(rule(appCss, ".app-shell"), /grid-template-rows:\s*36px 34px minmax\(0, 1fr\)/);
  assert.match(rule(appCss, ".settings-view"), /grid-row:\s*3\s*;/);
});

test("下拉菜单和上下文菜单共用完整的浮层间距与层级", () => {
  const surface = rule(appCss, ".context-menu-content,\n.dropdown-menu-content");
  assert.match(surface, /z-index:\s*50;/);
  assert.match(surface, /border-radius:\s*10px;/);
  assert.match(surface, /padding:\s*5px;/);
});

test("统一入口菜单的图标、主标签和尾部提示不落入两列网格", () => {
  const item = rule(actionbarCss, ".app-entry-menu .dropdown-menu-item");
  assert.match(item, /display:\s*flex;/);
  assert.match(item, /white-space:\s*nowrap;/);
  assert.match(rule(actionbarCss, ".app-entry-menu .dropdown-menu-item > .ui-icon:last-child:not(:first-child)"), /margin-left:\s*auto;/);
  assert.match(rule(actionbarCss, ".app-entry-reason"), /white-space:\s*normal;/);
});

test("只有前导图标加文本节点的菜单项仍靠左", () => {
  assert.equal(rule(actionbarCss, ".app-entry-menu .dropdown-menu-item > .ui-icon:last-child"), "");
});
