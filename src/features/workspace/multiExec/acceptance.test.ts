import { describe, expect, it, vi } from "vitest";

import { writeMultiExecLiveInput } from "./live";
import { initialMultiExecState, multiExecReducer } from "./reducer";
import { writeMultiExecCommand } from "./send";
import {
  buildMultiExecTargets,
  multiExecAvailableKeys,
  type MultiExecTarget,
} from "./targets";

function byKey(targets: readonly MultiExecTarget[]) {
  return new Map(targets.map((target) => [target.key, target]));
}

describe("WF-04C A09/A10 acceptance boundary", () => {
  it("A09: fixed two-instance targets receive live/send once while unselected instances stay out", async () => {
    const runtimeTargets = buildMultiExecTargets({
      sshTabs: [
        {
          connectionId: "profile-a",
          id: "a-1",
          sessionId: "sa1",
          title: "A · 1",
          type: "terminal",
        },
        {
          connectionId: "profile-a",
          id: "a-2",
          sessionId: "sa2",
          title: "A · 2",
          type: "terminal",
        },
        {
          connectionId: "profile-b",
          id: "b-1",
          sessionId: "sb1",
          title: "B · 1",
          type: "terminal",
        },
        {
          connectionId: "profile-c",
          id: "c-1",
          sessionId: "sc1",
          title: "C · 1",
          type: "terminal",
        },
      ],
      localTabs: [],
    });

    let state = multiExecReducer(initialMultiExecState, {
      type: "multiExec/setTargets",
      targets: new Set(["ssh:a-1", "ssh:a-2"]),
    });
    state = multiExecReducer(state, { type: "multiExec/setMode", mode: "live" });

    const afterFocusChange = multiExecReducer(state, {
      type: "multiExec/targetsAvailable",
      availableKeys: multiExecAvailableKeys(runtimeTargets),
      focusedKey: "ssh:b-1",
      splitActive: true,
    });
    expect(afterFocusChange.targets).toEqual(new Set(["ssh:a-1", "ssh:a-2"]));

    const liveWriteFromA1 = vi.fn(async () => undefined);
    await writeMultiExecLiveInput({
      data: "live-a1",
      selectedKeys: afterFocusChange.targets,
      sourceKey: "ssh:a-1",
      targets: runtimeTargets,
      write: liveWriteFromA1,
    });
    // a-1 receives its own keyboard input through the normal terminal path;
    // MultiExec fans out exactly once to the other selected target only.
    expect(liveWriteFromA1.mock.calls).toEqual([["sa2", "live-a1"]]);

    const liveWriteFromA2 = vi.fn(async () => undefined);
    await writeMultiExecLiveInput({
      data: "live-a2",
      selectedKeys: afterFocusChange.targets,
      sourceKey: "ssh:a-2",
      targets: runtimeTargets,
      write: liveWriteFromA2,
    });
    expect(liveWriteFromA2.mock.calls).toEqual([["sa1", "live-a2"]]);

    const sendWrite = vi.fn(async () => undefined);
    const runtimeByKey = byKey(runtimeTargets);
    const sendDeliveries = await writeMultiExecCommand({
      data: "echo A09\r",
      targetKeys: Array.from(afterFocusChange.targets),
      resolveTarget: (key) => runtimeByKey.get(key) || null,
      write: sendWrite,
    });
    expect(sendWrite.mock.calls).toEqual([
      ["sa1", "echo A09\r"],
      ["sa2", "echo A09\r"],
    ]);
    expect(sendDeliveries.map((delivery) => [delivery.key, delivery.status])).toEqual([
      ["ssh:a-1", "written"],
      ["ssh:a-2", "written"],
    ]);
    expect(sendWrite.mock.calls.flat()).not.toContain("sb1");
    expect(sendWrite.mock.calls.flat()).not.toContain("sc1");
  });

  it("A10: disconnect shrinks the target set and same-profile reconnect never auto-joins or replays", async () => {
    let state = multiExecReducer(initialMultiExecState, {
      type: "multiExec/setTargets",
      targets: new Set(["ssh:old-a", "ssh:b"]),
    });
    state = multiExecReducer(state, { type: "multiExec/setMode", mode: "send" });

    const reconnectedTargets = buildMultiExecTargets({
      sshTabs: [
        {
          connectionId: "profile-a",
          id: "new-a",
          sessionId: "s-new-a",
          title: "A · reconnected",
          type: "terminal",
        },
        {
          connectionId: "profile-b",
          id: "b",
          sessionId: "sb",
          title: "B",
          type: "terminal",
        },
      ],
      localTabs: [],
    });

    const reconciled = multiExecReducer(state, {
      type: "multiExec/targetsAvailable",
      availableKeys: multiExecAvailableKeys(reconnectedTargets),
      focusedKey: "ssh:new-a",
      splitActive: true,
    });
    expect(reconciled.targets).toEqual(new Set(["ssh:b"]));
    expect(reconciled.targets.has("ssh:new-a")).toBe(false);

    const runtimeByKey = byKey(reconnectedTargets);
    const staleWrite = vi.fn(async () => undefined);
    const staleDeliveries = await writeMultiExecCommand({
      data: "echo A10-unknown\r",
      targetKeys: ["ssh:old-a", "ssh:b"],
      resolveTarget: (key) => runtimeByKey.get(key) || null,
      write: staleWrite,
    });

    expect(staleDeliveries.map((delivery) => [delivery.key, delivery.status])).toEqual([
      ["ssh:old-a", "disconnected"],
      ["ssh:b", "written"],
    ]);
    expect(staleWrite.mock.calls).toEqual([["sb", "echo A10-unknown\r"]]);

    const nextWrite = vi.fn(async () => undefined);
    await writeMultiExecCommand({
      data: "echo A10-after-reconnect\r",
      targetKeys: Array.from(reconciled.targets),
      resolveTarget: (key) => runtimeByKey.get(key) || null,
      write: nextWrite,
    });
    expect(nextWrite.mock.calls).toEqual([["sb", "echo A10-after-reconnect\r"]]);
    expect(nextWrite.mock.calls.flat()).not.toContain("s-new-a");
  });
});
