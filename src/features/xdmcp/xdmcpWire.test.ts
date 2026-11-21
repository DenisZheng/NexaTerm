import { describe, expect, it } from "vitest";
import { parseXdmcpCapability, parseXdmcpId, parseXdmcpStatus, parseXdmcpStatuses, xdmcpFailure } from "./xdmcpWire";
import { id, status } from "./testFixtures";

describe("XDMCP wire projection", () => {
  it("accepts only canonical ids and bounded dense unique status lists", () => {
    expect(parseXdmcpId(id)).toBe(id);
    for (const invalid of [id.toUpperCase(), "123", null]) expect(() => parseXdmcpId(invalid)).toThrow("invalid_response");
    expect(parseXdmcpStatus({ ...status(), path: "private" })).toEqual(status());
    for (const invalid of [{ ...status(), phase: ["querying"] }, { ...status(), display: 99 }, { ...status(), display: "100" }, { ...status(), reason: "private failure" }, {}]) {
      expect(() => parseXdmcpStatus(invalid)).toThrow("invalid_response");
    }
    for (const invalid of [Array(1), Array(21).fill(status()), [status(), status()], null]) expect(() => parseXdmcpStatuses(invalid)).toThrow("invalid_response");
  });
  it("rejects malformed capability and never surfaces raw diagnostics", () => {
    const capability = { bundled: false, external: true, desktop_verified: false, reason: "engine_selection_required" };
    expect(parseXdmcpCapability({ ...capability, private: "hidden" })).toEqual(capability);
    expect(() => parseXdmcpCapability({ ...capability, external: "true" })).toThrow("invalid_response");
    expect(xdmcpFailure({ code: "xdmcp_stop_pending", message: "private" })).toBe("stop_pending");
    expect(xdmcpFailure(new Error("C:\\private"))).toBe("unavailable");
  });
});
