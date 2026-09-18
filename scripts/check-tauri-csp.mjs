import {
  compareWithTauriConf,
  readCspPolicy,
  readTauriSecurity,
  validateCspPolicy,
} from "./tauri-csp-policy.mjs";

// 状态语义沿用 .trellis/spec/backend/security-evidence.md：
//   PASS            策略文件有效且 tauri.conf.json 已启用同一策略
//   REVIEW-REQUIRED 策略文件有效，但 tauri.conf.json 仍为 null（草案未启用），exit 0
//   FAIL            策略文件无效，或 tauri.conf.json 与草案不一致，exit 1

const policy = readCspPolicy();
const errors = validateCspPolicy(policy);

if (errors.length > 0) {
  console.error("FAIL: Tauri CSP policy draft is invalid.");
  for (const error of errors) {
    console.error("- " + error);
  }
  process.exitCode = 1;
} else {
  const result = compareWithTauriConf(policy, readTauriSecurity());
  const log = result.status === "FAIL" ? console.error : console.log;
  log(result.status + ": Tauri CSP policy check.");
  for (const message of result.messages) {
    log("- " + message);
  }
  if (result.status === "FAIL") {
    process.exitCode = 1;
  }
}
