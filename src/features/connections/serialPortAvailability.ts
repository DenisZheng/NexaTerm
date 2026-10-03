import type { SerialPortEntry } from "../terminal/characterSessionTypes";

export type SerialPortAvailabilityStatus = "loading" | "available" | "no_ports" | "list_failed";

export interface SerialPortAvailability {
  count: number;
  error: string | null;
  status: SerialPortAvailabilityStatus;
}

export function serialPortAvailability(input: {
  error: string | null;
  loading: boolean;
  ports: readonly SerialPortEntry[];
}): SerialPortAvailability {
  if (input.loading) {
    return { count: input.ports.length, error: null, status: "loading" };
  }
  if (input.error) {
    return { count: input.ports.length, error: input.error, status: "list_failed" };
  }
  if (input.ports.length === 0) {
    return { count: 0, error: null, status: "no_ports" };
  }
  return { count: input.ports.length, error: null, status: "available" };
}
