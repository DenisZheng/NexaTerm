// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTerminalSearchDecorations, observeTerminalSearchPalette } from "./terminalSearchPalette";

afterEach(() => { document.body.innerHTML = ""; document.body.removeAttribute("data-theme-mode"); vi.unstubAllGlobals(); });

describe("terminal search token palette", () => {
  it("reads the terminal's inherited token scope and produces valid xterm hex colors", () => {
    const host = document.createElement("div"); document.body.append(host);
    host.style.setProperty("--mx-primary", "#73b7ff");
    host.style.setProperty("--mx-panel", "#171b21");
    host.style.setProperty("--mx-text", "#e6e9ee");
    const dark = getTerminalSearchDecorations(host);
    expect(dark.activeMatchColorOverviewRuler).toBe("#73b7ff");
    Object.values(dark).forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
    host.style.setProperty("--mx-primary", "#2374c6"); host.style.setProperty("--mx-panel", "#fff");
    const light = getTerminalSearchDecorations(host);
    expect(light.activeMatchColorOverviewRuler).toBe("#2374c6");
    expect(light.matchBackground).not.toBe(dark.matchBackground);
  });

  it("resolves token aliases, RGB colors and cycles without leaking invalid decoration colors", () => {
    const host = document.createElement("div"); document.body.append(host);
    host.style.setProperty("--mx-primary", "var(--fixture-accent)"); host.style.setProperty("--fixture-accent", "rgb(90, 40, 140)");
    host.style.setProperty("--mx-panel", "var(--fixture-loop)"); host.style.setProperty("--fixture-loop", "var(--mx-panel)");
    const palette = getTerminalSearchDecorations(host);
    expect(palette.matchOverviewRuler).toBe("#5a288c");
    Object.values(palette).forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
  });

  it("refreshes on global/system theme changes and removes both subscriptions on dispose", async () => {
    const listeners = new Set<() => void>();
    const media = { addEventListener: vi.fn((_: string, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_: string, listener: () => void) => listeners.delete(listener)) };
    vi.stubGlobal("matchMedia", () => media);
    const host = document.createElement("div"); document.body.append(host);
    const refresh = vi.fn(); const dispose = observeTerminalSearchPalette(host, refresh);
    document.body.setAttribute("data-theme-mode", "dark");
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    listeners.forEach((listener) => listener()); expect(refresh).toHaveBeenCalledTimes(2);
    dispose(); document.body.setAttribute("data-theme-mode", "light"); await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(2); expect(listeners.size).toBe(0);
  });
});
