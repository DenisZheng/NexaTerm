import {
  readTauriCapabilities,
  validateTauriCapabilities,
} from "./tauri-capability-policy.mjs";

const errors = validateTauriCapabilities(readTauriCapabilities());

if (errors.length > 0) {
  console.error("FAIL: Tauri capability window isolation policy failed.");
  for (const error of errors) {
    console.error("- " + error);
  }
  process.exitCode = 1;
} else {
  console.log("PASS: Tauri capability window isolation policy validated.");
}
