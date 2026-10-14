// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLocalePreference } from "../../shared/i18n";
import type { MultiExecTarget } from "../workspace/multiExec/targets";
import { MacroRecordingDialog } from "./MacroRecordingDialog";
const target: MultiExecTarget = { key: "ssh:a", sessionId: "fixture-a", title: "Fixture A", kind: "ssh", tabId: "a", ownerId: "fixture", binding: { kind: "ssh", tabId: "a" } };
beforeEach(() => setLocalePreference("en")); afterEach(cleanup);
it("requires an explicit source and does not start or write when cancelled", () => {
  const start = vi.fn(() => true), close = vi.fn(); render(<MacroRecordingDialog targets={[target]} onStart={start} onClose={close} />);
  expect((screen.getByRole("button", { name: "Start new recording" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(start).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
});
it("passes the selected concrete source and reports a source that became unavailable", () => {
  const start = vi.fn(() => false); render(<MacroRecordingDialog targets={[target]} onStart={start} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Recording source" })); fireEvent.click(screen.getByRole("option", { name: "Fixture A" }));
  fireEvent.click(screen.getByRole("button", { name: "Start new recording" })); expect(start).toHaveBeenCalledWith(target);
  expect(screen.getByRole("alert").textContent).toContain("source session changed or disconnected");
});
