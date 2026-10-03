import type { MultiExecTarget } from "./targets";

export type MultiExecSendDeliveryStatus = "written" | "failed" | "disconnected";

export interface MultiExecSendDelivery {
  error: unknown | null;
  key: string;
  status: MultiExecSendDeliveryStatus;
}

export async function writeMultiExecCommand(input: {
  data: string;
  targetKeys: readonly string[];
  resolveTarget(key: string): MultiExecTarget | null;
  write(sessionId: string, data: string): Promise<void>;
}): Promise<MultiExecSendDelivery[]> {
  const deliveries: MultiExecSendDelivery[] = [];

  for (const key of input.targetKeys) {
    const target = input.resolveTarget(key);
    if (!target) {
      deliveries.push({ error: null, key, status: "disconnected" });
      continue;
    }

    try {
      await input.write(target.sessionId, input.data);
      deliveries.push({ error: null, key, status: "written" });
    } catch (error) {
      deliveries.push({ error, key, status: "failed" });
    }
  }

  return deliveries;
}
