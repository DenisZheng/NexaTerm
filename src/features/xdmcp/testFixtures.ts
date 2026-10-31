import { vi } from "vitest";
import type { XdmcpRequest, XdmcpStatus } from "./xdmcpTypes";

export const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
export const request: XdmcpRequest = { executable: "C:\\private\\XWin.exe", target: "192.0.2.5", local_address: "192.0.2.6", allow_external: true, allow_network: true };
export const status = (change: Partial<XdmcpStatus> = {}): XdmcpStatus => ({ id, phase: "querying", display: 100, reason: null, ...change });
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export function apiFixture() {
  return {
    capabilities: vi.fn(async () => ({ bundled: false, external: true, desktop_verified: false, reason: "engine_selection_required" as const })),
    reserve: vi.fn(async () => id), start: vi.fn(async (_id: string, _request: XdmcpRequest) => status()),
    status: vi.fn(async () => [status({ phase: "closed", reason: "closed" })]), stop: vi.fn(async (_id: string): Promise<void> => undefined),
  };
}
