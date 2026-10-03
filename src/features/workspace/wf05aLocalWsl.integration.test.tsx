// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LocalTerminalTab } from "../terminal/localTerminalTypes";
import { terminalPaneBindingKey, type TerminalPaneBinding } from "../terminal/terminalSplitLayout";
import { buildMultiExecTargets } from "./multiExec/targets";
import {
  useTerminalSplitController,
  type TerminalSplitControllerInputs,
} from "./split/useTerminalSplitController";
import { createTerminalSplitLayout, splitTerminalPane } from "../terminal/terminalSplitLayout";

function localBinding(tabId: string): TerminalPaneBinding {
  return { kind: "local", tabId };
}

function localTab(input: {
  id: string;
  profileId: string;
  profileKind: string;
  sessionId: string;
  title: string;
}): LocalTerminalTab {
  return {
    id: input.id,
    ordinal: 0,
    profileId: input.profileId,
    profileKind: input.profileKind,
    sessionId: input.sessionId,
    source: "local",
    status: "已连接",
    title: input.title,
    warmupOutput: [],
  };
}

describe("WF-05A Local/WSL workspace integration", () => {
  it("keeps Local and WSL instances independently addressable in Split and MultiExec", () => {
    const wsl = localTab({
      id: "wsl-ubuntu-1",
      profileId: "wsl-ubuntu",
      profileKind: "wsl",
      sessionId: "session-wsl-1",
      title: "WSL · Ubuntu · 1",
    });
    const pwsh = localTab({
      id: "pwsh-1",
      profileId: "pwsh",
      profileKind: "powershell_core",
      sessionId: "session-pwsh-1",
      title: "PowerShell 7 · 1",
    });
    const onCollapseToStandalone = () => undefined;
    const initial: TerminalSplitControllerInputs = {
      activeTerminalSplitBinding: localBinding(wsl.id),
      localTerminalTabs: [wsl, pwsh],
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
          createTerminalSplitLayout(p1, localBinding(wsl.id)),
          p1,
          "row",
          split,
          p2,
          localBinding(pwsh.id),
        ),
      );
      result.current.setTerminalSplitHost(localBinding(wsl.id));
      result.current.setTerminalSplitTabActive(true);
      result.current.setMultiExecMode("live");
      result.current.setMultiExecTargets(
        new Set([
          terminalPaneBindingKey(localBinding(wsl.id)),
          terminalPaneBindingKey(localBinding(pwsh.id)),
        ]),
      );
    });

    expect(result.current.terminalSplitMemberKeys).toEqual(
      new Set(["local:wsl-ubuntu-1", "local:pwsh-1"]),
    );
    expect(result.current.multiExecTargets).toEqual(
      new Set(["local:wsl-ubuntu-1", "local:pwsh-1"]),
    );

    const targets = buildMultiExecTargets({ localTabs: [wsl, pwsh], sshTabs: [] });
    expect(targets.map((target) => [target.key, target.ownerId, target.sessionId])).toEqual([
      ["local:wsl-ubuntu-1", "wsl-ubuntu", "session-wsl-1"],
      ["local:pwsh-1", "pwsh", "session-pwsh-1"],
    ]);

    rerender({ ...initial, localTerminalTabs: [pwsh] });

    expect(result.current.multiExecTargets).toEqual(new Set(["local:pwsh-1"]));
    expect(result.current.multiExecTargets.has("local:wsl-ubuntu-1")).toBe(false);
    expect(result.current.terminalSplitLayout).toBeNull();
  });

  it("keeps sibling WSL instances distinct even when they share one distro profile", () => {
    const first = localTab({
      id: "wsl-ubuntu-1",
      profileId: "wsl-ubuntu",
      profileKind: "wsl",
      sessionId: "session-wsl-1",
      title: "WSL · Ubuntu · 1",
    });
    const second = localTab({
      id: "wsl-ubuntu-2",
      profileId: "wsl-ubuntu",
      profileKind: "wsl",
      sessionId: "session-wsl-2",
      title: "WSL · Ubuntu · 2",
    });

    const targets = buildMultiExecTargets({ localTabs: [first, second], sshTabs: [] });
    expect(targets.map((target) => target.key)).toEqual([
      "local:wsl-ubuntu-1",
      "local:wsl-ubuntu-2",
    ]);
    expect(targets.map((target) => target.ownerId)).toEqual(["wsl-ubuntu", "wsl-ubuntu"]);
    expect(targets.map((target) => target.sessionId)).toEqual([
      "session-wsl-1",
      "session-wsl-2",
    ]);
  });
});
