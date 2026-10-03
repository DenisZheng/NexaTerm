import { describe, expect, it, vi } from "vitest";

import { writeMultiExecCommand } from "./send";
import type { MultiExecTarget } from "./targets";

function target(key: string, sessionId: string): MultiExecTarget {
  const [kind, tabId] = key.split(":");
  return {
    binding: { kind: kind === "ssh" ? "ssh" : "local", tabId },
    key,
    kind: kind === "ssh" ? "ssh" : "local",
    ownerId: "owner",
    sessionId,
    tabId,
    title: key,
  };
}

describe("writeMultiExecCommand", () => {
  it("writes selected targets sequentially exactly once", async () => {
    const targets = new Map([
      ["ssh:a", target("ssh:a", "sa")],
      ["ssh:b", target("ssh:b", "sb")],
    ]);
    const write = vi.fn(async () => undefined);

    const deliveries = await writeMultiExecCommand({
      data: "uname -a\r",
      targetKeys: ["ssh:a", "ssh:b"],
      resolveTarget: (key) => targets.get(key) || null,
      write,
    });

    expect(write.mock.calls).toEqual([
      ["sa", "uname -a\r"],
      ["sb", "uname -a\r"],
    ]);
    expect(deliveries.map((delivery) => [delivery.key, delivery.status])).toEqual([
      ["ssh:a", "written"],
      ["ssh:b", "written"],
    ]);
  });

  it("reports a missing runtime target as disconnected without writing it", async () => {
    const write = vi.fn(async () => undefined);

    const deliveries = await writeMultiExecCommand({
      data: "pwd\r",
      targetKeys: ["ssh:gone"],
      resolveTarget: () => null,
      write,
    });

    expect(write).not.toHaveBeenCalled();
    expect(deliveries).toEqual([
      { error: null, key: "ssh:gone", status: "disconnected" },
    ]);
  });

  it("continues after a failed write without retrying any target", async () => {
    const targets = new Map([
      ["ssh:a", target("ssh:a", "sa")],
      ["ssh:b", target("ssh:b", "sb")],
      ["ssh:c", target("ssh:c", "sc")],
    ]);
    const write = vi.fn(async (sessionId: string) => {
      if (sessionId === "sb") throw new Error("write failed");
    });

    const deliveries = await writeMultiExecCommand({
      data: "echo ok\r",
      targetKeys: ["ssh:a", "ssh:b", "ssh:c"],
      resolveTarget: (key) => targets.get(key) || null,
      write,
    });

    expect(write.mock.calls).toEqual([
      ["sa", "echo ok\r"],
      ["sb", "echo ok\r"],
      ["sc", "echo ok\r"],
    ]);
    expect(deliveries.map((delivery) => [delivery.key, delivery.status])).toEqual([
      ["ssh:a", "written"],
      ["ssh:b", "failed"],
      ["ssh:c", "written"],
    ]);
  });
});
