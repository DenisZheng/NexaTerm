// 把 scripts/git-hooks/ 下的 hook 安装到 .git/hooks/（复制而非软链，Windows 也可用）。
import { copyFileSync, mkdirSync, chmodSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "git-hooks");

let gitDir;
try {
  gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { encoding: "utf8" }).trim();
} catch {
  throw new Error("不在 git 仓库中，无法安装 hooks。");
}

const destDir = join(gitDir, "hooks");
mkdirSync(destDir, { recursive: true });

for (const name of readdirSync(srcDir)) {
  const dest = join(destDir, name);
  copyFileSync(join(srcDir, name), dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    // Windows 上 chmod 无意义，忽略
  }
  console.log(`installed hook: ${dest}`);
}

console.log("git hooks 安装完成。");
