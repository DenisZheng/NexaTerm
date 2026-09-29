// 行数门禁：冻结预算表里的大文件行数，只许减少不许增加；
// 同时拦截新增的巨型源文件（超过阈值但未登记预算的直接失败）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";

const BUDGET_PATH = new URL("./line-budget.json", import.meta.url);
const NEW_FILE_THRESHOLD = 2000;
const SOURCE_ROOTS = ["src", "src-tauri/src"];
const SOURCE_EXTS = new Set([".ts", ".tsx", ".rs"]);

const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8")).files;

function countLines(path) {
  const content = readFileSync(path, "utf8");
  if (content === "") return 0;
  const parts = content.split("\n");
  return content.endsWith("\n") ? parts.length - 1 : parts.length;
}

function* walkSourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "target") continue;
      yield* walkSourceFiles(full);
    } else if (entry.isFile() && SOURCE_EXTS.has(extname(entry.name))) {
      yield full.replace(/\\/g, "/");
    }
  }
}

// 只统计 git 跟踪的文件，避免本地草稿干扰；非 git 环境退化为全量检查。
let tracked = null;
try {
  tracked = new Set(
    execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean),
  );
} catch {
  // ignore: fall back to checking everything on disk
}

const failures = [];

// 规则 A：预算表里的文件不得超过预算。
for (const [file, max] of Object.entries(budget)) {
  if (tracked && !tracked.has(file)) continue; // 已删除/改名，预算由维护者清理
  let lines;
  try {
    lines = countLines(file);
  } catch {
    continue;
  }
  if (lines > max) {
    failures.push(`${file}: ${lines} 行，超过预算 ${max} 行（+${lines - max}）。请先拆分文件；确需放宽时同步更新 scripts/line-budget.json 并在提交信息里说明原因。`);
  }
}

// 规则 B：超过阈值的新文件必须先登记预算（或拆分），不能悄悄长成巨型文件。
for (const root of SOURCE_ROOTS) {
  let exists = true;
  try {
    statSync(root);
  } catch {
    exists = false;
  }
  if (!exists) continue;
  for (const file of walkSourceFiles(root)) {
    if (file in budget) continue;
    if (tracked && !tracked.has(file)) continue;
    const lines = countLines(file);
    if (lines > NEW_FILE_THRESHOLD) {
      failures.push(`${file}: ${lines} 行，超过新建文件阈值 ${NEW_FILE_THRESHOLD} 行且未登记预算。请拆分，或在 scripts/line-budget.json 中登记并说明原因。`);
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`line-budget: ${f}`);
  throw new Error(`行数门禁失败：${failures.length} 个文件超标。`);
}

console.log("line-budget: ok");
