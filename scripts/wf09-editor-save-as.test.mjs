import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// 执行 Rust builder 的真实 format 字符串；不维护另一份保存算法。
const rust = readFileSync(new URL("../src-tauri/src/remote_files/save_as.rs", import.meta.url), "utf8");
const literal = rust.match(/format!\(\s*("(?:[^"\\]|\\[\s\S])*")/)[1];
const format = JSON.parse(literal.replace(/\\\n\s*/g, ""));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
function command(path) {
  return format.replaceAll("{{", "{").replaceAll("}}", "}").replaceAll("{tmp_suffix}", "fixture").replaceAll("{quoted_path}", quote(path));
}
function fixture(callback) {
  const root = mkdtempSync(join(tmpdir(), "nexaterm-save-as-"));
  const path = join(root, "copy ' $(touch injected).txt");
  const exec = (input = "中文\ncomplete\n", env = {}) => spawnSync("/bin/sh", ["-c", command(path)], { cwd: root, input, encoding: "utf8", env: { ...process.env, ...env } });
  const clean = () => assert.equal(readdirSync(root).some((name) => name.startsWith(".nexaterm-save-as.")), false);
  const tools = (linkScript = null, includeLink = true, catScript = null) => {
    const bin = join(root, "bin"); mkdirSync(bin);
    for (const utility of ["mkdir", "rm", "rmdir", "cat", ...(includeLink ? ["link"] : [])]) symlinkSync(`/usr/bin/${utility}`, join(bin, utility));
    for (const [name, script] of [["link", linkScript], ["cat", catScript]]) {
      if (!script) continue;
      rmSync(join(bin, name)); writeFileSync(join(bin, name), `#!/bin/sh\n${script}\n`); chmodSync(join(bin, name), 0o755);
    }
    return { PATH: bin };
  };
  try { callback({ root, path, exec, clean, tools }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("create-only Save As writes exact UTF-8 bytes, keeps source unchanged and cleans private staging", () => fixture(({ root, path, exec, clean }) => {
  const source = join(root, "original.txt"); writeFileSync(source, "original");
  const result = exec(); assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path, "utf8"), "中文\ncomplete\n");
  assert.equal(readFileSync(source, "utf8"), "original");
  assert.equal(lstatSync(path).mode & 0o777, 0o600);
  assert.equal(existsSync(join(root, "injected")), false); clean();
}));

for (const kind of ["file", "directory", "symlink", "dangling-symlink"]) {
  test(`refuses existing ${kind} without changing it`, () => fixture(({ root, path, exec, clean }) => {
    const victim = join(root, "victim"); writeFileSync(victim, "keep");
    if (kind === "file") writeFileSync(path, "keep");
    else if (kind === "directory") mkdirSync(path);
    else symlinkSync(kind === "symlink" ? victim : join(root, "absent"), path);
    const result = exec(); assert.equal(result.status, 2, result.stderr);
    if (kind === "file") assert.equal(readFileSync(path, "utf8"), "keep");
    if (kind === "directory") assert.deepEqual(readdirSync(path), []);
    if (kind.includes("symlink")) assert.equal(lstatSync(path).isSymbolicLink(), true);
    assert.equal(readFileSync(victim, "utf8"), "keep"); clean();
  }));
}

for (const kind of ["file", "directory", "symlink"]) {
  test(`refuses a racing ${kind} created after the precheck`, () => fixture(({ root, path, exec, clean, tools }) => {
    const script = kind === "file" ? 'printf rival > "$2"' : kind === "directory" ? '/usr/bin/mkdir "$2"' : '/usr/bin/ln -s absent "$2"';
    const result = exec("complete", tools(`${script}\nexec /usr/bin/link "$1" "$2"`));
    assert.equal(result.status, 2, result.stderr);
    if (kind === "file") assert.equal(readFileSync(path, "utf8"), "rival");
    if (kind === "directory") assert.deepEqual(readdirSync(path), []);
    if (kind === "symlink") assert.equal(lstatSync(path).isSymbolicLink(), true);
    assert.equal(existsSync(join(root, "injected")), false); clean();
  }));
}

test("fails closed when link is unavailable or filesystem rejects hard links", () => {
  for (const unsupported of ["missing", "failure"]) fixture(({ path, exec, clean, tools }) => {
    const env = unsupported === "missing" ? tools(null, false) : tools("exit 1");
    assert.equal(exec("text", env).status, 3);
    assert.equal(existsSync(path), false); clean();
  });
});

test("partial stdin failure never publishes a partial target", () => fixture(({ path, exec, clean, tools }) => {
  const result = exec("complete", tools(null, true, "printf partial; exit 1"));
  assert.equal(result.status, 3); assert.equal(existsSync(path), false); clean();
}));

test("Save As IPC remains typed and uses backend path/profile validation and stdin", () => {
  const commandSource = readFileSync(new URL("../src-tauri/src/commands/remote_file_save_as.rs", import.meta.url), "utf8");
  const wrapper = readFileSync(new URL("../src/shared/tauri/commands.ts", import.meta.url), "utf8");
  const registration = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(commandSource, /resolve_remote_connection_profile\(&app, &request.connection_id\)/);
  assert.match(commandSource, /require_remote_path\(&request.path\)/);
  assert.match(wrapper, /export function remoteFileSaveAs\([\s\S]*?invoke<RemoteFileWriteResult>\("remote_file_save_as"/);
  assert.match(registration, /commands::remote_file_save_as::remote_file_save_as/);
  assert.match(rust, /exec_with_reconnect_stdin[\s\S]*content.as_bytes\(\)/);
  assert.match(rust, /"remote_file_exists"/);
  assert.doesNotMatch(format, /\bmv\b|\bln\b|\{content\}/);
});
