import { describe, expect, it } from "vitest";

import { splitGroupInsertionIndex } from "./anchor";

describe("splitGroupInsertionIndex", () => {
  it("anchors the split group at the exact host instance, not another tab of the same profile", () => {
    expect(
      splitGroupInsertionIndex(
        [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
        "ssh",
        { kind: "ssh", tabId: "a2" },
        new Set(["ssh:a2", "ssh:a3"]),
      ),
    ).toBe(1);
  });

  it("counts only visible tabs before the host and handles local bindings", () => {
    expect(
      splitGroupInsertionIndex(
        [{ id: "l1" }, { id: "l2" }, { id: "l3" }],
        "local",
        { kind: "local", tabId: "l3" },
        new Set(["local:l1", "local:l3"]),
      ),
    ).toBe(1);
  });

  it("falls back to the end if the host kind or instance is unavailable", () => {
    const tabs = [{ id: "a" }, { id: "b" }];
    expect(
      splitGroupInsertionIndex(tabs, "ssh", { kind: "local", tabId: "a" }, new Set()),
    ).toBe(2);
    expect(
      splitGroupInsertionIndex(tabs, "ssh", { kind: "ssh", tabId: "gone" }, new Set()),
    ).toBe(2);
  });
});
