import { describe, expect, it, vi } from "vitest";
import { XdmcpWorkspaceSessions } from "./xdmcpWorkspaceSessions";
import { XdmcpSessionOwner } from "../xdmcp/XdmcpSessionOwner";
import { apiFixture, deferred } from "../xdmcp/testFixtures";

describe("lazy XDMCP workspace registry", () => {
  it("retains a failed close and only forgets after actual cleanup", async () => {
    const owner = new XdmcpSessionOwner(apiFixture());
    vi.spyOn(owner, "close").mockRejectedValueOnce(new Error("xdmcp_cleanup_failed")).mockResolvedValueOnce();
    const sessions = new XdmcpWorkspaceSessions(async () => ({ createXdmcpSession: () => owner })); sessions.open("tab");
    expect(() => sessions.forget("tab")).toThrow("cleanup_failed"); await expect(sessions.close("tab")).rejects.toThrow("cleanup_failed");
    expect(await sessions.get("tab")).toBe(owner); await sessions.close("tab"); sessions.forget("tab"); await expect(sessions.get("tab")).rejects.toThrow("expired");
  });
  it("closes late loaded owners and does not erase new slots after StrictMode reactivation", async () => {
    const old = new XdmcpSessionOwner(apiFixture()), fresh = new XdmcpSessionOwner(apiFixture()), loading = deferred<{ createXdmcpSession: () => XdmcpSessionOwner }>();
    const load = vi.fn().mockReturnValueOnce(loading.promise).mockResolvedValueOnce({ createXdmcpSession: () => fresh });
    const sessions = new XdmcpWorkspaceSessions(load); sessions.open("old"); const close = sessions.dispose();
    expect(() => sessions.open("blocked")).toThrow("unavailable"); sessions.activate(); sessions.open("new");
    loading.resolve({ createXdmcpSession: () => old }); await close;
    expect(old.getSnapshot().phase).toBe("closed"); expect(await sessions.get("new")).toBe(fresh); await sessions.dispose();
  });
  it("allows an empty failed module tab to close", async () => {
    const sessions = new XdmcpWorkspaceSessions(async () => { throw new Error("module failed"); }); sessions.open("tab");
    await expect(sessions.get("tab")).rejects.toThrow("module failed"); await sessions.close("tab"); sessions.forget("tab");
  });
});
