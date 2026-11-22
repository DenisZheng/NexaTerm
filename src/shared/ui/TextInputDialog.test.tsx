// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TextInputDialog } from "./TextInputDialog";

afterEach(cleanup);
it("shows filename errors and submits through the existing naming form", () => {
  const cancel = vi.fn(), change = vi.fn(), submit = vi.fn((event) => event.preventDefault());
  render(<TextInputDialog open title="Save As" description="Save a new file" label="Filename" value="copy.txt" error="Target exists" onCancel={cancel} onChange={change} onSubmit={submit} />);
  expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toBe("Target exists");
  fireEvent.change(screen.getByLabelText("Filename"), { target: { value: "next.txt" } });
  expect(change).toHaveBeenCalledWith("next.txt");
  fireEvent.submit(screen.getByRole("dialog")); expect(submit).toHaveBeenCalledOnce();
  fireEvent.click(screen.getAllByRole("button").find((button) => button.textContent === "Cancel")!);
  expect(cancel).toHaveBeenCalledOnce();
});
it("locks input, submit, cancel and Escape while a save is pending", () => {
  const cancel = vi.fn(), change = vi.fn(), submit = vi.fn();
  render(<TextInputDialog open busy busyLabel="Saving" title="Save As" description="Save a new file" label="Filename" value="copy.txt" error={null} onCancel={cancel} onChange={change} onSubmit={submit} />);
  expect((screen.getByLabelText("Filename") as HTMLInputElement).disabled).toBe(true);
  for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(cancel).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
});
