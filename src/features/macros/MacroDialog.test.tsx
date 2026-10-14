// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLocalePreference } from "../../shared/i18n";
import type { MultiExecTarget } from "../workspace/multiExec/targets";
import { MacroDialog } from "./MacroDialog";
const target: MultiExecTarget = { key: "ssh:a", sessionId: "fixture-session", title: "Fixture terminal", kind: "ssh", tabId: "a", ownerId: "fixture", binding: { kind: "ssh", tabId: "a" } };
function setup() {
  const runtime = { resolveTarget: vi.fn(() => target), write: vi.fn(async () => {}) }; const close = vi.fn();
  const view = render(<StrictMode><MacroDialog targets={[target]} runtime={runtime} onClose={close} /></StrictMode>);
  return { ...view, runtime, close };
}
beforeEach(() => setLocalePreference("en"));
afterEach(() => { cleanup(); vi.useRealTimers(); });
function preview() { fireEvent.change(screen.getByRole("textbox", { name: "Command" }), { target: { value: " pwd " } }); fireEvent.click(screen.getByRole("button", { name: "Preview macro" })); }

it("requires preview then explicit confirmation, and only reports terminal delivery", async () => {
  const { runtime } = setup(); preview(); expect(runtime.write).not.toHaveBeenCalled();
  expect(screen.getByText("Fixture terminal")).toBeDefined(); expect(screen.getByText("Wait 0 ms before sending")).toBeDefined();
  const confirm = screen.getByRole("button", { name: "Confirm replay" }); fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("All steps written"));
  expect(runtime.write).toHaveBeenCalledTimes(1); expect(runtime.write).toHaveBeenCalledWith("fixture-session", " pwd \r");
  expect(screen.queryByRole("button", { name: "Confirm replay" })).toBeNull();
});
it("rejects empty steps without opening a runnable preview", () => {
  setup(); fireEvent.click(screen.getByRole("button", { name: "Preview macro" }));
  expect(screen.getByRole("alert").textContent).toContain("nonblank"); expect(screen.queryByRole("button", { name: "Confirm replay" })).toBeNull();
});
it("allows editing steps, cancelling a delay, and reviewing again without implicit replay", async () => {
  vi.useFakeTimers(); const { runtime } = setup();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1000" } }); preview();
  fireEvent.click(screen.getByRole("button", { name: "Confirm replay" })); fireEvent.click(screen.getByRole("button", { name: "Cancel remaining steps" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByRole("status").textContent).toContain("Replay cancelled"); expect(runtime.write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Edit and review again" }));
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(" pwd ");
});
it("aborts remaining steps on Escape and unmount without a late write", async () => {
  vi.useFakeTimers(); const { runtime, close, unmount } = setup();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1000" } }); preview(); fireEvent.click(screen.getByRole("button", { name: "Confirm replay" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(close).toHaveBeenCalledTimes(1); unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); expect(runtime.write).not.toHaveBeenCalled();
});
it("displays a safe failure without rendering a native error payload", async () => {
  const { runtime } = setup(); runtime.write.mockRejectedValue(new Error("synthetic-secret-marker")); preview(); fireEvent.click(screen.getByRole("button", { name: "Confirm replay" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Replay stopped")); expect(screen.queryByText(/synthetic-secret-marker/)).toBeNull();
});
it("blocks omitted sensitive steps until explicitly replaced, then requires a fresh preview", async () => {
  const runtime = { resolveTarget: () => target, write: vi.fn(async () => {}) };
  render(<MacroDialog targets={[target]} runtime={runtime} onClose={vi.fn()} initialSteps={[{ command: "", delayMs: 0, masked: true }]} />);
  fireEvent.click(screen.getByRole("button", { name: "Preview macro" })); expect(screen.getByRole("alert").textContent).toContain("omitted sensitive step");
  expect(screen.queryByRole("button", { name: "Confirm replay" })).toBeNull(); expect(runtime.write).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "pwd" } }); fireEvent.click(screen.getByRole("button", { name: "Preview macro" }));
  expect(screen.getByRole("button", { name: "Confirm replay" })).toBeDefined(); expect(runtime.write).not.toHaveBeenCalled();
});
