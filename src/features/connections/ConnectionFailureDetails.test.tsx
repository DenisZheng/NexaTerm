// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConnectionFailureDetails } from "./ConnectionFailureDetails";
import { diagnoseConnectionFailure } from "./connectionFailureDiagnosis";
import { setLocalePreference } from "../../shared/i18n";
afterEach(cleanup);
it("renders a jump authentication phase and safe ID in English, without raw payloads",()=>{
  setLocalePreference("en");
  const error={code:"jump_auth_rejected",details:{kind:"ssh_node_failure",stage:"auth",connection_id:"jump-1",host:"private.invalid",port:22},raw_message:"password=private"};
  render(<ConnectionFailureDetails diagnosis={diagnoseConnectionFailure(error,"target-1")} nodeLabel="Jump 1" diagnosticId="diag-test"/>);
  expect(screen.getByText("SSH credentials / authentication")).toBeTruthy(); expect(screen.getByText("Jump 1")).toBeTruthy();
  expect(screen.getByText("Diagnostic ID: diag-test")).toBeTruthy();
  expect(document.body.textContent).not.toContain("password="); expect(document.body.textContent).not.toContain("private.invalid");
});
it("updates translated phase/node after a new failure and omits malformed IDs",()=>{
  setLocalePreference("zh-CN");
  const f=render(<ConnectionFailureDetails diagnosis={diagnoseConnectionFailure({code:"terminal_auth_failed"})} nodeLabel="目标一"/>);
  expect(screen.getByText("SSH 凭据 / 认证")).toBeTruthy();
  f.rerender(<ConnectionFailureDetails diagnosis={diagnoseConnectionFailure({code:"jump_direct_tcpip_failed"})} diagnosticId="user:secret"/>);
  expect(screen.getByText("跳板转发通道")).toBeTruthy();expect(screen.queryByText("目标一")).toBeNull();
  expect(document.body.textContent).not.toContain("user:secret");expect(screen.getByText("未确定具体节点")).toBeTruthy();
});
