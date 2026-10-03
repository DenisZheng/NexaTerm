import { describe, expect, it } from "vitest";

import { serialPortAvailability } from "./serialPortAvailability";

const port = { description: "USB Serial", port_name: "COM3", port_type: "usb" };

describe("WF-05B Serial port availability", () => {
  it("prioritizes loading while a refresh is in flight", () => {
    expect(serialPortAvailability({ error: "old error", loading: true, ports: [port] })).toEqual({
      count: 1,
      error: null,
      status: "loading",
    });
  });

  it("distinguishes list failure from a successful empty result", () => {
    expect(serialPortAvailability({ error: "enumeration failed", loading: false, ports: [] })).toEqual({
      count: 0,
      error: "enumeration failed",
      status: "list_failed",
    });
    expect(serialPortAvailability({ error: null, loading: false, ports: [] })).toEqual({
      count: 0,
      error: null,
      status: "no_ports",
    });
  });

  it("reports an available port count after successful enumeration", () => {
    expect(serialPortAvailability({ error: null, loading: false, ports: [port] })).toEqual({
      count: 1,
      error: null,
      status: "available",
    });
  });
});
