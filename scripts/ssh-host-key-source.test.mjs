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

test("all production russh client connections stay behind the known-host handler", () => {
  const root = "src-tauri/src";
  const terminalMod = readFileSync("src-tauri/src/terminal/mod.rs", "utf8");
  const offenders = [];
  for (const path of rustFiles(root)) {
    const source = readFileSync(path, "utf8");
    if (
      source.includes("client::connect(") ||
      source.includes("client::connect_stream(")
    ) {
      const repoPath = relative(".", path).replaceAll("\\", "/");
      const isProductionSession = repoPath === "src-tauri/src/terminal/session.rs";
      const isGuardedX11Fixture =
        repoPath === "src-tauri/src/terminal/x11_fixture.rs" &&
        /#\[cfg\(test\)\]\s*mod x11_fixture;/.test(terminalMod) &&
        source.includes("KnownHostClient") &&
        source.includes("x11_fixture_russh_path_reaches_host_xvfb") &&
        source.includes("#[ignore =");

      if (!isProductionSession && !isGuardedX11Fixture) {
        offenders.push(repoPath);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `production russh connection path bypasses terminal/session.rs: ${offenders.join(", ")}`,
  );
});

test("X11 fixture direct connect is test-only and reuses the production known-host handler", () => {
  const terminalMod = readFileSync("src-tauri/src/terminal/mod.rs", "utf8");
  const fixture = readFileSync("src-tauri/src/terminal/x11_fixture.rs", "utf8");

  assert.match(terminalMod, /#\[cfg\(test\)\]\s*mod x11_fixture;/);
  assert.match(fixture, /KnownHostClient/);
  assert.match(fixture, /client::connect\(/);
  assert.match(fixture, /x11_fixture_russh_path_reaches_host_xvfb/);
  assert.match(fixture, /#\[ignore =/);
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

test("sqlite host-trust command path validates key material before persistence", () => {
  const source = readFileSync("src-tauri/src/storage_repository.rs", "utf8");

  assert.match(source, /pub fn known_host_trust[\s\S]*validate_host_key_info\(&info\)\?/);
});

test("persisted host trust validates public key material against fingerprint and algorithm", () => {
  const source = readFileSync("src-tauri/src/known_hosts/mod.rs", "utf8");

  assert.match(source, /validate_host_key_info\(&info\)\?/);
  assert.match(source, /PublicKey::from_openssh/);
  assert.match(source, /expected\.fingerprint_sha256 != info\.fingerprint_sha256/);
  assert.match(source, /expected\.key_algorithm != info\.key_algorithm/);
});
