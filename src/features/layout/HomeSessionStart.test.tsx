// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocalePreference } from "../../shared/i18n";
import { HomeSessionStart } from "./HomeSessionStart";

beforeEach(() => setLocalePreference("en"));
afterEach(cleanup);
function setup() {
  const onQuickConnect = vi.fn();
  const newSession = { localProfiles: [], localProfilesLoading: false,
    onCreateConnection: vi.fn(), onOpenLocalProfile: vi.fn(), onQuickOpen: vi.fn() };
  render(<HomeSessionStart newSession={newSession} onQuickConnect={onQuickConnect} />);
  return { onQuickConnect, newSession };
}

describe("Home session entry", () => {
  it("prevents duplicate starts while pending and preserves the address on a failed start", async () => {
    const { onQuickConnect } = setup();
    let rejectStart!: (error: Error) => void;
    onQuickConnect.mockImplementation(() => new Promise<void>((_, reject) => { rejectStart = reject; }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "tester@example.invalid" } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);
    expect(onQuickConnect).toHaveBeenCalledTimes(1);
    await act(async () => rejectStart(new Error("private-fixture-detail")));
    expect((input as HTMLInputElement).value).toBe("tester@example.invalid");
    expect(screen.getByRole("alert").textContent).toContain("Could not open");
    expect(screen.queryByText("private-fixture-detail")).toBeNull();
  });
  it("submits one parsed temporary target without saving a profile", async () => {
    const { onQuickConnect, newSession } = setup();
    const input = screen.getByRole("textbox", { name: "Quick Connect" });
    fireEvent.change(input, { target: { value: "ssh://tester@example.invalid:2222" } });
    fireEvent.submit(input.closest("form")!);
    expect(onQuickConnect).toHaveBeenCalledExactlyOnceWith({
      canonicalAddress: "ssh://tester@example.invalid:2222", host: "example.invalid", port: 2222, username: "tester",
    });
    expect(newSession.onCreateConnection).not.toHaveBeenCalled();
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
  });
  it.each(["ssh://tester:password@example.invalid", "ssh://tester@example.invalid:99999", "ssh tester@example.invalid"])(
    "does not execute an invalid address: %s", (address) => {
      const { onQuickConnect } = setup();
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: address } });
      fireEvent.submit(input.closest("form")!);
      expect(onQuickConnect).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeDefined();
      expect((screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement).disabled).toBe(true);
    },
  );
  it("keeps saving explicit and changes language without resetting the draft", () => {
    const { newSession } = setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "tester@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "New saved session" }));
    expect(newSession.onCreateConnection).toHaveBeenCalledTimes(1);
    act(() => setLocalePreference("zh-CN"));
    expect((screen.getByRole("textbox", { name: "快速连接" }) as HTMLInputElement).value).toBe("tester@example.invalid");
    expect(screen.getByRole("button", { name: "连接" })).toBeDefined();
    act(() => setLocalePreference("en"));
    expect(screen.getByRole("button", { name: "Local terminal" })).toBeDefined();
  });
});
