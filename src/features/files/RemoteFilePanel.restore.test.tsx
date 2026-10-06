// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocale, setLocalePreference, type Locale } from "../../shared/i18n";
import { defaultAdvancedConfig, defaultJumpConfig, defaultProxyConfig, type ConnectionProfile } from "../connections/connectionTypes";
import { getWorkspaceRemoteFileNavigation, getWorkspaceRemoteFileRevision, seedWorkspaceRemoteFileDirectories, workspaceRemoteFileDirectories } from "../workspace/restore/remoteFileSnapshotBridge";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));
vi.mock("../../shared/tauri/commands", () => ({ remoteFileList: mocks.list, remoteFileMetadata: vi.fn() }));
import { RemoteFilesView } from "./RemoteFilePanel";

const connection: ConnectionProfile = {
  id: "fixture-ssh", name: "SSH", host: "example.invalid", port: 22, username: "fixture",
  credential_mode: "prompt", proxy: defaultProxyConfig, jump: defaultJumpConfig,
  advanced: defaultAdvancedConfig, is_favorite: false, created_at: "fixture", updated_at: "fixture",
};

let previousLocale: Locale;
beforeEach(() => { previousLocale = getLocale(); setLocalePreference("zh-CN"); });
afterEach(() => { cleanup(); vi.clearAllMocks(); setLocalePreference(previousLocale); });

describe("WF-07 Files 目录恢复", () => {
  it("只切换跟随开关也会发布实例状态并触发快照更新", async () => {
    mocks.list.mockResolvedValue([]);
    render(<RemoteFilesView active connection={connection} stateKey="ssh-file-panel:follow-toggle" />);
    const toggle = await screen.findByRole("button", { name: "跟随终端目录" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    const revision = getWorkspaceRemoteFileRevision();
    fireEvent.click(toggle);
    await waitFor(() => expect(getWorkspaceRemoteFileNavigation("ssh-file-panel:follow-toggle"))
      .toMatchObject({ followTerminalDirectory: true }));
    expect(getWorkspaceRemoteFileRevision()).toBeGreaterThan(revision);
  });

  it("冷启动按实例恢复跟随开关，旧快照继续默认关闭", async () => {
    mocks.list.mockResolvedValue([]);
    seedWorkspaceRemoteFileDirectories(
      { "ssh:cold-follow-on": "/", "ssh:cold-follow-off": "/", "ssh:cold-follow-legacy": "/" },
      { "ssh:cold-follow-on": true, "ssh:cold-follow-off": false },
    );
    for (const [id, expected] of [["cold-follow-on", "true"], ["cold-follow-off", "false"], ["cold-follow-legacy", "false"]]) {
      const view = render(<RemoteFilesView active connection={connection} stateKey={`ssh-file-panel:${id}`} />);
      const toggle = await screen.findByRole("button", { name: "跟随终端目录" });
      expect(toggle.getAttribute("aria-pressed")).toBe(expected);
      view.unmount();
    }
  });

  it("保存浏览目录而不是树根，并在冷启动后加载祖先目录", async () => {
    mocks.list.mockImplementation(async (_id: string, path: string) => {
      if (path === "/") return [{ name: "srv", path: "/srv", type: "directory" }];
      if (path === "/srv") return [{ name: "app", path: "/srv/app", type: "directory" }];
      return [{ name: "app.log", path: "/srv/app/app.log", type: "file" }];
    });
    const first = render(<RemoteFilesView active connection={connection} stateKey="ssh-file-panel:browse" />);
    const pathInput = await screen.findByRole("textbox", { name: "远程路径" });
    fireEvent.change(pathInput, { target: { value: "/srv/app" } });
    fireEvent.submit(pathInput.closest("form")!);
    await waitFor(() => expect(workspaceRemoteFileDirectories(["browse"])).toEqual({ "ssh:browse": "/srv/app" }));
    first.unmount();

    // 新 owner 没有进程内 panel cache，仅由已保存的快照目录恢复。
    seedWorkspaceRemoteFileDirectories({ "ssh:restarted": "/srv/app" });
    mocks.list.mockClear();
    render(<RemoteFilesView active connection={connection} stateKey="ssh-file-panel:restarted" />);
    await screen.findByRole("textbox", { name: "远程路径" });
    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(connection.id, "/srv/app"));
    expect(mocks.list).toHaveBeenCalledWith(connection.id, "/");
    expect(mocks.list).toHaveBeenCalledWith(connection.id, "/srv");
    expect((screen.getByRole("textbox", { name: "远程路径" }) as HTMLInputElement).value).toBe("/srv/app");
    expect(workspaceRemoteFileDirectories(["restarted"])).toEqual({ "ssh:restarted": "/srv/app" });
  });
});
