// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLocalePreference } from "../../shared/i18n";
import { TerminalSplitLayout } from "./TerminalSplitSurface";
import type { TerminalSplitNode } from "./terminalSplitLayout";

beforeEach(() => setLocalePreference("en"));
afterEach(cleanup);
it("labels the focused input source separately from the fixed receiving pane", () => {
  const layout: TerminalSplitNode = { kind: "split", id: "split", direction: "row", ratio: 0.5,
    first: { kind: "leaf", id: "a", binding: { kind: "ssh", tabId: "a" } },
    second: { kind: "leaf", id: "b", binding: { kind: "ssh", tabId: "b" } } };
  const props = { focusedPaneId: "a", layout, sessionOptions: [
    { value: "ssh:a", label: "Fixture A", binding: { kind: "ssh" as const, tabId: "a" } },
    { value: "ssh:b", label: "Fixture B", binding: { kind: "ssh" as const, tabId: "b" } },
  ], syncEnabled: false, syncParticipantKeys: new Set(["ssh:b"]),
  onClearPane: vi.fn(), onClosePane: vi.fn(), onFocusPane: vi.fn(), onPickerOpenChange: vi.fn(),
  onRatioChange: vi.fn(), onResizeEnd: vi.fn(), onSelectSession: vi.fn(), onToggleSearch: vi.fn() };
  const { rerender } = render(<TerminalSplitLayout {...props} />);
  expect(screen.getByText("Focused")).toBeDefined();
  rerender(<TerminalSplitLayout {...props} syncEnabled />);
  expect(screen.queryByText("Focused")).toBeNull();
  // 输入源不必是勾选目标；这里只改显示，不变更目标集合。
  expect(screen.getByText("Primary input")).toBeDefined();
  expect(screen.getByText("Receiver")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /Close terminal pane 2/ }));
  expect(props.onClosePane).toHaveBeenCalledExactlyOnceWith("b");
  expect([...props.syncParticipantKeys]).toEqual(["ssh:b"]);
});

it.each([
  ["待连接", "Waiting to connect"], ["空闲", "Idle"], ["已连接", "Connected"], ["正在连接", "Connecting"], ["连接中", "Connecting"],
  ["连接失败", "Connection failed"], ["正在打开", "Opening"], ["预览", "Preview"],
  ["重新连接中", "Reconnecting"], ["重新连接失败", "Reconnect failed"],
  ["事件监听失败", "Event listener failed"], ["已断开", "Disconnected"],
  ["已断开，退出码 1", "Disconnected, exit code 1"],
])("Split 展示原始状态 %s 的英文标签，并响应语言切换", (status, label) => {
  const option = { value: "ssh:a", label: "Fixture A", status, binding: { kind: "ssh" as const, tabId: "a" } };
  render(<TerminalSplitLayout focusedPaneId="a"
    layout={{ kind: "leaf", id: "a", binding: option.binding }}
    sessionOptions={[option]} syncEnabled={false} syncParticipantKeys={new Set()}
    onClearPane={vi.fn()} onClosePane={vi.fn()} onFocusPane={vi.fn()} onPickerOpenChange={vi.fn()}
    onRatioChange={vi.fn()} onResizeEnd={vi.fn()} onSelectSession={vi.fn()} onToggleSearch={vi.fn()} />);
  expect(screen.queryByText(label)).not.toBeNull();
  act(() => setLocalePreference("zh-CN"));
  expect(screen.getByText(status === "连接中" ? "正在连接" : status)).toBeDefined();
  expect(option.status).toBe(status);
});
