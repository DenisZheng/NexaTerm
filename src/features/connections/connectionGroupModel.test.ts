import { describe, it, expect } from "vitest";
import { groupOptions, groupDescendants, type ConnectionGroup } from "./connectionGroupModel";

const groups: ConnectionGroup[] = [
  { id: "prod", name: "Production", parentId: null, color: "#64748b", sortOrder: 0 },
  { id: "dev", name: "Development", parentId: null, color: "#64748b", sortOrder: 1 },
  { id: "a", name: "Linux", parentId: "prod", color: "#64748b", sortOrder: 0 },
  { id: "b", name: "Linux", parentId: "dev", color: "#64748b", sortOrder: 0 },
];
describe("canonical group projection", () => {
  it("keeps same names selectable by ID and distinct paths", () => {
    expect(groupOptions(groups).slice(2)).toEqual([
      { value: "a", label: "Production / Linux" },
      { value: "b", label: "Development / Linux" },
    ]);
  });
  it("excludes self and descendants from move targets without excluding namesakes", () => {
    expect([...groupDescendants(groups, "prod")]).toEqual(["prod", "a"]);
  });
});
