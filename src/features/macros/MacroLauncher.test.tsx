// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLocalePreference } from "../../shared/i18n";
import type { MultiExecTarget } from "../workspace/multiExec/targets";
import { MacroLauncher } from "./MacroLauncher";
const a: MultiExecTarget = { key: "ssh:a", sessionId: "fixture-a", title: "Fixture A", kind: "ssh", tabId: "a", ownerId: "fixture", binding: { kind: "ssh", tabId: "a" } };
const b = { ...a, key: "ssh:b", sessionId: "fixture-b", title: "Fixture B", tabId: "b" };
beforeEach(() => setLocalePreference("en"));
afterEach(cleanup);
it("requires explicit selection and calls the shell transition before opening", async () => {
  const onOpen = vi.fn(); const runtime = { resolveTarget: () => a, write: vi.fn(async () => {}) };
  const { rerender } = render(<MacroLauncher targets={[a]} selectedKeys={new Set()} runtime={runtime} onOpen={onOpen} />);
  expect((screen.getByRole("button", { name: "Macro" }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<MacroLauncher targets={[a]} selectedKeys={new Set([a.key])} runtime={runtime} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole("button", { name: "Macro" })); expect(onOpen).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole("dialog")).toBeDefined(); expect(runtime.write).not.toHaveBeenCalled();
});
it("keeps a preview fixed when focus/selection changes and discards a closed draft", async () => {
  const runtime = { resolveTarget: (key: string) => key === a.key ? a : b, write: vi.fn(async () => {}) }; const onOpen = vi.fn();
  const { rerender } = render(<MacroLauncher targets={[a, b]} selectedKeys={new Set([a.key])} runtime={runtime} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole("button", { name: "Macro" })); await screen.findByRole("dialog");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "pwd" } }); fireEvent.click(screen.getByRole("button", { name: "Preview macro" }));
  rerender(<MacroLauncher targets={[a, b]} selectedKeys={new Set([b.key])} runtime={runtime} onOpen={onOpen} />);
  expect(screen.getByText("Fixture A")).toBeDefined(); expect(screen.queryByText("Fixture B")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Confirm replay" }));
  await waitFor(() => expect(runtime.write).toHaveBeenCalledWith(a.sessionId, "pwd\r"));
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]); fireEvent.click(screen.getByRole("button", { name: "Macro" }));
  expect((await screen.findByRole("textbox") as HTMLTextAreaElement).value).toBe("");
});
