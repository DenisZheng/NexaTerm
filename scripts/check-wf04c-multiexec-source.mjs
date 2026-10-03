import { readFileSync } from "node:fs";

const actions = readFileSync(new URL("../src/features/workspace/multiExec/actions.ts", import.meta.url), "utf8");
const reducer = readFileSync(new URL("../src/features/workspace/multiExec/reducer.ts", import.meta.url), "utf8");
const spec = readFileSync(new URL("../docs/WORKFLOW_SPEC.md", import.meta.url), "utf8");

for (const needle of [
  'export type MultiExecMode = "off" | "live" | "send";',
  'type: "multiExec/setMode"',
  'type: "multiExec/setTargets"',
]) {
  if (!actions.includes(needle)) throw new Error(`WF-04C mode/target contract missing: ${needle}`);
}

for (const needle of [
  'state.mode === "live"',
  "action.availableKeys.has(key)",
]) {
  if (!reducer.includes(needle)) throw new Error(`WF-04C reducer contract missing: ${needle}`);
}

if (/next\.add\(action\.focusedKey\)/.test(reducer)) {
  throw new Error("WF-04C fixed targets must never auto-add the focused terminal.");
}
if (!reducer.includes("availability 只允许移除失效实例")) {
  throw new Error("WF-04C reducer must document shrink-only target reconciliation.");
}
if (!spec.includes("| WS-X04 | 已确认（v0.6） | WF-04C |")) {
  throw new Error("WF-04C WS-X04 decision must be confirmed in WORKFLOW_SPEC v0.6.");
}

console.log("WF-04C fixed-target MultiExec source gate passed");
