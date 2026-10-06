import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

// 与 wf07-ssh-output.test.mjs 一样执行 shell 当前源码，避免复制实现或为测试扩展产品接口。
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve("vite/package.json"))("esbuild");
const shellUrl = new URL("../src/features/layout/WorkspaceShell.tsx", import.meta.url);
const source = readFileSync(shellUrl, "utf8");
const tree = ts.createSourceFile("WorkspaceShell.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["isSshConnection", "commandHistoryKeyForScope", "commandHistoryDefaultScopeKey", "buildCommandHistoryScopeOptions"];
const functions = names.map((name) => {
  const declaration = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `Missing real shell function: ${name}`);
  return declaration.getText(tree);
});
const compiled = buildSync({
  stdin: {
    contents: `
      import { useSessionTabsController } from "./src/features/workspace/sessionTabs/useSessionTabsController";
      const commandHistoryAllScopeKey = "all", commandHistorySshScopePrefix = "ssh:", commandHistoryLocalScopePrefix = "local:";
      // 文案不参与判空，参数求值、类型守卫、派生逻辑和 controller 均执行真实源码。
      const tr = (key: string) => key;
      ${functions.join("\n")}
      export { useSessionTabsController, isSshConnection, commandHistoryDefaultScopeKey, buildCommandHistoryScopeOptions };
    `,
    loader: "ts",
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
    sourcefile: "workspace-home-close-entry.ts",
  },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
});
const loaded = { exports: {} };
vm.runInNewContext(compiled.outputFiles[0].text, { module: loaded, exports: loaded.exports, require });
const runtime = loaded.exports;

test("SSH 类型守卫拒绝空对象，保留旧 profile 缺省协议兼容", () => {
  assert.equal(runtime.isSshConnection(null), false);
  assert.equal(runtime.isSshConnection(undefined), false);
  assert.equal(runtime.isSshConnection({ id: "legacy-profile" }), true);
  assert.equal(runtime.isSshConnection({ id: "ssh-profile", protocol: "ssh" }), true);
  for (const protocol of ["rdp", "vnc", "telnet", "serial"]) {
    assert.equal(runtime.isSshConnection({ id: "other-profile", protocol }), false);
  }
});

for (const remaining of ["none", "local", "rdp", "vnc"]) {
  test(`关闭活动 SSH 后回退 ${remaining}，全部关闭后仍渲染 Home`, async (t) => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
    const priorWindow = globalThis.window;
    const priorDocument = globalThis.document;
    const priorAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const uncaught = [];
    const root = createRoot(container, { onUncaughtError: (error) => uncaught.push(error) });
    t.after(async () => {
      await act(async () => root.unmount());
      dom.window.close();
      globalThis.window = priorWindow;
      globalThis.document = priorDocument;
      globalThis.IS_REACT_ACT_ENVIRONMENT = priorAct;
    });
    const sshProfile = { id: "ssh-profile", protocol: "ssh", name: "Fixture SSH" };
    const remoteProfile = { id: "remote-profile", protocol: remaining, name: "Fixture remote" };
    const ssh = { id: "ssh-tab", connectionId: sshProfile.id };
    const other = { id: "other-tab", connectionId: remoteProfile.id, profileId: "local-profile", title: "Fixture local" };
    const empty = { terminalTabs: [], remoteFileTabs: [], localTerminalTabs: [], rdpSessions: [], vncSessions: [] };
    const snapshot = { ...empty, ...(remaining === "none" ? {} : { [remaining === "local" ? "localTerminalTabs" : `${remaining}Sessions`]: [other] }) };
    const modes = [];
    let controller;
    function ShellRender() {
      controller = runtime.useSessionTabsController({
        defaultRemoteFileOpenMode: "split",
        onFollowUp: (followUp) => {
          // 只替代 shell 的协议激活动作边界；不连接真实 PTY、RDP 或 VNC。
          if (followUp.kind === "local") controller.dispatchTabs({ type: "tabs/activateLocal", tabId: followUp.tabId });
          else controller.dispatchTabs({ type: followUp.kind === "rdp" ? "tabs/activateRdp" : "tabs/activateVnc", connectionId: followUp.connectionId, sessionId: followUp.sessionId });
        },
      });
      modes.push({ mode: controller.activeWorkspaceMode, activeConnectionId: controller.activeConnectionId });
      const options = runtime.buildCommandHistoryScopeOptions({
        activeConnection: [sshProfile, remoteProfile].find((profile) => profile.id === controller.activeConnectionId) || null,
        activeLocalTerminalTab: controller.localTerminalTabs.find((tab) => tab.id === controller.activeLocalTerminalTabId) || null,
        activeWorkspaceMode: controller.activeWorkspaceMode,
        connections: [sshProfile],
        defaultScopeKey: runtime.commandHistoryDefaultScopeKey(controller),
        localTerminalProfiles: [],
      });
      assert.ok(options.length > 0);
      return createElement("main", null, controller.activeWorkspaceMode === "home" ? "Home" : controller.activeWorkspaceMode);
    }
    await act(async () => root.render(createElement(ShellRender)));
    await act(async () => {
      controller.setLocalTerminalTabs(snapshot.localTerminalTabs);
      controller.setRdpSessions(snapshot.rdpSessions);
      controller.setVncSessions(snapshot.vncSessions);
      controller.setTerminalTabs([ssh]);
      controller.dispatchTabs({ type: "tabs/activateTerminal", connectionId: sshProfile.id, tabId: ssh.id, rememberUnified: false });
    });
    assert.equal(container.textContent, "ssh");
    await act(async () => {
      controller.setTerminalTabs([]);
      controller.dispatchTabs({ type: "tabs/closeTerminals", closingTabs: [ssh], snapshot });
    });
    assert.equal(container.textContent, remaining === "none" ? "Home" : remaining);
    if (remaining !== "none") {
      // 必须经历真正的 followUp 前过渡帧，不能只测 effect 完成后的最终状态。
      assert.ok(modes.some((state) => state.mode === "ssh" && state.activeConnectionId === null));
      await act(async () => {
        controller.setLocalTerminalTabs([]);
        controller.setRdpSessions([]);
        controller.setVncSessions([]);
        controller.dispatchTabs({ type: remaining === "local" ? "tabs/closeLocalTerminals" : remaining === "rdp" ? "tabs/removeRdp" : "tabs/removeVnc", closingIds: [other.id], snapshot: empty });
      });
    }
    assert.equal(container.textContent, "Home");
    assert.equal(controller.homeActive, true);
    assert.deepEqual(uncaught, []);
  });
}
