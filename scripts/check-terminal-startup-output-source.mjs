import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const outRoot = resolve("node_modules", ".mxterm-check-tmp");
mkdirSync(outRoot, { recursive: true });
const outDir = mkdtempSync(join(outRoot, "terminal-startup-output-"));

try {
  const compile = spawnSync(
    process.execPath,
    [
      resolve("node_modules", "typescript", "bin", "tsc"),
      "src/features/terminal/terminalStartupOutput.ts",
      "--outDir",
      outDir,
      "--module",
      "ES2020",
      "--target",
      "ES2020",
      "--moduleResolution",
      "bundler",
      "--skipLibCheck",
      "--strict",
    ],
    { encoding: "utf8" },
  );

  if (compile.status !== 0) {
    process.stderr.write(compile.stdout || "");
    process.stderr.write(compile.stderr || "");
    if (compile.error) {
      process.stderr.write(`${compile.error.message}\n`);
    }
    process.exit(compile.status || 1);
  }

  const { normalizeStartupOutput } = await import(
    pathToFileURL(join(outDir, "terminalStartupOutput.js")).href
  );

  // 以下均为脱敏后的示例登录 banner：IP 使用 RFC 5737 文档保留段、主机名为通用占位符，
  // 仅用于验证 normalizeStartupOutput 的去重/折叠逻辑，不含真实环境数据。
  const aliCloudStartup = [
    "Last login: Wed Jun 17 11:45:56 2026 from 203.0.113.36",
    "",
    "Welcome to Alibaba Cloud Elastic Compute Service !",
    "",
    "[root@demo-ecs ~]# [root@demo-ecs ~]# ",
  ].join("\r\n");

  assert.equal(
    normalizeStartupOutput(aliCloudStartup),
    [
      "Last login: Wed Jun 17 11:45:56 2026 from 203.0.113.36",
      "",
      "Welcome to Alibaba Cloud Elastic Compute Service !",
      "",
      "[root@demo-ecs ~]# ",
    ].join("\r\n"),
  );

  const leadingPromptThenBanner = [
    "[root@demo-ecs ~]#",
    "Last login: Wed Jun 17 11:45:56 2026 from 203.0.113.36",
    "Welcome to Alibaba Cloud Elastic Compute Service !",
    "[root@demo-ecs ~]# ",
  ].join("\n");

  assert.equal(
    normalizeStartupOutput(leadingPromptThenBanner),
    [
      "Last login: Wed Jun 17 11:45:56 2026 from 203.0.113.36",
      "Welcome to Alibaba Cloud Elastic Compute Service !",
      "[root@demo-ecs ~]# ",
    ].join("\n"),
  );

  const leadingPromptJoinedToBanner = [
    "root@demo-vm:~# Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 6.8.0-94-generic x86_64)",
    "",
    "* Documentation:  https://help.ubuntu.com",
    "Last login: Thu Jun 18 00:19:00 2026 from 198.51.100.225",
    "root@demo-vm:~# ",
  ].join("\n");

  assert.equal(
    normalizeStartupOutput(leadingPromptJoinedToBanner),
    [
      "Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 6.8.0-94-generic x86_64)",
      "",
      "* Documentation:  https://help.ubuntu.com",
      "Last login: Thu Jun 18 00:19:00 2026 from 198.51.100.225",
      "root@demo-vm:~# ",
    ].join("\n"),
  );

  const repeatedLoginBanner = [
    "Last login: Thu Jun 18 00:51:59 2026 from 203.0.113.36",
    "",
    "Welcome to Alibaba Cloud Elastic Compute Service !",
    "",
    "Last login: Thu Jun 18 00:51:59 2026 from 203.0.113.36",
    "",
    "Welcome to Alibaba Cloud Elastic Compute Service !",
    "",
    "[root@demo-ecs ~]# ",
  ].join("\n");

  assert.equal(
    normalizeStartupOutput(repeatedLoginBanner),
    [
      "Last login: Thu Jun 18 00:51:59 2026 from 203.0.113.36",
      "",
      "Welcome to Alibaba Cloud Elastic Compute Service !",
      "",
      "[root@demo-ecs ~]# ",
    ].join("\n"),
  );

  const terminalPanelSource = readFileSync(
    "src/features/terminal/TerminalPanel.tsx",
    "utf8",
  );
  assert.match(terminalPanelSource, /normalizeStartupOutput/);
  assert.doesNotMatch(terminalPanelSource, /function stripLeadingDuplicateStartupPrompt/);

  console.log("Terminal startup output check passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
