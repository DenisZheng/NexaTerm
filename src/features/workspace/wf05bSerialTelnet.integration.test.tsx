// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LocalTerminalTab } from "../terminal/localTerminalTypes";
import {
  createTerminalSplitLayout,
  splitTerminalPane,
  terminalPaneBindingKey,
  type TerminalPaneBinding,
} from "../terminal/terminalSplitLayout";
import { buildMultiExecTargets } from "./multiExec/targets";
import {
  useTerminalSplitController,
  type TerminalSplitControllerInputs,
} from "./split/useTerminalSplitController";

function localBinding(tabId: string): TerminalPaneBinding {
  return { kind: "local", tabId };
}

function characterTab(input: {
  id: string;
  profileId: string;
  sessionId: string;
  source: "telnet" | "serial";
  title: string;
}): LocalTerminalTab {
  return {
    id: input.id,
    ordinal: 0,
    profileId: input.profileId,
    profileKind: input.source,
    sessionId: input.sessionId,
    source: input.source,
    status: "已连接",
    title: input.title,
    warmupOutput: [],
  };
}

describe("WF-05B Serial/Telnet workspace integration", () => {
  it("keeps Telnet and Serial instances independently addressable in Split and MultiExec", () => {
    const telnet = characterTab({
      id: "telnet-a-1",
      profileId: "telnet-a",
      sessionId: "session-telnet-a-1",
      source: "telnet",
      title: "Telnet A · 1",
    });
    const serial = characterTab({
      id: "serial-a-1",
      profileId: "serial-a",
      sessionId: "session-serial-a-1",
      source: "serial",
      title: "Serial A · 1",
    });
    const onCollapseToStandalone = () => undefined;
    const initial: TerminalSplitControllerInputs = {
      activeTerminalSplitBinding: localBinding(telnet.id),
      localTerminalTabs: [telnet, serial],
      onCollapseToStandalone,
      terminalTabs: [],
    };
    const { result, rerender } = renderHook(
      (props: TerminalSplitControllerInputs) => useTerminalSplitController(props),
      { initialProps: initial },
    );

    act(() => {
      const p1 = result.current.nextTerminalSplitId("terminal-pane");
      const p2 = result.current.nextTerminalSplitId("terminal-pane");
      const split = result.current.nextTerminalSplitId("terminal-split");
      result.current.setTerminalSplitLayout(
        splitTerminalPane(
          createTerminalSplitLayout(p1, localBinding(telnet.id)),
          p1,
          "row",
          split,
          p2,
          localBinding(serial.id),
        ),
      );
      result.current.setTerminalSplitHost(localBinding(telnet.id));
      result.current.setTerminalSplitTabActive(true);
      result.current.setMultiExecMode("send");
      result.current.setMultiExecTargets(
        new Set([
          terminalPaneBindingKey(localBinding(telnet.id)),
          terminalPaneBindingKey(localBinding(serial.id)),
        ]),
      );
    });

    expect(result.current.terminalSplitMemberKeys).toEqual(
      new Set(["local:telnet-a-1", "local:serial-a-1"]),
    );
    expect(result.current.multiExecTargets).toEqual(
      new Set(["local:telnet-a-1", "local:serial-a-1"]),
    );

    const targets = buildMultiExecTargets({ localTabs: [telnet, serial], sshTabs: [] });
    expect(targets.map((target) => [target.key, target.kind, target.ownerId, target.sessionId])).toEqual([
      ["local:telnet-a-1", "telnet", "telnet-a", "session-telnet-a-1"],
      ["local:serial-a-1", "serial", "serial-a", "session-serial-a-1"],
    ]);

    rerender({ ...initial, localTerminalTabs: [serial] });

    expect(result.current.multiExecTargets).toEqual(new Set(["local:serial-a-1"]));
    expect(result.current.multiExecTargets.has("local:telnet-a-1")).toBe(false);
    expect(result.current.terminalSplitLayout).toBeNull();
  });

  it("keeps same-profile Character sibling instances distinct by tab and session identity", () => {
    const first = characterTab({
      id: "telnet-a-1",
      profileId: "telnet-a",
      sessionId: "session-telnet-a-1",
      source: "telnet",
      title: "Telnet A · 1",
    });
    const second = characterTab({
      id: "telnet-a-2",
      profileId: "telnet-a",
      sessionId: "session-telnet-a-2",
      source: "telnet",
      title: "Telnet A · 2",
    });

    const targets = buildMultiExecTargets({ localTabs: [first, second], sshTabs: [] });
    expect(targets.map((target) => target.key)).toEqual([
      "local:telnet-a-1",
      "local:telnet-a-2",
    ]);
    expect(targets.map((target) => target.ownerId)).toEqual(["telnet-a", "telnet-a"]);
    expect(targets.map((target) => target.sessionId)).toEqual([
      "session-telnet-a-1",
      "session-telnet-a-2",
    ]);
    expect(targets.every((target) => target.kind === "telnet")).toBe(true);
  });
});
