import { expect, it } from "vitest";
import { diagnoseConnectionFailure, safeDiagnosticId } from "./connectionFailureDiagnosis";
it.each([
  ["terminal_tcp_connect_refused","connect","refused",1], ["terminal_connect_failed","connect","failed",1],
  ["terminal_auth_timeout","auth","timeout",3], ["jump_auth_rejected","auth","rejected",3],
  ["jump_private_key_invalid","auth","failed",3], ["terminal_private_key_invalid","auth","failed",3],
  ["credential_prompt_required","auth","failed",3], ["connection_credential_missing","auth","failed",3],
  ["proxy_auth_rejected","proxy","rejected",1], ["host_key_changed","host_key","failed",2],
  ["terminal_channel_open_timeout","channel","timeout",4], ["terminal_pty_failed","channel","failed",4],
  ["jump_direct_tcpip_timeout","forward","timeout",1], ["connection_jump_cycle","configuration","failed",1],
  ["vault_locked","configuration","failed",1], ["future_code","unknown","failed",1],
])("classifies stable %s without raw text", (code,stage,reason,stepIndex)=>{
  expect(diagnoseConnectionFailure({code,message:"authentication failed timeout",raw_message:"private"})).toMatchObject({stage,reason,stepIndex});
});
it("uses typed node phase and preserves destination vs jump identity without endpoint data",()=>{
  const base={code:"jump_auth_failed",details:{kind:"ssh_node_failure",connection_id:"jump-1",host:"private.invalid",port:22,stage:"auth"}};
  expect(diagnoseConnectionFailure(base,"target-1")).toMatchObject({stage:"auth",nodeRole:"jump",nodeConnectionId:"jump-1",stepIndex:3});
  const next=diagnoseConnectionFailure({...base,details:{...base.details,connection_id:"target-1",stage:"direct_tcpip"}},"target-1");
  expect(next).toMatchObject({stage:"forward",nodeRole:"forward_destination"});
  expect(JSON.stringify(next)).not.toContain("private.invalid");
});
it("raw/string/malformed errors do not invent a stage",()=>{
  for(const error of [null,"connection refused",{message:"SSH auth failed"},{code:42,details:{kind:"ssh_node_failure",stage:"auth"}},{code:"future_code",details:{kind:"ssh_node_failure",connection_id:"x",host:"private.invalid",port:22,stage:"future_phase"}}]) {
    expect(diagnoseConnectionFailure(error).stage).toBe("unknown");
  }
});
it("only accepts bounded diagnostic identifiers",()=>{
  expect(safeDiagnosticId("diag-test_1")).toBe("diag-test_1");
  for(const value of [42,"private:password","id\nsecret","x".repeat(129),""])expect(safeDiagnosticId(value)).toBe("");
});
