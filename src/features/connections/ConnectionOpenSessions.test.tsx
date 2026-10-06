// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocalePreference } from "../../shared/i18n";
import { ConnectionOpenSessions } from "./ConnectionOpenSessions";
import type { OpenSessionEntry } from "../layout/sessionNavigation";

const entries: OpenSessionEntry[] = [0, 1].map((index) => ({
  id: `ssh:fixture-${index}`, kind: "ssh", connectionId: "profile", label: `Fixture · Terminal ${index + 1}`,
  detail: "tester@example.invalid:22", badge: "SSH", closable: true,
}));
beforeEach(() => {
  setLocalePreference("en");
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Session tree opened indicator", () => {
  it("does not offer a jump for unopened profiles", () => {
    render(<ConnectionOpenSessions connectionName="Fixture" entries={[]} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("jumps directly to the only logical instance", () => {
    const onSelect = vi.fn();
    render(<ConnectionOpenSessions connectionName="Fixture" entries={entries.slice(0, 1)} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("ssh:fixture-0");
  });
  it("requires an explicit choice for multiple instances and supports keyboard access", async () => {
    const onSelect = vi.fn();
    render(<ConnectionOpenSessions connectionName="Fixture" entries={entries} onSelect={onSelect} />);
    const trigger = screen.getByRole("button");
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Fixture · Terminal 2/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("ssh:fixture-1");
  });
});
