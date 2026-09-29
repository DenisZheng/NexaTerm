import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");

test("terminal shortcuts leave IME composition/process-key events to xterm", () => {
  const panel = read("src/features/terminal/TerminalPanel.tsx");
  assert.match(panel, /isTerminalImeKeyboardEvent\(event\)/);
  assert.match(panel, /attachCustomKeyEventHandler[\s\S]*isTerminalImeKeyboardEvent\(event\)[\s\S]*return true/);
  assert.match(panel, /interceptCtrlVPaste[\s\S]*isTerminalImeKeyboardEvent\(event\)[\s\S]*return;/);
});

test("Linux IME smoke is CI-only and covers IBus plus Fcitx5", () => {
  const main = read("src/main.tsx");
  const workflow = read(".github/workflows/ci.yml");
  const runner = read("scripts/linux-ime-smoke.mjs");

  assert.match(main, /VITE_NEXATERM_IME_SMOKE === "1"/);
  assert.match(workflow, /engine: \[ibus, fcitx5\]/);
  assert.match(workflow, /xvfb-run -a dbus-run-session/);
  assert.match(runner, /compositionstart/);
  assert.match(runner, /compositionupdate/);
  assert.match(runner, /compositionend/);
  assert.match(runner, /data\.includes\(expected\)/);
});
