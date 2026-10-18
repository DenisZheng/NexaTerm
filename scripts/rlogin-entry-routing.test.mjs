import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the real shell functions so an imported native profile cannot reach SSH or browser fake success.
const source=readFileSync(new URL("../src/features/layout/WorkspaceShell.tsx",import.meta.url),"utf8");
const tree=ts.createSourceFile("WorkspaceShell.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function declaration(name) {
  let result;
  function visit(node) {if(ts.isFunctionDeclaration(node)&&node.name?.text===name)result=node.getText(tree);ts.forEachChild(node,visit);}
  visit(tree);assert.ok(result,`Missing real shell function ${name}`);return result;
}
test("imported Rlogin never asks SSH credentials, starts SSH or reports browser preview success",async()=>{
  const calls=[];const tabs=[];const context={Date,tr:key=>key,formatConnectionAddress:()=>"fixture-target",terminalTabsRef:{current:tabs},
    isRdpConnection:()=>false,isVncConnection:()=>false,
    credentialPromptTargetFromConnection:()=>{throw Error("SSH prompt reached");},
    buildConnectingTab:(_tabs,connection,connectionStep)=>({id:"logical",ordinal:0,connectionId:connection.id,connectionStep}),
    setTerminalTabs:update=>update(tabs),dispatchTabs:()=>{},
    updateConnectingTabStep:(...args)=>calls.push(args),
    hasTauriRuntime:()=>{throw Error("generic SSH/browser runtime reached");},
  };
  const code=ts.transpileModule(`${declaration("startConnectionStep")}\n${declaration("runConnectionStep")}\nthis.start=startConnectionStep;this.run=runConnectionStep;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  vm.runInNewContext(code,context);
  const connection={id:"rlogin-profile",protocol:"rlogin",credential_mode:"prompt"};
  const tab=context.start(connection,"terminal");
  assert.equal(tab.connectionStep.status,"error");assert.equal(tab.connectionStep.promptTarget,null);
  assert.equal(tab.connectionStep.error,"workspace.rlogin.nativeRequired");assert.equal(calls.length,0);
  await context.run(tab.id,tab.connectionStep);
  assert.equal(calls.length,1);assert.equal(calls[0][1].status,"error");assert.equal(calls[0][1].promptTarget,null);
});

function shell(names,context){
  const code=ts.transpileModule(names.map(declaration).join("\n")+names.map(name=>`\nthis.${name}=${name};`).join(""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  vm.runInNewContext(code,context);return context;
}
const native={id:"native",source:"rlogin",profileId:"saved",sessionId:"private-UUID-trap"};
const ordinary={id:"ordinary",source:"local",sessionId:"public-session"};
function closeFixture(){
  const calls=[];let resolve;let reject;const pending=new Promise((a,b)=>{resolve=a;reject=b;});
  const context={Set,Promise,localTerminalTabsRef:{current:[{...native},{...ordinary}]},
    setLocalTerminalTabs:tabs=>calls.push(["tabs",tabs.map(tab=>tab.id)]),dispatchTabs:event=>calls.push(["dispatch",event]),snapshotFromRefs:snapshot=>snapshot,
    stopTerminalWarmupCapture:id=>calls.push(["warmup",id]),terminalClose:id=>{calls.push(["public-close",id]);return Promise.resolve();},
    rloginSessions:{close:id=>{calls.push(["native-close",id]);return pending;},forget:id=>calls.push(["forget",id])}};
  shell(["closeLocalTerminalTabs","removeLocalTerminalTabs","closeRuntimeTerminalSessions"],context);return {context,calls,resolve,reject};
}
test("real shell close keeps native tab and owner until actual cleanup, while closing ordinary tabs",async()=>{
  const f=closeFixture();const work=f.context.closeLocalTerminalTabs(["native","ordinary"]);
  assert.deepEqual(f.context.localTerminalTabsRef.current.map(tab=>tab.id),["native"]);
  assert.equal(f.calls.filter(call=>call[0]==="forget").length,0);assert.deepEqual(f.calls.filter(call=>call[0]==="public-close"),[["public-close","public-session"]]);
  f.resolve();await work;assert.deepEqual(f.context.localTerminalTabsRef.current,[]);assert.deepEqual(f.calls.filter(call=>call[0]==="forget"),[["forget","native"]]);
  const final=f.calls.filter(call=>call[0]==="dispatch").at(-1)[1];assert.deepEqual(final.snapshot.localTerminalTabs,[]);
});
test("real shell cleanup failure retains the native tab and a retry closes it without public terminal_close",async()=>{
  const f=closeFixture();const work=f.context.closeLocalTerminalTabs(["native"]);f.reject(Error("fixture cleanup"));await work;
  assert.ok(f.context.localTerminalTabsRef.current.some(tab=>tab.id==="native"));assert.equal(f.calls.filter(call=>call[0]==="forget"||call[0]==="public-close").length,0);
  f.context.rloginSessions.close=()=>Promise.resolve();await f.context.closeLocalTerminalTabs(["native"]);assert.deepEqual(f.context.localTerminalTabsRef.current.map(tab=>tab.id),["ordinary"]);
});
test("real shell central close helper refuses native public-ID traps",()=>{
  const f=closeFixture();f.context.closeRuntimeTerminalSessions([native]);assert.equal(f.calls.length,0);
});
test("saved open, new, terminal and split-copy Rlogin route to a native logical instance before SSH or local fallback",()=>{
  const calls=[],connection={id:"saved",protocol:"rlogin"};
  const context={openRloginConnectionSession:c=>calls.push(["open",c.id]),openRloginTerminal:(c,activate)=>{calls.push(["new",c.id,activate]);return {id:"new-native"};},
    localTerminalTabs:[native],connectionById:new Map([["saved",connection]]),
    isRdpConnection:()=>{throw Error("generic routing reached");},isVncConnection:()=>{throw Error("generic routing reached");},
    startConnectionStep:()=>{throw Error("SSH reached");},openLocalTerminalByProfile:()=>{throw Error("local shell fallback reached");}};
  shell(["openConnectionSession","openTerminal","openNewConnectionSessionWithActivation","createSameSessionTerminalBinding"],context);
  context.openConnectionSession(connection);context.openTerminal(connection);
  assert.equal(context.openNewConnectionSessionWithActivation(connection,false).kind,"character");
  assert.equal(context.createSameSessionTerminalBinding({kind:"local",tabId:"native"}).tabId,"new-native");
  assert.deepEqual(calls,[["open","saved"],["open","saved"],["new","saved",false],["new","saved",false]]);
});
test("real shell restore retry requests native consent and never runs local/Telnet/Serial open",()=>{
  const calls=[];const context={localTerminalTabsRef:{current:[native]},connectRloginTab:id=>calls.push(id)};
  shell(["retryRestoredLocalTab"],context);context.retryRestoredLocalTab("native");assert.deepEqual(calls,["native"]);
});
test("real shell privacy sinks explicitly refuse a native tab",()=>{
  const context={localTerminalTabsRef:{current:[native]},macroRecorder:{omitAutomaticHistory:()=>{throw Error("macro reached");}},setTerminalRecentOutputByTabId:()=>{throw Error("AI output reached");},setAiInitialContexts:()=>{throw Error("AI selection reached");}};
  // appendTerminalRecentOutput is a React callback, exercise its actual callback body as well.
  let callback;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==="appendTerminalRecentOutput")callback=node.initializer.arguments[0].getText(tree);ts.forEachChild(node,visit);}visit(tree);assert.ok(callback);
  shell(["sendTerminalSelectionToAi","canRecordTerminalInputHistory","commandHistoryScopeForTerminalTab"],context);
  vm.runInNewContext(ts.transpileModule(`this.append=${callback};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  context.append("native","private-output");context.sendTerminalSelectionToAi("native","private-selection");assert.equal(context.canRecordTerminalInputHistory("native"),false);assert.equal(context.commandHistoryScopeForTerminalTab("native"),null);
});
test("split close waits native completion and preserves the split on native cleanup failure",async()=>{
  const calls=[];const context={localTerminalTabsRef:{current:[native]},closeLocalTerminalTabs:async()=>{calls.push("native-close");},
    requestCancelTransfer:()=>{},removeTerminalSplitPaneLayout:()=>calls.push("remove-pane"),resetTerminalSplitState:()=>calls.push("reset-split"),
    closeRdpSessions:()=>{},closeVncSessions:()=>{},closeConnectionSessions:()=>{},closeTerminalTabs:()=>{}};
  shell(["executeClosePlan"],context);
  context.executeClosePlan({localTabIds:["native"],splitGroup:true,splitPaneIds:["pane"],connectionIds:[],sshTabIds:[],rdpSessionIds:[],vncSessionIds:[]});
  await Promise.resolve();await Promise.resolve();assert.deepEqual(calls,["native-close"]);
});

test("save-and-connect starts the returned Rlogin profile before React publishes its new catalog",()=>{
  const calls=[],connection={id:"just-saved",name:"Fixture",protocol:"rlogin"};
  const context={localTerminalTabsRef:{current:[]},connectionById:new Map(),formatConnectionAddress:()=>"fixture",setLocalTerminalTabs:()=>{},
    buildCharacterTerminalTab:()=>({id:"new-logical",source:"rlogin",profileId:"just-saved"}),activateLocalTerminalTab:()=>{},
    rloginSessions:{connect:(id,profile,size)=>{calls.push([id,profile,size]);return Promise.resolve();}}};
  shell(["openRloginTerminal"],context);context.openRloginTerminal(connection);
  assert.equal(calls.length,1);assert.equal(calls[0][1],connection);assert.equal(calls[0][2].columns,80);assert.equal(context.localTerminalTabsRef.current[0].sessionId,undefined);
});
