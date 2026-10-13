// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocale, setLocalePreference, type Locale } from "../../shared/i18n";

const mocks = vi.hoisted(() => ({ list: vi.fn(), choose: vi.fn() }));
vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));
vi.mock("../../shared/tauri/commands", () => ({ localFileList: mocks.list }));
vi.mock("../../shared/tauri/dialog", () => ({ selectLocalDirectory: mocks.choose }));

import { LocalFilePanel, LOCAL_FILE_DROP_TYPE } from "./LocalFilePanel";

let previousLocale: Locale;

beforeEach(() => {
  previousLocale = getLocale();
  setLocalePreference("zh-CN");
  mocks.choose.mockResolvedValue("/workspace");
  mocks.list.mockResolvedValue([
    { kind: "directory", name: "src", path: "/workspace/src" },
    { kind: "file", name: "README.md", path: "/workspace/README.md" },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setLocalePreference(previousLocale);
});

describe("WF-09-01B LocalFilePanel", () => {
  it("loads a selected folder and exposes path-only drag payloads", async () => {
    render(<LocalFilePanel active />);
    fireEvent.click(screen.getByRole("button", { name: "选择文件夹" }));

    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith("/workspace"));
    expect(screen.getByRole("button", { name: /^src/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^README\.md/ })).toBeTruthy();

    const data = new Map<string, string>();
    fireEvent.dragStart(screen.getByRole("button", { name: /^README\.md/ }), {
      dataTransfer: {
        effectAllowed: "",
        setData: (type: string, value: string) => data.set(type, value),
      },
    });
    expect(JSON.parse(data.get(LOCAL_FILE_DROP_TYPE) || "{}")).toEqual({ paths: ["/workspace/README.md"] });
    expect(data.get("text/plain")).toBe("/workspace/README.md");
  });

  it("keeps the current listing when navigation fails", async () => {
    render(<LocalFilePanel active />);
    fireEvent.click(screen.getByRole("button", { name: "选择文件夹" }));
    await screen.findByRole("button", { name: /^README\.md/ });
    mocks.list.mockRejectedValueOnce(new Error("permission denied"));

    const pathInput = screen.getByRole("textbox", { name: "本地路径" });
    fireEvent.change(pathInput, { target: { value: "/private" } });
    fireEvent.submit(pathInput.closest("form")!);

    await waitFor(() => expect(screen.getByText("permission denied")).toBeTruthy());
    expect(screen.getByRole("button", { name: /^README\.md/ })).toBeTruthy();
  });
});
