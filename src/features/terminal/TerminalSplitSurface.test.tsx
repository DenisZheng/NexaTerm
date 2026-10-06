// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
