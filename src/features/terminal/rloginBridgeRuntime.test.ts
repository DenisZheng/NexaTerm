import { afterEach, expect, it, vi } from "vitest";
const api=vi.hoisted(() => ({rloginRead:vi.fn(),rloginWrite:vi.fn(),rloginResize:vi.fn(),rloginClose:vi.fn().mockResolvedValue(undefined)}));
vi.mock("../../shared/tauri/commands",() => api);
import { createRloginBridge } from "./rloginBridgeRuntime";
afterEach(() => vi.unstubAllGlobals());
it("rejects a non-desktop runtime before ownership or IPC", () => {
  expect(() => createRloginBridge("10000000-0000-4000-8000-000000000001")).toThrow("rlogin_bridge_runtime_unavailable");
  expect(api.rloginRead).not.toHaveBeenCalled(); expect(api.rloginClose).not.toHaveBeenCalled();
});
it("binds the actual typed commands to one immutable generation without starting an implicit loop", async () => {
  vi.stubGlobal("window",{__TAURI_INTERNALS__:{}});
  const id="10000000-0000-4000-8000-000000000001"; const bridge=createRloginBridge(id);
  expect(api.rloginRead).not.toHaveBeenCalled(); await bridge.close(); expect(api.rloginClose).toHaveBeenCalledWith(id);
});
