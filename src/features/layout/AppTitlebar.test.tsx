// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { setLocalePreference } from "../../shared/i18n";

import { AppTitlebar } from "./AppTitlebar";
import type { TitlebarItem } from "./titlebarItems";

// 假数据：名称为占位串，不含真实主机或凭据。
const items: TitlebarItem[] = [
  { badge: null, closable: false, detail: null, id: "home", kind: "home", label: "首页" },
  { badge: "SSH", closable: true, detail: "root@10.0.0.1:22", id: "ssh:t1", kind: "ssh", label: "prod · 终端" },
  { badge: "SSH", closable: true, detail: "root@10.0.0.1:22", id: "ssh:t2", kind: "ssh", label: "prod · 终端 2" },
];

function renderTitlebar(overrides: Partial<Parameters<typeof AppTitlebar>[0]> = {}) {
  const props = {
    activeItemId: "ssh:t2",
    items,
    leftPaneCollapsed: false,
    newSession: {
      localProfiles: [],
      localProfilesLoading: false,
      onCreateConnection: vi.fn(),
      onOpenLocalProfile: vi.fn(),
      onQuickOpen: vi.fn(),
    },
    onCloseAll: vi.fn(),
    onCloseItem: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseToRight: vi.fn(),
    onSelectItem: vi.fn(),
    onToggleLeftPane: vi.fn(),
    ...overrides,
  };
  render(<AppTitlebar {...props} />);
  return props;
}

// jsdom 默认系统语言为 en-US；断言中文文案前显式切到 zh-CN。
beforeAll(() => setLocalePreference("zh-CN"));
afterEach(cleanup);

describe("AppTitlebar 实例标签（WF-01 切片 3）", () => {
  it("同一连接的两个终端是两个标签；首页在最前且没有关闭按钮", () => {
    renderTitlebar();
    const tabs = screen.getAllByRole("button", { name: /首页|prod/ }).filter((el) => el.classList.contains("tab"));
    expect(tabs.map((el) => el.textContent)).toEqual(["首页", "SSHprod · 终端", "SSHprod · 终端 2"]);
    expect(screen.queryByRole("button", { name: "关闭 首页" })).toBeNull();
    expect(screen.getByRole("button", { name: "关闭 prod · 终端 2" })).toBeTruthy();
  });

  it("活动项标记 aria-current；点击与关闭按实例 id 回调", () => {
    const props = renderTitlebar();
    const active = screen.getByText("prod · 终端 2").closest("button");
    expect(active?.getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByText("prod · 终端"));
    expect(props.onSelectItem).toHaveBeenCalledWith("ssh:t1");
    fireEvent.click(screen.getByRole("button", { name: "关闭 prod · 终端" }));
    expect(props.onCloseItem).toHaveBeenCalledWith("ssh:t1");
    expect(props.onCloseItem).not.toHaveBeenCalledWith("ssh:t2");
  });

  it("中键关闭作用于该实例", () => {
    const props = renderTitlebar();
    const shell = screen.getByText("prod · 终端 2").closest(".tab-shell");
    fireEvent(shell as Element, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(props.onCloseItem).toHaveBeenCalledWith("ssh:t2");
  });
});
