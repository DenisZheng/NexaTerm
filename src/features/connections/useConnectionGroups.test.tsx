// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionGroups } from "./useConnectionGroups";
import { connectionGroupList, connectionGroupSave } from "../../shared/tauri/commands";
vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));
vi.mock("../../shared/tauri/commands", () => ({
  connectionGroupList: vi.fn(), connectionGroupSave: vi.fn(),
  connectionGroupDelete: vi.fn(), connectionGroupAssign: vi.fn(),
}));
const rows = [{ id: "a", name: "Linux", parent_id: null, color: "#64748b", sort_order: 0, created_at: "t", updated_at: "t" }];
const connections: [] = [];
describe("canonical group controller", () => {
  beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); vi.mocked(connectionGroupList).mockResolvedValue(rows); });
  it("preserves the canonical tree and rejects failed saves", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useConnectionGroups(true, connections, reload));
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.mocked(connectionGroupSave).mockRejectedValue(new Error("同级重名"));
    await act(async () => { await expect(result.current.save({ name: "Linux", parent_id: null, color: "#64748b" })).rejects.toThrow("同级重名"); });
    expect(result.current.groups[0].id).toBe("a");
    expect(result.current.error).toBe("同级重名");
    expect(reload).not.toHaveBeenCalled();
  });
  it("does not overwrite legacy raw data or permit writes before migration", async () => {
    const raw = '[{"id":"old","name":"Linux","parentId":"missing"}]';
    localStorage.setItem("mxterm.connectionGroups.v2", raw);
    const { result } = renderHook(() => useConnectionGroups(true, connections, vi.fn()));
    await waitFor(() => expect(result.current.error).toContain("旧分组树"));
    expect(result.current.ready).toBe(false);
    expect(localStorage.getItem("mxterm.connectionGroups.v2")).toBe(raw);
    expect(connectionGroupList).not.toHaveBeenCalled();
  });
});
