import { describe, expect, it } from "vitest";
import { translate } from "../../shared/i18n";
import { selectWorkspaceItems, type InstanceCollections } from "../workspace/sessionTabs/instances";
import { buildOpenSessionEntries } from "./sessionNavigation";

const collections: InstanceCollections = {
  terminalTabs: [{ id: "a", connectionId: "server", ordinal: 0 }, { id: "b", connectionId: "server", ordinal: 2 }],
  localTerminalTabs: [{ id: "local", profileId: "server", ordinal: 0, source: "local" },
    { id: "serial", profileId: "serial-profile", ordinal: 0, source: "serial" }],
  rdpSessions: [{ id: "desktop", connectionId: "desktop-profile" }], vncSessions: [],
};
const lookups = { connectionName: () => "Fixture", connectionAddress: () => "tester@example.invalid:22", localProfileName: () => "Shell" };
describe("opened instance navigation", () => {
  it("keeps same-profile instances and ordinal gaps distinct and excludes unrelated local profiles", () => {
    const items = selectWorkspaceItems(collections, ["ssh:b", "ssh:a"], null);
    const entries = buildOpenSessionEntries(items, lookups, (key, params) => translate("en", key, params));
    expect(entries.map((entry) => entry.id)).toEqual(["ssh:b", "ssh:a", "local:serial", "rdp:desktop"]);
    expect(entries[0].label).toContain("3");
    expect(entries.filter((entry) => entry.connectionId === "server").length).toBe(2);
    expect(entries.find((entry) => entry.id === "local:serial")?.connectionId).toBe("serial-profile");
  });
  it("keeps split members navigable by their existing IDs and drops closed instances", () => {
    const split = { host: { kind: "ssh" as const, tabId: "a" }, bindings: [{ kind: "ssh" as const, tabId: "a" }, { kind: "ssh" as const, tabId: "b" }] };
    expect(selectWorkspaceItems(collections, [], split).some((item) => item.id === "split")).toBe(true);
    const navigation = selectWorkspaceItems(collections, [], null);
    expect(buildOpenSessionEntries(navigation, lookups, (key, params) => translate("en", key, params))
      .filter((entry) => entry.connectionId === "server").map((entry) => entry.id)).toEqual(["ssh:a", "ssh:b"]);
    const closed = selectWorkspaceItems({ ...collections, terminalTabs: collections.terminalTabs.slice(1) }, ["ssh:a"], null);
    expect(buildOpenSessionEntries(closed, lookups, (key, params) => translate("zh-CN", key, params)).some((entry) => entry.id === "ssh:a")).toBe(false);
  });
});
