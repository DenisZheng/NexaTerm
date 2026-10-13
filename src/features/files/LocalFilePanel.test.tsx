// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocale, setLocalePreference, type Locale } from "../../shared/i18n";

const mocks = vi.hoisted(() => ({ list: vi.fn(), choose: vi.fn() }));
vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));
vi.mock("../../shared/tauri/commands", () => ({ localFileList: mocks.list }));
vi.mock("../../shared/tauri/dialog", () => ({ selectLocalDirectory: mocks.choose }));

import { LocalFilePanel, LOCAL_FILE_DROP_TYPE } from "./LocalFilePanel";
import { REMOTE_FILE_DROP_TYPE } from "./remoteFileDrop";

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

  it("shows the first folder selection error instead of a silent empty hint", async () => {
    mocks.list.mockRejectedValueOnce(new Error("permission denied"));
    render(<LocalFilePanel active />);
    fireEvent.click(screen.getByRole("button", { name: "选择文件夹" }));
    expect((await screen.findByRole("alert")).textContent).toContain("permission denied");
  });

  it("ignores an older directory response after a newer selection", async () => {
    let resolveOld!: (value: unknown[]) => void;
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    render(<LocalFilePanel active />);
    fireEvent.click(screen.getByRole("button", { name: "选择文件夹" }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    mocks.choose.mockResolvedValueOnce("/new");
    mocks.list.mockResolvedValueOnce([{ name: "new.txt", path: "/new/new.txt", kind: "file" }]);
    fireEvent.click(screen.getByRole("button", { name: "选择文件夹" }));
    await screen.findByRole("button", { name: /^new.txt/ });
    await act(async () => resolveOld([{ name: "old.txt", path: "/workspace/old.txt", kind: "file" }]));
    expect(screen.queryByRole("button", { name: /^old.txt/ })).toBeNull();
    expect((screen.getByRole("textbox", { name: "本地路径" }) as HTMLInputElement).value).toBe("/new");
  });

  it("ignores a folder picker completed after the panel is hidden", async () => {
    let resolvePicker!: (value: string) => void;
    mocks.choose.mockImplementationOnce(() => new Promise((resolve) => { resolvePicker = resolve; }));
    const view = render(<LocalFilePanel active />);
    fireEvent.click(screen.getByRole("button", { name: "选择文件夹" }));
    view.rerender(<LocalFilePanel active={false} />);
    await act(async () => resolvePicker("/late"));
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("downloads a remote drag to the local directory with the original owner", async () => {
    const onDownload = vi.fn();
    render(<LocalFilePanel active onDownload={onDownload} />);
    fireEvent.click(screen.getByRole("button", { name: "选择文件夹" }));
    const folder = await screen.findByRole("button", { name: /^src/ });
    const source = { connectionId: "same", ownerInstanceId: "ssh:a", entry: { path: "/etc/app.conf", name: "app.conf", type: "file" } };
    fireEvent.drop(folder, { dataTransfer: { getData: (type: string) => type === REMOTE_FILE_DROP_TYPE ? JSON.stringify(source) : "" } });
    expect(onDownload).toHaveBeenCalledExactlyOnceWith(source, "/workspace/src");
    fireEvent.drop(folder, { dataTransfer: { getData: () => "invalid" } });
    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});
