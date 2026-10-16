// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocalConnectionDiagnostics } from "./LocalConnectionDiagnostics";
import { setLocalePreference } from "../../shared/i18n";
import { localProbeReserve, localProbeRun } from "../../shared/tauri/commands";
vi.mock("../../shared/tauri/commands", () => ({localProbeReserve:vi.fn(),localProbeRun:vi.fn(),localProbeCancel:vi.fn().mockResolvedValue(undefined)}));
afterEach(() => { cleanup(); vi.resetAllMocks(); delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__; });
it("preview reports desktop requirement without synthetic success", () => {
  setLocalePreference("en"); render(<LocalConnectionDiagnostics active initialHost="example.invalid"/>);
  expect(screen.getByText("Available in the desktop app.")).toBeTruthy();
  expect((screen.getByText("Run probe") as HTMLButtonElement).disabled).toBe(true);
  expect(localProbeReserve).not.toHaveBeenCalled();
});
it("runs only on explicit action and renders actionable result", async () => {
  Object.assign(window,{__TAURI_INTERNALS__:{}}); setLocalePreference("en");
  vi.mocked(localProbeReserve).mockResolvedValue("lease-a");
  vi.mocked(localProbeRun).mockResolvedValue({kind:"tcp",status:"failed",reason:"connection_refused",duration_ms:4,address_count:1,addresses_truncated:false});
  render(<LocalConnectionDiagnostics active initialHost="example.invalid"/>);
  expect(localProbeReserve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Run probe"));
  await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("Check the service and listening port"));
  expect(localProbeRun).toHaveBeenCalledWith("lease-a",{kind:"tcp",host:"example.invalid",port:22});
});
it("local port uses fixed loopback, rejects zero and pins result scope", async () => {
  Object.assign(window,{__TAURI_INTERNALS__:{}}); setLocalePreference("en");
  vi.mocked(localProbeReserve).mockResolvedValue("lease-port");
  vi.mocked(localProbeRun).mockResolvedValue({kind:"local_port",status:"success",reason:"port_available",duration_ms:1,address_count:0,addresses_truncated:false});
  render(<LocalConnectionDiagnostics active initialHost="remote.invalid"/>);
  fireEvent.click(screen.getByRole("button",{name:"Probe type"}));
  fireEvent.click(screen.getByRole("option",{name:"Local port availability"}));
  expect(screen.queryByLabelText("Hostname or IP address")).toBeNull();
  fireEvent.change(screen.getByLabelText("TCP port"),{target:{value:"0"}});
  expect((screen.getByText("Run probe") as HTMLButtonElement).disabled).toBe(true);
  expect(localProbeReserve).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("TCP port"),{target:{value:"8080"}});
  fireEvent.click(screen.getByText("Run probe"));
  await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("It is not reserved"));
  expect(localProbeRun).toHaveBeenCalledWith("lease-port",{kind:"local_port",host:"127.0.0.1",port:8080});
  fireEvent.click(screen.getByRole("button",{name:"Probe type"}));
  fireEvent.click(screen.getByRole("option",{name:"TCP connection"}));
  expect((screen.getByLabelText("Hostname or IP address") as HTMLInputElement).value).toBe("remote.invalid");
  expect(screen.getByRole("status").textContent).toContain("IPv4 loopback bind check");
});
