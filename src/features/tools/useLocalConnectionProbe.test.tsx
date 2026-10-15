// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLocalConnectionProbe } from "./useLocalConnectionProbe";
import { localProbeCancel, localProbeReserve, localProbeRun } from "../../shared/tauri/commands";
vi.mock("../../shared/tauri/commands", () => ({ localProbeReserve: vi.fn(), localProbeRun: vi.fn(), localProbeCancel: vi.fn() }));
const request = { kind: "tcp" as const, host: "example.invalid", port: 22 };
const response = { kind: "tcp" as const, status: "success" as const, reason: "connected" as const,
  duration_ms: 1, address_count: 1, addresses_truncated: false };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(localProbeReserve).mockResolvedValue("lease-a"); vi.mocked(localProbeCancel).mockResolvedValue(); });
afterEach(cleanup);
it("pins request across reserve and rejects repeated starts while busy", async () => {
  const reserve = deferred<string>(); vi.mocked(localProbeReserve).mockReturnValue(reserve.promise);
  vi.mocked(localProbeRun).mockResolvedValue(response);
  const f = renderHook(() => useLocalConnectionProbe(true)); const input = { ...request };
  let work!: Promise<void>;
  act(() => { work = f.result.current.run(input); void f.result.current.run(request); });
  input.host = "changed.invalid";
  expect(localProbeReserve).toHaveBeenCalledTimes(1);
  await act(async () => { reserve.resolve("lease-a"); await work; });
  expect(localProbeRun).toHaveBeenCalledWith("lease-a", request);
  expect(f.result.current.result).toEqual(response); expect(f.result.current.busy).toBe(false);
});
it("cancels before reserve response without ever starting a probe", async () => {
  const reserve = deferred<string>(); vi.mocked(localProbeReserve).mockReturnValue(reserve.promise);
  const f = renderHook(() => useLocalConnectionProbe(true)); let work!: Promise<void>;
  act(() => { work = f.result.current.run(request); });
  await act(async () => { await f.result.current.cancel(); reserve.resolve("lease-a"); await work; });
  expect(localProbeCancel).toHaveBeenCalledWith("lease-a"); expect(localProbeRun).not.toHaveBeenCalled();
  expect(f.result.current.phase).toBe("cancelled");
});
it("unmount releases a late reservation and starts no IO", async () => {
  const reserve = deferred<string>(); vi.mocked(localProbeReserve).mockReturnValue(reserve.promise);
  const f = renderHook(() => useLocalConnectionProbe(true)); let work!: Promise<void>;
  act(() => { work = f.result.current.run(request); }); f.unmount();
  await act(async () => { reserve.resolve("lease-a"); await work; });
  expect(localProbeCancel).toHaveBeenCalledWith("lease-a"); expect(localProbeRun).not.toHaveBeenCalled();
});
it("ignores an old result after cancel and retry", async () => {
  const first = deferred<typeof response>(); vi.mocked(localProbeRun).mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...response, duration_ms: 9 });
  const f = renderHook(() => useLocalConnectionProbe(true)); let work!: Promise<void>;
  await act(async () => { work = f.result.current.run(request); await Promise.resolve(); });
  await act(async () => { await f.result.current.cancel(); });
  await act(async () => { await f.result.current.run(request); });
  await act(async () => { first.resolve(response); await work; });
  expect(f.result.current.result?.duration_ms).toBe(9);
});
it("failed cancellation remains visible and can be retried", async () => {
  const pending = deferred<typeof response>(); vi.mocked(localProbeRun).mockReturnValue(pending.promise);
  vi.mocked(localProbeCancel).mockRejectedValueOnce(new Error("private detail"));
  const f = renderHook(() => useLocalConnectionProbe(true));
  await act(async () => { void f.result.current.run(request); await Promise.resolve(); });
  await act(async () => { await f.result.current.cancel(); });
  expect(f.result.current.error).toBe("cancel"); expect(f.result.current.busy).toBe(true);
  await act(async () => { await f.result.current.cancel(); });
  expect(f.result.current.phase).toBe("cancelled"); expect(localProbeCancel).toHaveBeenCalledTimes(2);
  await act(async () => { pending.resolve(response); });
});
it("inactive panel cancels current operation and ignores its late result", async () => {
  const pending = deferred<typeof response>(); vi.mocked(localProbeRun).mockReturnValue(pending.promise);
  const f = renderHook(({active}) => useLocalConnectionProbe(active), {initialProps:{active:true}});
  await act(async () => { void f.result.current.run(request); await Promise.resolve(); });
  f.rerender({active:false});
  await act(async () => { pending.resolve(response); });
  expect(localProbeCancel).toHaveBeenCalledWith("lease-a"); expect(f.result.current.result).toBeNull();
  await act(async () => { await f.result.current.run(request); }); expect(localProbeReserve).toHaveBeenCalledTimes(1);
});
it("request failure exposes only a fixed error and allows retry", async () => {
  vi.mocked(localProbeReserve).mockRejectedValueOnce(new Error("secret@example.invalid"));
  vi.mocked(localProbeRun).mockResolvedValue(response);
  const f = renderHook(() => useLocalConnectionProbe(true));
  await act(async () => { await f.result.current.run(request); }); expect(f.result.current.error).toBe("request");
  await act(async () => { await f.result.current.run(request); }); expect(f.result.current.result).toEqual(response);
});
