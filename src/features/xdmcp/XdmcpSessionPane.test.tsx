// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { XdmcpSessionOwner } from "./XdmcpSessionOwner";
import { XdmcpWorkspaceSessions } from "../layout/xdmcpWorkspaceSessions";
import XdmcpSessionPane from "./XdmcpSessionPane";
import { apiFixture, deferred, request } from "./testFixtures";
import { setLocalePreference } from "../../shared/i18n";
import { selectXdmcpEngine } from "../../shared/tauri/dialog";
vi.mock("../../shared/tauri/dialog", () => ({ selectXdmcpEngine: vi.fn() }));
afterEach(cleanup);
function fixture() {
  setLocalePreference("en"); const api = apiFixture(), pause = deferred<void>(), owner = new XdmcpSessionOwner(api, () => pause.promise);
  const sessions = new XdmcpWorkspaceSessions(async () => ({ createXdmcpSession: () => owner })); sessions.open("tab"); const onState = vi.fn(), onClose = vi.fn();
  render(<StrictMode><XdmcpSessionPane tabId="tab" title="XDMCP" active sessions={sessions} onState={onState} onClose={onClose} /></StrictMode>);
  return { api, owner, sessions, pause, onState, onClose };
}
async function fill() {
  await screen.findByLabelText("Target IPv4");
  for (const [label, value] of [["Target IPv4", request.target], ["Local IPv4 interface", request.local_address], ["External engine absolute path", request.executable]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
function permits() {
  fireEvent.click(screen.getByLabelText(/I trust this executable/)); fireEvent.click(screen.getByLabelText(/I understand the plaintext/));
}
describe("XDMCP actual development pane", () => {
  it("opens without side effects, focuses validation, consumes consent and shows querying honestly", async () => {
    const f = fixture(); await fill(); expect(f.api.capabilities).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Connect once" })); expect(screen.getByRole("alert")).toBe(document.activeElement); expect(f.api.reserve).not.toHaveBeenCalled();
    permits(); fireEvent.click(screen.getByRole("button", { name: "Connect once" }));
    await screen.findByText("Engine started; desktop login unverified");
    expect(f.api.start).toHaveBeenCalledWith(expect.any(String), request);
    expect((screen.getByLabelText(/I trust this executable/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Target IPv4") as HTMLInputElement).disabled).toBe(true);
    expect(JSON.stringify(f.onState.mock.calls)).not.toContain(request.target);
    fireEvent.click(screen.getByRole("button", { name: "Cancel connection" }));
    await waitFor(() => expect(f.api.stop).toHaveBeenCalledTimes(1)); await act(async () => { f.pause.resolve(); });
    await screen.findByText("Closed"); fireEvent.click(screen.getByRole("button", { name: "Connect again" })); expect(f.api.reserve).toHaveBeenCalledTimes(1);
    await act(() => f.sessions.dispose());
  });
  it("invalidates both permissions after edits and handles picker cancellation and errors", async () => {
    const f = fixture(); await fill(); permits();
    fireEvent.change(screen.getByLabelText("Target IPv4"), { target: { value: "192.0.2.7" } });
    for (const checkbox of screen.getAllByRole("checkbox")) expect((checkbox as HTMLInputElement).checked).toBe(false);
    vi.mocked(selectXdmcpEngine).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("private diagnostic"));
    fireEvent.click(screen.getByRole("button", { name: "Choose native X server" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Connect once" }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByLabelText("External engine absolute path") as HTMLInputElement).value).toBe(request.executable);
    fireEvent.click(screen.getByRole("button", { name: "Choose native X server" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not open the file picker"); expect(screen.queryByText("private diagnostic")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close session" })); expect(f.onClose).toHaveBeenCalledTimes(1);
    expect(f.api.reserve).not.toHaveBeenCalled(); await act(() => f.sessions.dispose());
  });
  it("keeps failed cleanup visible and disables reconnection", async () => {
    const f = fixture(); await fill(); permits(); f.api.stop.mockRejectedValue(new Error("private failure"));
    fireEvent.click(screen.getByRole("button", { name: "Connect once" })); await screen.findByText("Engine started; desktop login unverified");
    fireEvent.click(screen.getByRole("button", { name: "Cancel connection" })); await act(async () => { f.pause.resolve(); });
    await screen.findByText("Cleanup incomplete; retry close"); expect((screen.getByRole("button", { name: "Connect again" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry close" })); expect(f.onClose).toHaveBeenCalledTimes(1);
    f.api.stop.mockResolvedValue(undefined); await act(() => f.sessions.dispose());
  });
  it("keeps field names stable after errors so users can correct them", async () => {
    const f = fixture(); await screen.findByRole("button", { name: "Connect once" });
    fireEvent.click(screen.getByRole("button", { name: "Connect once" }));
    for (const name of ["Target IPv4", "Local IPv4 interface", "External engine absolute path"]) {
      expect(screen.getByRole("textbox", { name })).toBeTruthy();
    }
    await fill(); expect(f.api.start).not.toHaveBeenCalled(); await act(() => f.sessions.dispose());
  });
});
