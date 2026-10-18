import {describe,it,expect} from "vitest";
import {buildWorkspaceShellHydration} from "./shellHydration";
import {toSnapshot} from "./snapshotTypes";
import {buildMultiExecTargets} from "../multiExec/targets";
import {buildWorkspaceActionContext} from "../../layout/workspaceActionContext";
import {buildOpenSessionEntries} from "../../layout/sessionNavigation";
import {selectWorkspaceItems} from "../sessionTabs/instances";
import {translate} from "../../../shared/i18n";
const task={id:"task",source:"rsh" as const,profileId:"rsh-task",ordinal:0,title:"Rsh",sessionId:"private-handle",command:"private-command",output:[83,69,67],allow_plaintext:true};
const collections={localTerminalTabs:[task],terminalTabs:[],rdpSessions:[],vncSessions:[]};
describe("Rsh command privacy and non-PTY integration",()=>{
  it("omits the entire transient task from snapshots and never broadcasts it",()=>{
    const saved=toSnapshot({activeItemId:"local:task",order:["local:task"],sidebar:{collapsed:false,view:"sessions"},files:{directories:{},followActivePane:true},splitLayout:null},collections);
    expect(saved.instances).toEqual([]);expect(saved.order).toEqual([]);expect(saved.activeItemId).toBeNull();expect(buildWorkspaceShellHydration(saved).active.kind).toBe("home");
    for(const value of ["rsh-task","private-handle","private-command","allow_plaintext"])expect(JSON.stringify(saved)).not.toContain(value);
    expect(buildMultiExecTargets({localTabs:[task],sshTabs:[]})).toEqual([]);
  });
  it("keeps its own closable workspace instance without a saved connection or terminal actions",()=>{
    const items=selectWorkspaceItems(collections,[],null);expect(items).toHaveLength(2);
    expect(buildOpenSessionEntries(items,{connectionAddress:()=>null,connectionName:()=>null,localProfileName:()=>null},key=>translate("en",key))).toEqual([]);
    const context=buildWorkspaceActionContext({...collections,workspaceVisible:true,activeItemId:"local:task",activePaneId:null,workspaceItems:items,splitPanes:[],terminalSearchByTabId:{},commandSenderTargetCount:0,canSplitTerminal:true});
    expect(context.instances.find(item=>item.id==="local:task")).toMatchObject({canCreateTerminal:false,canSearch:false,canSplit:false});
  });
});
