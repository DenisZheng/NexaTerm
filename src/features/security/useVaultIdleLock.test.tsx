// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVaultIdleLock } from "./useVaultIdleLock";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
it("resets only for real input before the deadline and locks once", () => {
  const lock = vi.fn().mockResolvedValue(null);
  renderHook(() => useVaultIdleLock({ enabled: true, minutes: 5, onLock: lock }));
  tick(4 * 60000); fireEvent.pointerDown(window); tick(4 * 60000);
  expect(lock).not.toHaveBeenCalled(); tick(60000);
  expect(lock).toHaveBeenCalledOnce(); fireEvent.keyDown(window); fireEvent.wheel(window); tick(60000);
  expect(lock).toHaveBeenCalledOnce();
});
it.each(["focus", "visibilitychange"])("checks suspended-page deadline on %s without extending idle time", (event) => {
  const lock = vi.fn().mockResolvedValue(null);
  renderHook(() => useVaultIdleLock({ enabled: true, minutes: 5, onLock: lock }));
  tick(4 * 60000); fireEvent(event === "focus" ? window : document, new Event(event)); tick(60000);
  expect(lock).toHaveBeenCalledOnce();
});
it("uses elapsed idle time when timeout changes and clears all timer/listener work on unmount", () => {
  const lock = vi.fn().mockResolvedValue(null);
  const h = renderHook(({ minutes }) => useVaultIdleLock({ enabled: true, minutes, onLock: lock }), { initialProps: { minutes: 15 } });
  tick(6 * 60000); h.rerender({ minutes: 5 }); tick(0); expect(lock).toHaveBeenCalledOnce();
  h.unmount(); expect(vi.getTimerCount()).toBe(0);
  fireEvent.pointerDown(window); fireEvent(window, new Event("focus")); tick(60000);
  expect(lock).toHaveBeenCalledOnce();
});
it("disabled auto-lock has no timers and a new unlocked cycle gets a fresh deadline", () => {
  const lock = vi.fn().mockResolvedValue(null);
  const h = renderHook(({ enabled }) => useVaultIdleLock({ enabled, minutes: 5, onLock: lock }), { initialProps: { enabled: false } });
  expect(vi.getTimerCount()).toBe(0); tick(10 * 60000); h.rerender({ enabled: true }); tick(4 * 60000);
  h.rerender({ enabled: false }); tick(10 * 60000); h.rerender({ enabled: true }); tick(4 * 60000);
  expect(lock).not.toHaveBeenCalled(); tick(60000); expect(lock).toHaveBeenCalledOnce();
});
