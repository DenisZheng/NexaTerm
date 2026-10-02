// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateGroupExpansion, type LegacyGroupReport } from "./connectionGroupModel";
import LegacyGroupMigrationNotice from "./LegacyGroupMigrationNotice";
const report: LegacyGroupReport = { complete: true, backup_path: "backup.json", issue: null, repairs: [], rows: [{ id: "old", name: "Linux", color: "#64748b", parentId: null }], mappings: [{ legacy_id: "old", canonical_id: "new" }] };
afterEach(() => { cleanup(); localStorage.clear(); });
describe("legacy migration presentation", () => {
  it("maps expansion separately, retains old raw and never reapplies after completion", () => {
    const raw = JSON.stringify({ "group-old": false, favorites: true, recent: false });
    localStorage.setItem("mxterm.connectionExpandedFolders.v1", raw);
    migrateGroupExpansion(localStorage, { ...report, complete: false });
    expect(localStorage.getItem("mxterm.connectionExpandedFolders.v2")).toBeNull();
    migrateGroupExpansion(localStorage, report);
    expect(JSON.parse(localStorage.getItem("mxterm.connectionExpandedFolders.v2")!)).toEqual({ "group-new": false, favorites: true, recent: false });
    expect(localStorage.getItem("mxterm.connectionExpandedFolders.v1")).toBe(raw);
    localStorage.setItem("mxterm.connectionExpandedFolders.v2", "{}");
    migrateGroupExpansion(localStorage, report);
    expect(localStorage.getItem("mxterm.connectionExpandedFolders.v2")).toBe("{}");
  });
  it("does not hide storage failure as successful presentation migration", () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error("quota"); } } as unknown as Storage;
    expect(() => migrateGroupExpansion(storage, report)).toThrow("quota");
  });
  it("submits explicit row choices and preserves the draft after failure", async () => {
    const resolve = vi.fn().mockRejectedValueOnce(new Error("同级名称冲突")).mockResolvedValueOnce(true);
    render(<LegacyGroupMigrationNotice report={{ ...report, complete: false, issue: "请选择映射" }} groups={[]} onResolve={resolve} />);
    fireEvent.click(screen.getByText("处理旧分组迁移"));
    fireEvent.change(screen.getByLabelText("名称 1"), { target: { value: "Linux 2" } });
    fireEvent.click(screen.getByText("确认映射并迁移"));
    await waitFor(() => expect(screen.getByText("同级名称冲突")).toBeTruthy());
    expect((screen.getByLabelText("名称 1") as HTMLInputElement).value).toBe("Linux 2");
    expect(resolve).toHaveBeenCalledWith([{ index: 0, name: "Linux 2", parent_index: null, target_id: null }]);
    fireEvent.click(screen.getByText("确认映射并迁移"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
