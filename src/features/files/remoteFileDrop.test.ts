import { describe, expect, it } from "vitest";
import { readRemoteFileDrop } from "./remoteFileDrop";

describe("remote download drop contract", () => {
  const source = { connectionId: "a", ownerInstanceId: "ssh:t1", entry: { name: "file", path: "/file", type: "file" } };
  it("whitelists the metadata fields", () => {
    expect(readRemoteFileDrop(JSON.stringify({ ...source, password: "fixture", entry: { ...source.entry, content: "fixture" } }))).toEqual(source);
  });
  it.each(["", "invalid", "null", "[]", "{}", JSON.stringify({ ...source, ownerInstanceId: null }),
    JSON.stringify({ ...source, entry: { ...source.entry, path: "relative" } }),
    JSON.stringify({ ...source, entry: { ...source.entry, type: "unknown" } })])("rejects malformed metadata: %s", (payload) => {
    expect(readRemoteFileDrop(payload)).toBeNull();
  });
});
