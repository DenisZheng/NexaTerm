import { describe, expect, it } from "vitest";

import {
  batchConnectMaxConcurrentAttempts,
  batchConnectMaxNewSessions,
  batchConnectSummary,
  buildBatchConnectPreviewPlan,
  createBatchConnectRun,
  nextBatchConnectConnectionIds,
  requestBatchConnectCancel,
  retryFailedBatchConnectItems,
  updateBatchConnectItem,
} from "./batchConnectModel";

const groups = [
  { id: "prod", name: "Production", parentId: null, sortOrder: 0 },
  { id: "web", name: "Web", parentId: "prod", sortOrder: 0 },
  { id: "db", name: "Database", parentId: "prod", sortOrder: 1 },
  { id: "dev", name: "Development", parentId: null, sortOrder: 1 },
] as const;

function connection(
  id: string,
  groupId: string,
  credentialMode: "saved" | "inline" | "prompt" = "saved",
) {
  return {
    credential_mode: credentialMode,
    group_id: groupId,
    id,
    name: id,
    protocol: "ssh" as const,
  };
}

describe("batch connect preview", () => {
  it("collects the selected canonical group recursively in tree order", () => {
    const plan = buildBatchConnectPreviewPlan({
      connections: [
        connection("prod-1", "prod"),
        connection("db-1", "db"),
        connection("web-1", "web", "prompt"),
        connection("dev-1", "dev"),
      ],
      groups,
      includeDescendants: true,
      rootGroupId: "prod",
    });

    expect(plan.candidates.map((item) => item.connectionId)).toEqual([
      "prod-1",
      "web-1",
      "db-1",
    ]);
    expect(plan.candidates.map((item) => item.groupPath)).toEqual([
      "Production",
      "Production / Web",
      "Production / Database",
    ]);
    expect(plan.candidates[1]?.requiresInteraction).toBe(true);
  });

  it("can limit the batch to the selected group without descendants", () => {
    const plan = buildBatchConnectPreviewPlan({
      connections: [connection("prod-1", "prod"), connection("web-1", "web")],
      groups,
      includeDescendants: false,
      rootGroupId: "prod",
    });

    expect(plan.candidates.map((item) => item.connectionId)).toEqual(["prod-1"]);
  });

  it("skips already-open profiles by default without removing them from preview", () => {
    const plan = buildBatchConnectPreviewPlan({
      connections: [
        connection("prod-1", "prod"),
        connection("web-1", "web"),
        connection("db-1", "db"),
      ],
      groups,
      includeDescendants: true,
      openConnectionIds: new Set(["web-1"]),
      rootGroupId: "prod",
    });

    expect(plan.candidates.find((item) => item.connectionId === "web-1")?.alreadyOpen).toBe(true);
    expect(plan.selectedConnectionIds).toEqual(["prod-1", "db-1"]);
  });

  it("caps the default selection at twenty new sessions", () => {
    const connections = Array.from({ length: batchConnectMaxNewSessions + 3 }, (_, index) =>
      connection(`host-${index.toString()}`, "prod"),
    );
    const plan = buildBatchConnectPreviewPlan({
      connections,
      groups,
      includeDescendants: true,
      rootGroupId: "prod",
    });

    expect(plan.eligibleCount).toBe(23);
    expect(plan.selectedConnectionIds).toHaveLength(batchConnectMaxNewSessions);
    expect(plan.selectionLimitReached).toBe(true);
  });
});

describe("batch connect lifecycle", () => {
  it("never starts more than four unfinished items and waiting-user occupies a slot", () => {
    let run = createBatchConnectRun(["a", "b", "c", "d", "e", "f"]);

    expect(nextBatchConnectConnectionIds(run)).toEqual(["a", "b", "c", "d"]);
    run = updateBatchConnectItem(run, "a", "connecting");
    run = updateBatchConnectItem(run, "b", "waiting-user");
    run = updateBatchConnectItem(run, "c", "connecting");
    run = updateBatchConnectItem(run, "d", "connecting");
    expect(nextBatchConnectConnectionIds(run)).toEqual([]);

    run = updateBatchConnectItem(run, "a", "success");
    expect(nextBatchConnectConnectionIds(run)).toEqual(["e"]);
    expect(batchConnectMaxConcurrentAttempts).toBe(4);
  });

  it("keeps successful items when another item fails", () => {
    let run = createBatchConnectRun(["ok", "bad", "later"]);
    run = updateBatchConnectItem(run, "ok", "success");
    run = updateBatchConnectItem(run, "bad", "failed", "auth failed");

    expect(batchConnectSummary(run)).toMatchObject({
      success: 1,
      failed: 1,
      queued: 1,
    });
    expect(nextBatchConnectConnectionIds(run)).toEqual(["later"]);
  });

  it("cancel remaining preserves success, cancels queued, and returns active items to abort", () => {
    let run = createBatchConnectRun(["done", "active", "prompt", "queued"]);
    run = updateBatchConnectItem(run, "done", "success");
    run = updateBatchConnectItem(run, "active", "connecting");
    run = updateBatchConnectItem(run, "prompt", "waiting-user");

    const cancelled = requestBatchConnectCancel(run);

    expect(cancelled.activeConnectionIds).toEqual(["active", "prompt"]);
    expect(batchConnectSummary(cancelled.run)).toMatchObject({
      success: 1,
      connecting: 1,
      "waiting-user": 1,
      cancelled: 1,
    });
    expect(nextBatchConnectConnectionIds(cancelled.run)).toEqual([]);
  });

  it("retries only failed items and does not replay successful items", () => {
    let run = createBatchConnectRun(["done", "bad", "cancelled"]);
    run = updateBatchConnectItem(run, "done", "success");
    run = updateBatchConnectItem(run, "bad", "failed", "timeout");
    run = updateBatchConnectItem(run, "cancelled", "cancelled");

    run = retryFailedBatchConnectItems(run);

    expect(run.items).toEqual([
      { connectionId: "done", error: null, status: "success" },
      { connectionId: "bad", error: null, status: "queued" },
      { connectionId: "cancelled", error: null, status: "cancelled" },
    ]);
    expect(nextBatchConnectConnectionIds(run)).toEqual(["bad"]);
  });
});
