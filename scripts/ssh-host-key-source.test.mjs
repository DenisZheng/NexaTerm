import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function rustFiles(root) {
  const out = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...rustFiles(path));
    } else if (name.endsWith(".rs")) {
      out.push(path);
    }
  }
  return out;
}

test("all russh client connections stay behind the known-host handler", () => {
  const root = "src-tauri/src";
  const offenders = [];
  for (const path of rustFiles(root)) {
    const source = readFileSync(path, "utf8");
    if (
      source.includes("client::connect(") ||
      source.includes("client::connect_stream(")
    ) {
      const repoPath = relative(".", path).replaceAll("\\", "/");
      if (repoPath !== "src-tauri/src/terminal/session.rs") {
        offenders.push(repoPath);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `russh connection path bypasses terminal/session.rs: ${offenders.join(", ")}`,
  );
});

test("terminal SSH handler rejects unknown and changed host keys for target and jump paths", () => {
  const source = readFileSync("src-tauri/src/terminal/session.rs", "utf8");

  assert.match(source, /async fn check_server_key/);
  assert.match(
    source,
    /KnownHostCheck::Unknown[\s\S]*Err\(to_russh_error\(app_error_for_host_key_unknown/,
  );
  assert.match(
    source,
    /KnownHostCheck::Changed[\s\S]*app_error_for_host_key_changed/,
  );
  assert.match(source, /let jump_host_key_handler = KnownHostClient/);
  assert.match(
    source,
    /connect_ssh_client\(jump_ssh_config, &jump, jump_host_key_handler\)/,
  );
  assert.match(source, /client::connect_stream\(config, channel\.into_stream\(\), handler\)/);
});

test("persisted host trust validates public key material against fingerprint and algorithm", () => {
  const source = readFileSync("src-tauri/src/known_hosts/mod.rs", "utf8");

  assert.match(source, /validate_host_key_info\(&info\)\?/);
  assert.match(source, /PublicKey::from_openssh/);
  assert.match(source, /expected\.fingerprint_sha256 != info\.fingerprint_sha256/);
  assert.match(source, /expected\.key_algorithm != info\.key_algorithm/);
});
