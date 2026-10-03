import { describe, expect, it, vi } from "vitest";

import type { MultiExecTarget } from "./targets";
import { writeMultiExecLiveInput } from "./live";

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

describe("writeMultiExecLiveInput", () => {
  it("excludes the focused source and writes every other selected target exactly once", async () => {
    const write = vi.fn(async () => undefined);
    const deliveries = await writeMultiExecLiveInput({
      data: "x",
      selectedKeys: new Set(["ssh:a", "ssh:b"]),
      sourceKey: "ssh:a",
      targets: [target("ssh:a", "sa"), target("ssh:b", "sb"), target("ssh:c", "sc")],
      write,
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("sb", "x");
    expect(deliveries).toEqual([{ error: null, key: "ssh:b", status: "written" }]);
  });

  it("allows an unselected focused source to fan out to fixed targets", async () => {
    const write = vi.fn(async () => undefined);
    await writeMultiExecLiveInput({
      data: "hello",
      selectedKeys: new Set(["ssh:a", "ssh:b"]),
      sourceKey: "ssh:c",
      targets: [target("ssh:a", "sa"), target("ssh:b", "sb"), target("ssh:c", "sc")],
      write,
    });

    expect(write.mock.calls).toEqual([
      ["sa", "hello"],
      ["sb", "hello"],
    ]);
  });

  it("reports partial failure without retrying or replaying successful targets", async () => {
    const write = vi.fn(async (sessionId: string) => {
      if (sessionId === "sb") throw new Error("disconnected");
    });
    const deliveries = await writeMultiExecLiveInput({
      data: "z",
      selectedKeys: new Set(["ssh:a", "ssh:b"]),
      sourceKey: "ssh:c",
      targets: [target("ssh:a", "sa"), target("ssh:b", "sb"), target("ssh:c", "sc")],
      write,
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(deliveries.map((item) => [item.key, item.status])).toEqual([
      ["ssh:a", "written"],
      ["ssh:b", "failed"],
    ]);
  });
});
