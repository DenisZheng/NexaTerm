import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("A14 离线 fixture 只修改一个测试引用且可以恢复", () => {
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", [
    "-X", "utf8", "-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "wf07_a14_fixture_test.py",
  ], { cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.error?.message || `${result.stdout}\n${result.stderr}`);
});
