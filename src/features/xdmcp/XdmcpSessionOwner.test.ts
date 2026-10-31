import { describe, expect, it, vi } from "vitest";
import { XdmcpSessionOwner } from "./XdmcpSessionOwner";
import { XdmcpError, type XdmcpStatus } from "./xdmcpTypes";
import { apiFixture, deferred, id, request, status } from "./testFixtures";

describe("private XDMCP session ownership", () => {
  it("requires both permissions and available capability before reserving", async () => {
    const api = apiFixture(), owner = new XdmcpSessionOwner(api);
    for (const key of ["allow_external", "allow_network"]) await expect(owner.connect({ ...request, [key]: false })).rejects.toThrow("consent_required");
    expect(api.capabilities).not.toHaveBeenCalled();
    api.capabilities.mockResolvedValue({ bundled: false, external: false, desktop_verified: false, reason: "engine_selection_required" });
    await expect(owner.connect(request)).rejects.toThrow("unavailable"); expect(api.reserve).not.toHaveBeenCalled();
  });
  it("freezes request and publishes stable private-data-free snapshots without claiming login", async () => {
    const api = apiFixture(), pause = deferred<void>(), owner = new XdmcpSessionOwner(api, () => pause.promise), draft = { ...request };
    const before = owner.getSnapshot(); expect(owner.getSnapshot()).toBe(before);
    const listener = vi.fn(), unsubscribe = owner.subscribe(listener), work = owner.connect(draft);
    draft.target = "203.0.113.1";
    await vi.waitFor(() => expect(owner.getSnapshot().phase).toBe("querying"));
    expect(api.start).toHaveBeenCalledWith(id, request); expect(owner.getSnapshot()).toBe(owner.getSnapshot());
    for (const value of [id, request.target, request.local_address, request.executable, "allow_"]) expect(JSON.stringify(owner.getSnapshot())).not.toContain(value);
    pause.resolve(); await work; expect(owner.getSnapshot().phase).toBe("closed"); expect(api.stop).not.toHaveBeenCalled();
    unsubscribe(); listener.mockClear(); await owner.close(); expect(listener).not.toHaveBeenCalled();
  });
  it("closes a late reservation without starting it", async () => {
    const api = apiFixture(), reserve = deferred<string>(), owner = new XdmcpSessionOwner(api);
    api.reserve.mockReturnValue(reserve.promise); const work = owner.connect(request);
    await vi.waitFor(() => expect(api.reserve).toHaveBeenCalled()); const close = owner.close(); reserve.resolve(id);
    await Promise.all([work, close]); expect(api.start).not.toHaveBeenCalled(); expect(api.stop).toHaveBeenCalledExactlyOnceWith(id);
    await expect(owner.connect(request)).rejects.toThrow("busy");
  });
  it.each(["start", "status"] as const)("stops before pending %s and ignores its late reply", async pending => {
    const api = apiFixture(), start = deferred<XdmcpStatus>(), poll = deferred<XdmcpStatus[]>(), owner = new XdmcpSessionOwner(api, async () => undefined);
    if (pending === "start") api.start.mockReturnValue(start.promise); else api.status.mockReturnValue(poll.promise);
    const work = owner.connect(request); await vi.waitFor(() => expect(api[pending]).toHaveBeenCalled());
    const cancel = owner.cancel(); await vi.waitFor(() => expect(api.stop).toHaveBeenCalledExactlyOnceWith(id));
    start.resolve(status()); poll.resolve([status()]); await Promise.all([work, cancel]);
    expect(owner.getSnapshot().phase).toBe("closed"); expect(api.stop).toHaveBeenCalledTimes(1);
  });
  it("retains failed cleanup and retries the same id before accepting any new attempt", async () => {
    const api = apiFixture(), pause = deferred<void>(), owner = new XdmcpSessionOwner(api, () => pause.promise);
    api.stop.mockRejectedValue(new XdmcpError("stop_pending")); const work = owner.connect(request).catch(error => error);
    await vi.waitFor(() => expect(owner.getSnapshot().phase).toBe("querying")); const cancel = owner.cancel(); pause.resolve();
    await expect(cancel).rejects.toThrow("cleanup_failed"); await work;
    expect(owner.getSnapshot().phase).toBe("cleanup_failed"); await expect(owner.connect(request)).rejects.toThrow("busy");
    api.stop.mockResolvedValue(undefined); await owner.cancel();
    expect(api.stop.mock.calls.every(([value]) => value === id)).toBe(true);
    const nextId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    api.reserve.mockResolvedValue(nextId); api.start.mockResolvedValue(status({ id: nextId, phase: "closed" }));
    await owner.connect(request); expect(owner.getSnapshot().generation).toBe(2); expect(api.start).toHaveBeenLastCalledWith(nextId, request);
  });
  it.each([{ rows: [] }, { rows: [status({ id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" })] }])("does not treat missing status as successful cleanup", async ({ rows }) => {
    const api = apiFixture(); api.status.mockResolvedValue(rows); const owner = new XdmcpSessionOwner(api, async () => undefined);
    await expect(owner.connect(request)).rejects.toThrow("expired"); expect(api.stop).toHaveBeenCalledExactlyOnceWith(id); expect(owner.getSnapshot().phase).toBe("failed");
  });
  it("deduplicates concurrent close and cancel", async () => {
    const api = apiFixture(), stop = deferred<void>(), start = deferred<XdmcpStatus>(), owner = new XdmcpSessionOwner(api);
    api.stop.mockReturnValue(stop.promise); api.start.mockReturnValue(start.promise); const work = owner.connect(request);
    await vi.waitFor(() => expect(api.start).toHaveBeenCalled()); const a = owner.cancel(), b = owner.close(); expect(a).toBe(b);
    start.resolve(status()); stop.resolve(); await Promise.all([a, work]); expect(api.stop).toHaveBeenCalledTimes(1);
  });
  it("cancels before a late capability response without allocating native resources", async () => {
    const api = apiFixture(), capability = deferred<Awaited<ReturnType<typeof api.capabilities>>>(), owner = new XdmcpSessionOwner(api);
    api.capabilities.mockReturnValue(capability.promise); const work = owner.connect(request), close = owner.close();
    capability.resolve({ bundled: false, external: true, desktop_verified: false, reason: "engine_selection_required" });
    await Promise.all([work, close]); expect(api.reserve).not.toHaveBeenCalled(); expect(api.stop).not.toHaveBeenCalled();
  });
  it("preserves natural failed status and its fixed reason without claiming active", async () => {
    const api = apiFixture(), owner = new XdmcpSessionOwner(api, async () => undefined);
    api.status.mockResolvedValue([status({ phase: "failed", reason: "start_failed" })]);
    await owner.connect(request); expect(owner.getSnapshot()).toMatchObject({ phase: "failed", reason: "start_failed" }); expect(api.stop).not.toHaveBeenCalled();
  });
  it("cleans the reserved id after a mismatched start reply, not the unrelated reply id", async () => {
    const api = apiFixture(), owner = new XdmcpSessionOwner(api);
    api.start.mockResolvedValue(status({ id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" }));
    await expect(owner.connect(request)).rejects.toThrow("invalid_response"); expect(api.stop).toHaveBeenCalledExactlyOnceWith(id);
  });
});
