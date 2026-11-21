import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { xdmcpApi } from "./xdmcpCommands";
import { id, request, status } from "../../features/xdmcp/testFixtures";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => vi.mocked(invoke).mockReset());
describe("XDMCP typed commands", () => {
  it("sends exact commands and strips extra request fields", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(id).mockResolvedValueOnce(status()).mockResolvedValueOnce([status()]).mockResolvedValueOnce(null);
    expect(await xdmcpApi.reserve()).toBe(id);
    await xdmcpApi.start(id, { ...request, extra: "not sent" } as typeof request);
    await xdmcpApi.status(); await xdmcpApi.stop(id);
    expect(vi.mocked(invoke).mock.calls).toEqual([
      ["xdmcp_reserve", undefined], ["xdmcp_start", { reservationId: id, request }], ["xdmcp_status", undefined], ["xdmcp_stop", { reservationId: id }],
    ]);
  });
  it("rejects malformed replies and hides backend error details", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({}).mockResolvedValueOnce(undefined).mockRejectedValueOnce({ code: "xdmcp_engine_unavailable", message: request.executable });
    await expect(xdmcpApi.capabilities()).rejects.toThrow("invalid_response");
    await expect(xdmcpApi.stop(id)).rejects.toThrow("invalid_response");
    await expect(xdmcpApi.start(id, request)).rejects.toThrow(/^xdmcp_engine_unavailable$/);
  });
});
