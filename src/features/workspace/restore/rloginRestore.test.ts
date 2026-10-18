import { describe, expect, it } from "vitest";
import { toSnapshot } from "./snapshotTypes";
import { decodeWorkspaceSnapshot } from "./snapshotCodec";
import { buildWorkspaceRestorePlan } from "./restorePlan";
import { applyWorkspaceRestorePlanToHydration, buildWorkspaceShellHydration } from "./shellHydration";
import { buildMultiExecTargets } from "../multiExec/targets";
import { resolveWorkspaceSidebarFileContext } from "../../layout/workspaceSidebarContext";
const native={id:"native",profileId:"saved",ordinal:1,source:"rlogin" as const,title:"Rlogin",sessionId:"private-UUID",reservation_id:"private-reservation",allow_plaintext:true,warmupOutput:[83,69,67,82,69,84],status:"rlogin:initial_exchange_ready"};
const pointers={activeItemId:"local:native",order:["local:native"],sidebar:{collapsed:false,view:"files" as const},files:{directories:{"local:native":"private-directory"},followActivePane:true},splitLayout:null};
function snapshot(){return toSnapshot(pointers,{localTerminalTabs:[native],terminalTabs:[],rdpSessions:[],vncSessions:[]});}
describe("Rlogin restore/privacy boundaries",()=>{
 it("roundtrips only logical Rlogin references and whitelists away native handles/consent/output",()=>{
  const saved=snapshot();expect(saved.instances).toEqual([{id:"local:native",kind:"local",ordinal:1,source:"rlogin",target:{kind:"profile",profileId:"saved"}}]);
  const json=JSON.stringify(saved);for(const secret of ["private-UUID","private-reservation","allow_plaintext","warmupOutput","private-directory"])expect(json).not.toContain(secret);
  expect(decodeWorkspaceSnapshot(saved).instances).toEqual(saved.instances);
 });
 it("never auto-connects Rlogin even when global auto reconnect is enabled",()=>{
  const saved=snapshot(),plan=buildWorkspaceRestorePlan(saved,{autoReconnect:true,profileIds:new Set(["saved"])});
  expect(plan.items[0]).toMatchObject({autoReconnect:false,status:"rlogin-consent-required"});
  const hydrated=applyWorkspaceRestorePlanToHydration(buildWorkspaceShellHydration(saved),plan);
  expect(hydrated.localTerminalTabs[0]).toMatchObject({source:"rlogin",status:"rlogin:idle",warmupOutput:[]});expect(hydrated.localTerminalTabs[0].sessionId).toBeUndefined();
 });
 it("isolates a missing saved profile and never converts it to a local shell",()=>{
  const saved=snapshot(),plan=buildWorkspaceRestorePlan(saved,{autoReconnect:true,profileIds:new Set()});expect(plan.items[0]).toMatchObject({status:"missing-profile",autoReconnect:false});
  expect(buildWorkspaceShellHydration(saved).localTerminalTabs[0].source).toBe("rlogin");
 });
 it("excludes native instances from broadcast/macros and Files even with an adversarial public session ID",()=>{
  expect(buildMultiExecTargets({localTabs:[native],sshTabs:[]})).toEqual([]);
  expect(resolveWorkspaceSidebarFileContext({activeTabId:"native",activeWorkspaceMode:"local",focusedBinding:{kind:"local",tabId:"native"},showingHome:false,splitActive:true,terminalDirectories:{native:"/trap"},terminalTabs:[{id:"ssh-sibling",connectionId:"ssh-profile"}]})).toBeNull();
 });
});
