import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function read(path) {
  return readFileSync(path, "utf8");
}

test("MobaXterm import keeps preview and apply wired end-to-end", () => {
  const lib = read("src-tauri/src/lib.rs");
  const backend = read("src-tauri/src/mobaxterm_import.rs");
  const commands = read("src/shared/tauri/commands.ts");
  const dialog = read("src/features/connections/ConnectionTransferDialog.tsx");
  const panel = read("src/features/connections/MobaXtermImportPanel.tsx");

  for (const command of ["mobaxterm_import_preview", "mobaxterm_import_apply"]) {
    assert.match(lib, new RegExp(`mobaxterm_import::${command}`));
    assert.match(backend, new RegExp(`fn ${command}`));
    assert.match(commands, new RegExp(command));
  }

  const en = JSON.parse(read("src/shared/i18n/locales/en.json"));
  const zh = JSON.parse(read("src/shared/i18n/locales/zh-CN.json"));

  assert.match(dialog, /MobaXtermImportPanel/);
  assert.match(dialog, /t\("transfer\.mobaxterm\.open"\)/);
  assert.match(en["transfer.mobaxterm.open"], /\.mxtsessions/);
  assert.match(zh["transfer.mobaxterm.open"], /\.mxtsessions/);
  assert.match(panel, /preview\.fingerprint/);
  assert.match(panel, /defaultUsername/);
  assert.match(panel, /selected\.size/);
  assert.match(panel, /suggested_name/);
});

test("MobaXterm apply rechecks the source fingerprint and avoids overwrite-by-name", () => {
  const backend = read("src-tauri/src/mobaxterm_import.rs");

  assert.match(backend, /mobaxterm_import_file_changed/);
  assert.match(backend, /BEGIN IMMEDIATE/);
  assert.match(backend, /ROLLBACK/);
  assert.match(backend, /ExactDuplicate/);
  assert.match(backend, /mobaxterm_import_name_conflict/);
  assert.doesNotMatch(backend, /id:\s*Some\(/);
});

test("MobaXterm usernames are editable per row and reapplied with source-file protection", () => {
  const backend = read("src-tauri/src/mobaxterm_import.rs");
  const panel = read("src/features/connections/MobaXtermImportPanel.tsx");
  const model = read("src/features/connections/mobaxtermImportModel.ts");
  const types = read("src/features/connections/mobaxtermImportTypes.ts");
  const en = JSON.parse(read("src/shared/i18n/locales/en.json"));
  const zh = JSON.parse(read("src/shared/i18n/locales/zh-CN.json"));

  assert.match(types, /username: string/);
  assert.match(panel, /onUsernameChange/);
  assert.match(panel, /canSelectMobaXtermRow/);
  assert.match(panel, /usernames\[item\.source_index\]/);
  assert.match(panel, /username: \(usernames\[item\.source_index\]/);
  assert.match(model, /network_settings_review/);
  assert.match(backend, /pub username: Option<String>/);
  assert.match(backend, /selection\s*\.username/);
  assert.match(backend, /candidate\.username == username/);
  assert.match(backend, /mobaxterm_import_file_changed/);
  assert.match(backend, /BEGIN IMMEDIATE/);
  assert.match(backend, /ROLLBACK/);
  assert.ok(en["mobaxterm.preview.usernameAria"]);
  assert.ok(zh["mobaxterm.preview.usernameAria"]);
});
