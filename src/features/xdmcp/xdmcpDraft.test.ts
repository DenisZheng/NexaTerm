import { describe, expect, it } from "vitest";
import { validateXdmcpDraft } from "./xdmcpDraft";
import { request } from "./testFixtures";
describe("XDMCP exact input validation", () => {
  it("accepts literal addresses and paths without changing them", () => {
    expect(validateXdmcpDraft(request)).toEqual({});
    expect(validateXdmcpDraft({ ...request, executable: "/opt/test/Xorg" })).toEqual({});
  });
  it.each([" 192.0.2.1", "192.0.2.1 ", "192.00.2.1", "localhost", "::1", "0.0.0.0", "224.0.0.1", "239.255.255.255", "255.255.255.255", "256.0.0.1", "192.0.2"])("rejects invalid target and local address %s", address => {
    expect(validateXdmcpDraft({ ...request, target: address, local_address: address })).toMatchObject({ target: "xdmcp.invalidTarget", local_address: "xdmcp.invalidLocal" });
  });
  it.each(["", "XWin.exe", "C:XWin.exe", "C:\\bad\0.exe", "/" + "x".repeat(4096)])("rejects invalid executable syntax %s", executable => {
    expect(validateXdmcpDraft({ ...request, executable }).executable).toBe("xdmcp.invalidEngine");
  });
});
