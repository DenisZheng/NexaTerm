// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocalePreference } from "../../shared/i18n";
import type { MultiExecTarget } from "../workspace/multiExec/targets";
import { MultiExecBar, type MultiExecBarProps } from "./MultiExecBar";

const targets: MultiExecTarget[] = [
  { binding: { kind: "ssh", tabId: "a" }, key: "ssh:a", kind: "ssh", ownerId: "c1", sessionId: "s1", tabId: "a", title: "prod · Terminal" },
  { binding: { kind: "local", tabId: "b" }, key: "local:b", kind: "local", ownerId: "p1", sessionId: "s2", tabId: "b", title: "Ubuntu · 1" },
];

function setup(overrides: Partial<MultiExecBarProps> = {}) {
  const props: MultiExecBarProps = {
    error: null,
    mode: "off",
    selectedKeys: new Set(["ssh:a"]),
    targets,
    onClose: vi.fn(),
    onOpenCommandSender: vi.fn(),
    onStartLive: vi.fn(),
    onStop: vi.fn(),
    onToggleTarget: vi.fn(),
    ...overrides,
  };
  const view = render(<MultiExecBar {...props} />);
  return { ...view, props };
}

beforeEach(() => {
  setLocalePreference("en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WF-04C MultiExec bar", () => {
  it("renders target chips and reports explicit selection changes", () => {
    const { props } = setup();
    expect(screen.getByRole("button", { name: "prod · Terminal" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Ubuntu · 1" }));
    expect(props.onToggleTarget).toHaveBeenCalledWith("local:b", true);
    fireEvent.click(screen.getByRole("button", { name: "prod · Terminal" }));
    expect(props.onToggleTarget).toHaveBeenCalledWith("ssh:a", false);
  });

  it("keeps live input disabled until a target is explicitly selected", () => {
    const { props } = setup({ selectedKeys: new Set() });
    const live = screen.getByRole("button", { name: "Live input" });
    expect((live as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(live);
    expect(props.onStartLive).not.toHaveBeenCalled();
  });

  it("does not enable live for a selection whose runtime target disappeared", () => {
    setup({ selectedKeys: new Set(["ssh:disconnected"]) });
    expect((screen.getByRole("button", { name: "Live input" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts live input and shows the active status with a stop control", () => {
    const { props, rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Live input" }));
    expect(props.onStartLive).toHaveBeenCalledTimes(1);
    rerender(<MultiExecBar {...props} mode="live" />);
    expect(screen.getByRole("status").textContent).toContain("Active");
    fireEvent.click(screen.getByRole("button", { name: "Stop broadcast" }));
    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it("toggles live off from the mode button while active", () => {
    const { props } = setup({ mode: "live" });
    const live = screen.getByRole("button", { name: "Live input" });
    expect(live.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(live);
    expect(props.onStop).toHaveBeenCalledTimes(1);
    expect(props.onStartLive).not.toHaveBeenCalled();
  });

  it("opens Command Sender for sending and closes the bar on request", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Send command/ }));
    expect(props.onOpenCommandSender).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Collapse MultiExec" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the send entry available when Command Sender is already active", () => {
    const { props } = setup({ mode: "send" });
    const send = screen.getByRole("button", { name: /Send command/ });
    expect(send.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(send);
    expect(props.onOpenCommandSender).toHaveBeenCalledTimes(1);
  });

  it("shows the empty hint and surfaces sync errors", () => {
    setup({ error: "sync failed", selectedKeys: new Set(), targets: [] });
    expect(screen.getByText(/No terminal targets yet/)).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("sync failed");
    expect((screen.getByRole("button", { name: /Send command/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
