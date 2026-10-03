import { describe, expect, it } from "vitest";

import {
  buildMultiExecTargets,
  multiExecAvailableKeys,
  selectExplicitMultiExecTargets,
  selectLiveFanoutTargets,
} from "./targets";

describe("MultiExec instance targets", () => {
  it("projects every connected SSH terminal instance independently", () => {
    const targets = buildMultiExecTargets({
      sshTabs: [
        {
          connectionId: "profile-a",
          id: "a-1",
          sessionId: "session-a1",
          title: "Server A · 1",
          type: "terminal",
        },
        {
          connectionId: "profile-a",
          id: "a-2",
          sessionId: "session-a2",
          title: "Server A · 2",
          type: "terminal",
        },
        {
          connectionId: "profile-b",
          id: "b-wait",
          title: "Server B",
          type: "connecting",
        },
      ],
      localTabs: [],
    });

    expect(targets.map((target) => target.key)).toEqual(["ssh:a-1", "ssh:a-2"]);
    expect(targets.map((target) => target.ownerId)).toEqual(["profile-a", "profile-a"]);
    expect(targets.map((target) => target.sessionId)).toEqual(["session-a1", "session-a2"]);
  });

  it("projects Local, Telnet and Serial as distinct instance targets", () => {
    const targets = buildMultiExecTargets({
      sshTabs: [],
      localTabs: [
        {
          id: "local-1",
          profileId: "pwsh",
          sessionId: "pty-local",
          source: "local",
          title: "PowerShell",
        },
        {
          id: "telnet-1",
          profileId: "telnet-profile",
          sessionId: "pty-telnet",
          source: "telnet",
          title: "Telnet",
        },
        {
          id: "serial-1",
          profileId: "serial-profile",
          sessionId: "pty-serial",
          source: "serial",
          title: "Serial",
        },
      ],
    });

    expect(targets.map((target) => [target.key, target.kind])).toEqual([
      ["local:local-1", "local"],
      ["local:telnet-1", "telnet"],
      ["local:serial-1", "serial"],
    ]);
  });

  it("excludes tabs without a writable runtime session", () => {
    const targets = buildMultiExecTargets({
      sshTabs: [
        {
          connectionId: "profile",
          id: "connecting",
          title: "Connecting",
          type: "connecting",
        },
      ],
      localTabs: [
        {
          id: "closed",
          profileId: "local",
          source: "local",
          title: "Closed",
        },
      ],
    });

    expect(targets).toEqual([]);
  });

  it("selection is by exact instance key, not profile/owner id", () => {
    const targets = buildMultiExecTargets({
      sshTabs: [
        {
          connectionId: "same-profile",
          id: "one",
          sessionId: "s1",
          title: "One",
          type: "terminal",
        },
        {
          connectionId: "same-profile",
          id: "two",
          sessionId: "s2",
          title: "Two",
          type: "terminal",
        },
      ],
      localTabs: [],
    });

    expect(
      selectExplicitMultiExecTargets(targets, new Set(["ssh:two"])).map((target) => target.key),
    ).toEqual(["ssh:two"]);
    expect(multiExecAvailableKeys(targets)).toEqual(new Set(["ssh:one", "ssh:two"]));
  });

  it("live source is excluded from fan-out without changing the fixed target set", () => {
    const targets = buildMultiExecTargets({
      sshTabs: [
        {
          connectionId: "a",
          id: "one",
          sessionId: "s1",
          title: "One",
          type: "terminal",
        },
        {
          connectionId: "b",
          id: "two",
          sessionId: "s2",
          title: "Two",
          type: "terminal",
        },
      ],
      localTabs: [],
    });
    const selected = new Set(["ssh:one", "ssh:two"]);

    expect(
      selectLiveFanoutTargets(targets, selected, "ssh:one").map((target) => target.key),
    ).toEqual(["ssh:two"]);
    expect(selected).toEqual(new Set(["ssh:one", "ssh:two"]));
  });
});
