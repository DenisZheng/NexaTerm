// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLocalePreference } from "../../shared/i18n";
import { TerminalLogControls } from "./TerminalLogControls";
import { terminalLogStart, terminalLogStatus, terminalLogStop, type TerminalLogStatus } from "../../shared/tauri/commands";
import { selectTerminalLogSavePath } from "../../shared/tauri/dialog";

vi.mock("../../shared/tauri/commands", () => ({ terminalLogStart: vi.fn(), terminalLogStatus: vi.fn(), terminalLogStop: vi.fn() }));
vi.mock("../../shared/tauri/dialog", () => ({ selectTerminalLogSavePath: vi.fn() }));
vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));
const snapshot = (state: TerminalLogStatus["state"] = "recording"): TerminalLogStatus => ({ capture_id: "capture-one", state, bytes_written: 3 });

beforeEach(() => {
  vi.resetAllMocks();
  setLocalePreference("en");
  vi.mocked(terminalLogStatus).mockResolvedValue(null);
  vi.mocked(selectTerminalLogSavePath).mockResolvedValue("/private/new.log");
  vi.mocked(terminalLogStart).mockResolvedValue(snapshot());
  vi.mocked(terminalLogStop).mockResolvedValue(snapshot("stopped"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function openConfirmation() {
  await waitFor(() => expect((screen.getByRole("button", { name: "Start log" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Start log" }));
  expect(screen.getByRole("dialog").textContent).toContain("not redacted");
}

it("requires confirmation and path selection before starting the exact instance", async () => {
  render(<TerminalLogControls sessionId="session-one" />);
  await openConfirmation();
  expect(terminalLogStart).not.toHaveBeenCalled();
  expect(selectTerminalLogSavePath).not.toHaveBeenCalled();
  vi.mocked(terminalLogStatus).mockResolvedValue(snapshot());
  fireEvent.click(screen.getByRole("button", { name: "Choose new file" }));
  await waitFor(() => expect(terminalLogStart).toHaveBeenCalledWith("session-one", "/private/new.log"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Stop log" })).toBeTruthy());
});

it("cancelling either dialog does not create a capture", async () => {
  render(<TerminalLogControls sessionId="session-one" />);
  await openConfirmation();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(selectTerminalLogSavePath).not.toHaveBeenCalled();
  await openConfirmation();
  vi.mocked(selectTerminalLogSavePath).mockResolvedValue(null);
  fireEvent.click(screen.getByRole("button", { name: "Choose new file" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(terminalLogStart).not.toHaveBeenCalled();
});

it("does not retarget a delayed picker after disconnect and reconnect", async () => {
  let choose!: (path: string) => void;
  vi.mocked(selectTerminalLogSavePath).mockImplementation(() => new Promise((resolve) => { choose = resolve; }));
  const view = render(<TerminalLogControls sessionId="old" />);
  await openConfirmation();
  fireEvent.click(screen.getByRole("button", { name: "Choose new file" }));
  view.rerender(<TerminalLogControls sessionId={null} />);
  view.rerender(<TerminalLogControls sessionId="new" />);
  await act(async () => choose("/private/new.log"));
  expect(terminalLogStart).not.toHaveBeenCalled();
});

it("does not start after unmount while picking a file", async () => {
  let choose!: (path: string) => void;
  vi.mocked(selectTerminalLogSavePath).mockImplementation(() => new Promise((resolve) => { choose = resolve; }));
  const view = render(<TerminalLogControls sessionId="old" />);
  await openConfirmation();
  fireEvent.click(screen.getByRole("button", { name: "Choose new file" }));
  view.unmount();
  await act(async () => choose("/private/new.log"));
  expect(terminalLogStart).not.toHaveBeenCalled();
});

it("reattaches on remount and stops by session and capture ID", async () => {
  vi.mocked(terminalLogStatus).mockResolvedValue(snapshot());
  const view = render(<TerminalLogControls sessionId="session-one" />);
  await screen.findByRole("button", { name: "Stop log" });
  view.unmount();
  expect(terminalLogStop).not.toHaveBeenCalled();
  render(<TerminalLogControls sessionId="session-one" />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop log" }));
  await waitFor(() => expect(terminalLogStop).toHaveBeenCalledWith("session-one", "capture-one"));
  expect(terminalLogStart).not.toHaveBeenCalled();
});

it("keeps operation failures visible until explicit status retry", async () => {
  vi.mocked(terminalLogStart).mockRejectedValue(new Error("opaque failure"));
  render(<TerminalLogControls sessionId="session-one" />);
  await openConfirmation();
  fireEvent.click(screen.getByRole("button", { name: "Choose new file" }));
  const retry = await screen.findByRole("button", { name: "Check status" });
  expect(screen.getByRole("status").textContent).toContain("unavailable");
  expect(document.body.textContent).not.toContain("opaque failure");
  fireEvent.click(retry);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Check status" })).toBeNull());
});

it("shows terminal overflow and encoding failures without silently restarting", async () => {
  vi.mocked(terminalLogStatus).mockResolvedValue(snapshot("overflow"));
  const view = render(<TerminalLogControls sessionId="one" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("queue full"));
  vi.mocked(terminalLogStatus).mockResolvedValue(snapshot("invalid_encoding"));
  view.rerender(<TerminalLogControls sessionId="two" />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("incomplete UTF-8"));
  expect(terminalLogStart).not.toHaveBeenCalled();
});

it("continues querying the disconnected instance until its flush finishes", async () => {
  vi.mocked(terminalLogStatus).mockResolvedValue(snapshot());
  const view = render(<TerminalLogControls sessionId="old" />);
  await screen.findByRole("button", { name: "Stop log" });
  vi.mocked(terminalLogStatus).mockResolvedValue(snapshot("stopped"));
  view.rerender(<TerminalLogControls sessionId={null} />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Log stopped"));
  expect(terminalLogStatus).toHaveBeenLastCalledWith("old");
  expect((screen.getByRole("button", { name: "Start log" }) as HTMLButtonElement).disabled).toBe(true);
});

it("does not offer logging for unsupported terminal protocols", async () => {
  render(<TerminalLogControls sessionId="serial" supported={false} />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("SSH and Local/WSL"));
  expect((screen.getByRole("button", { name: "Start log" }) as HTMLButtonElement).disabled).toBe(true);
  expect(terminalLogStatus).not.toHaveBeenCalled();
  expect(terminalLogStart).not.toHaveBeenCalled();
});
