import { readFileSync } from "node:fs";

const connections = readFileSync(
  new URL("../src-tauri/src/connections/mod.rs", import.meta.url),
  "utf8",
);
const types = readFileSync(
  new URL("../src/features/connections/connectionTypes.ts", import.meta.url),
  "utf8",
);
const dialog = readFileSync(
  new URL("../src/features/connections/ConnectionDialog.tsx", import.meta.url),
  "utf8",
);
const useConnections = readFileSync(
  new URL("../src/features/connections/useConnections.ts", import.meta.url),
  "utf8",
);
const x11 = readFileSync(
  new URL("../src-tauri/src/x11_forward.rs", import.meta.url),
  "utf8",
);
const session = readFileSync(
  new URL("../src-tauri/src/terminal/session.rs", import.meta.url),
  "utf8",
);

for (const needle of [
  "pub x11_forwarding: bool",
  "pub x11_display: Option<String>",
  "x11_forwarding: false",
]) {
  if (!connections.includes(needle)) {
    throw new Error(`WF-06C Rust profile X11 config missing: ${needle}`);
  }
}
for (const needle of [
  "x11_forwarding: boolean",
  'x11_forwarding: false',
  "x11_display?: string | null",
]) {
  if (!types.includes(needle)) {
    throw new Error(`WF-06C frontend X11 config missing: ${needle}`);
  }
}
for (const needle of [
  "x11_forwarding: Boolean(form.advanced.x11_forwarding)",
  "x11_display: form.advanced.x11_display?.trim() || undefined",
]) {
  if (!dialog.includes(needle)) {
    throw new Error(`WF-06C dialog X11 persistence seam missing: ${needle}`);
  }
}
for (const needle of [
  "x11_forwarding: Boolean(input.advanced?.x11_forwarding)",
  "x11_display: trim(input.advanced?.x11_display)",
]) {
  if (!useConnections.includes(needle)) {
    throw new Error(`WF-06C connection normalization seam missing: ${needle}`);
  }
}
for (const needle of [
  "prepare_x11_forwarding",
  "getrandom::fill",
  'Command::new(executable)',
  '"MIT-MAGIC-COOKIE-1"',
  "replace_fake_cookie_in_setup",
]) {
  if (!x11.includes(needle)) {
    throw new Error(`WF-06C X11 security/runtime seam missing: ${needle}`);
  }
}
for (const needle of [
  "config.advanced.x11_forwarding",
  "channel.request_x11(",
  "terminal_x11_request_failed",
  "self.x11_forward.clear().await",
  "cleanup_x11_open_failure",
]) {
  if (!session.includes(needle)) {
    throw new Error(`WF-06C Terminal X11 owner seam missing: ${needle}`);
  }
}

console.log("WF-06C X11 production config, fake-cookie security and Terminal owner source gate passed");
