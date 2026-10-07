// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultSettings, normalizeSettings, resolveSettingsStyle, type MxtermSettings, type ThemeMode } from "./settingsTypes";
import { applyDocumentAppearance } from "./startupSettings";
import { getTerminalColorScheme } from "./terminalColorSchemes";
import { useDocumentAppearance } from "./useDocumentAppearance";
import { syncCurrentWindowTheme } from "../../shared/tauri/windowTheme";

const native = vi.hoisted(() => ({ setTheme: vi.fn(), available: true }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ setTheme: native.setTheme }) }));
vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => native.available }));
vi.mock("../../shared/tauri/webviewBackground", () => ({ syncCurrentWebviewBackground: vi.fn() }));
vi.mock("../../shared/tauri/platformCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../shared/tauri/platformCapabilities")>(),
  resolveDesktopPlatform: () => "macos",
}));

const settingsFor = (themeMode: ThemeMode) => normalizeSettings({ appearance: { themeMode } });
function Workspace({ settings }: { settings: MxtermSettings }) {
  useDocumentAppearance(settings, "auto");
  return <main className="app-shell" data-theme-mode={settings.appearance.themeMode}>
    {createPortal(<div role="dialog">Portal</div>, document.body)}
  </main>;
}

beforeEach(() => {
  native.available = true;
  native.setTheme.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("document and native appearance", () => {
  it.each([true, false])("系统暗色=%s，连续切换后 body、工作区与原生外观同步", async (systemDark) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: systemDark, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const view = render(<Workspace settings={settingsFor("system")} />);
    for (const mode of ["system", "light", "dark", "system"] as const) {
      view.rerender(<Workspace settings={settingsFor(mode)} />);
      expect(document.body.dataset.themeMode).toBe(mode);
      expect(document.querySelector(".app-shell")?.getAttribute("data-theme-mode")).toBe(mode);
      expect(screen.getByRole("dialog").parentElement).toBe(document.body);
      expect(document.body.style.getPropertyValue("--mx-terminal")).toBe(getTerminalColorScheme(defaultSettings.terminalTheme.scheme).theme.background);
      await waitFor(() => expect(native.setTheme).toHaveBeenLastCalledWith(mode === "system" ? null : mode));
    }
  });

  it("启动与运行时使用同一文档入口，保留终端独立颜色与材质、密度、强调色", () => {
    const settings = normalizeSettings({ appearance: { themeMode: "light", density: "compact", accentColor: "#123456" } });
    const terminalTheme = structuredClone(settings.terminalTheme);
    applyDocumentAppearance(settings);
    expect(document.body.dataset).toMatchObject({ themeMode: "light", windowMaterial: "auto", density: "compact", platform: "macos" });
    for (const [name, value] of Object.entries(resolveSettingsStyle(settings))) {
      expect(document.body.style.getPropertyValue(name)).toBe(value);
    }
    expect(settings.terminalTheme).toEqual(terminalTheme);
    expect(settings.terminalTheme).toEqual(defaultSettings.terminalTheme);
  });

  it("快速切换时串行设置，System 解除原生覆盖，不固定成当前系统颜色", async () => {
    let finishFirst!: () => void;
    native.setTheme.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    const first = syncCurrentWindowTheme("light");
    const last = syncCurrentWindowTheme("system");
    await act(async () => { await Promise.resolve(); });
    expect(native.setTheme.mock.calls).toEqual([["light"]]);
    finishFirst();
    await Promise.all([first, last]);
    expect(native.setTheme.mock.calls).toEqual([["light"], [null]]);
  });

  it("没有 Tauri 时只应用文档样式，不调用原生 API", async () => {
    native.available = false;
    expect(await syncCurrentWindowTheme("light")).toBe(false);
    expect(native.setTheme).not.toHaveBeenCalled();
  });

  it("原生命令失败不会伪称成功，后续主题切换仍可恢复", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    native.setTheme.mockRejectedValueOnce(new Error("permission denied"));
    expect(await syncCurrentWindowTheme("light")).toBe(false);
    expect(warning).toHaveBeenCalledOnce();
    expect(await syncCurrentWindowTheme("dark")).toBe(true);
  });
});
