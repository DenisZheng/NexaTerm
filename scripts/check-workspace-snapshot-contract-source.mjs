import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/features/workspace/restore/snapshotTypes.ts", import.meta.url),
  "utf8",
);

for (const needle of [
  "WORKSPACE_SNAPSHOT_VERSION = 1",
  'kind: "profile"; profileId: string',
  'kind: "temporary"; targetId: string',
  "WorkspaceSnapshotPaneNode",
  "ratio: number",
  "activeItemId: string | null",
  "followActivePane: boolean",
  "WorkspaceSnapshotSidebarView",
  "export function toSnapshot(",
]) {
  if (!source.includes(needle)) {
    throw new Error(`workspace snapshot contract missing: ${needle}`);
  }
}

const forbiddenFieldDeclaration =
  /^\s*(sessionId|password|privateKey|privateKeyPassphrase|x11Cookie|broadcastState)\??\s*:/mu;
if (forbiddenFieldDeclaration.test(source)) {
  throw new Error("workspace snapshot contract declares a forbidden runtime or secret field");
}

for (const spread of ["...tab", "...session", "...pointers", "...collections", "...target"]) {
  if (source.includes(spread)) {
    throw new Error(`workspace snapshot projection must whitelist fields instead of spreading ${spread}`);
  }
}

console.log("WF-01 non-sensitive workspace snapshot contract source gate passed");
