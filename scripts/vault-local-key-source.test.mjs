import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function read(path) {
  return readFileSync(path, "utf8");
}

test("local vault key prefers native credential stores without deleting the hardened fallback early", () => {
  const backend = read("src-tauri/src/storage_local_key.rs");
  const vault = read("src-tauri/src/storage_vault.rs");

  assert.match(backend, /security_framework::passwords::get_generic_password/);
  assert.match(backend, /CredReadW/);
  assert.match(backend, /CredWriteW/);
  assert.match(backend, /CRED_PERSIST_LOCAL_MACHINE/);

  assert.match(vault, /write_native_local_master_key\(&key\)\.is_ok\(\)/);
  assert.match(vault, /restrict_local_key_permissions\(&path\)\?/);
  assert.match(vault, /Permissions::from_mode\(0o600\)/);
  assert.match(vault, /fs::remove_file\(&path\)/);
});

test("vault bounds Argon2id parameters before key derivation", () => {
  const vault = read("src-tauri/src/storage_vault.rs");

  assert.match(vault, /VAULT_MEMORY_COST_KIB: u32 = 19 \* 1024/);
  assert.match(vault, /VAULT_TIME_COST: u32 = 2/);
  assert.match(vault, /VAULT_PARALLELISM: u32 = 1/);
  assert.match(vault, /VAULT_MAX_MEMORY_COST_KIB/);
  assert.match(vault, /validate_kdf_parameters\(&envelope\.kdf\)/);
  assert.match(vault, /vault_kdf_parameters_invalid/);
});

test("vault manifest uses stable crypto releases and existing native bindings", () => {
  const cargo = read("src-tauri/Cargo.toml");

  assert.match(cargo, /aes-gcm = "0\.11\.1"/);
  assert.match(cargo, /argon2 = "0\.6\.0"/);
  assert.match(cargo, /security-framework = "3\.7"/);
  assert.match(cargo, /windows-sys = \{ version = "0\.61\.2"/);
});
