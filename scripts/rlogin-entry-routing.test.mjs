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
