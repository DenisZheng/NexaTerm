// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TerminalPanel } from "./TerminalPanel";
import { RloginBridge } from "./rloginBridge";
import { RloginTerminalController } from "./rloginTerminalController";
import { defaultAdvancedConfig } from "../connections/connectionTypes";
interface FakeTerminal {
  write:ReturnType<typeof vi.fn>; dispose:ReturnType<typeof vi.fn>;
  data?: (data:string)=>void; binary?: (data:string)=>void; resize?: (size:{cols:number;rows:number})=>void;
  key?: (event:KeyboardEvent)=>boolean;
}
const mocks=vi.hoisted(()=>({terminals:[] as FakeTerminal[],connect:vi.fn(),write:vi.fn(),resize:vi.fn(),close:vi.fn(),events:vi.fn(),queue:vi.fn()}));
vi.mock("@xterm/xterm",()=>({Terminal:class {
  options:Record<string,unknown>;cols=92;rows=28;unicode={activeVersion:"6"};
  data?:FakeTerminal["data"];binary?:FakeTerminal["binary"];resize?:FakeTerminal["resize"];key?:FakeTerminal["key"];
  write=vi.fn();writeln=vi.fn();dispose=vi.fn();clear=vi.fn();focus=vi.fn();scrollToBottom=vi.fn();
  constructor(options:Record<string,unknown>){this.options=options;mocks.terminals.push(this);}
  open(){}loadAddon(){}hasSelection(){return false;}getSelection(){return "";}selectAll(){}
  paste(data:string){this.data?.(data);}
  attachCustomKeyEventHandler(callback:NonNullable<FakeTerminal["key"]>){this.key=callback;}
  onData(callback:NonNullable<FakeTerminal["data"]>){this.data=callback;return {dispose:vi.fn()};}
  onBinary(callback:NonNullable<FakeTerminal["binary"]>){this.binary=callback;return {dispose:vi.fn()};}
  onResize(callback:NonNullable<FakeTerminal["resize"]>){this.resize=callback;return {dispose:vi.fn()};}
}}));
vi.mock("@xterm/addon-fit",()=>({FitAddon:class {fit=vi.fn();}}));
vi.mock("@xterm/addon-search",()=>({SearchAddon:class {}}));
vi.mock("@xterm/addon-unicode11",()=>({Unicode11Addon:class {}}));
vi.mock("@xterm/addon-web-links",()=>({WebLinksAddon:class {}}));
vi.mock("../../shared/tauri/runtime",()=>({hasTauriRuntime:()=>true}));
vi.mock("../../shared/tauri/commands",()=>({terminalConnect:mocks.connect,terminalWrite:mocks.write,terminalResize:mocks.resize,terminalClose:mocks.close}));
vi.mock("../../shared/tauri/events",()=>({listenTerminalOutput:mocks.events,listenTerminalStateChanged:mocks.events,listenTerminalConnectProgress:mocks.events}));
vi.mock("./terminalOutputFlow",()=>({TerminalOutputQueue:class {constructor(){mocks.queue();throw Error("public output queue reached");}},createTerminalOutputSchedule:vi.fn()}));
vi.mock("./TerminalLogControls",()=>({TerminalLogControls:({supported,sessionId}:{supported:boolean;sessionId:string|null})=><span data-testid="log-policy">{String(supported)}:{sessionId??"none"}</span>}));
vi.mock("./terminalSemanticHighlight",async importOriginal=>({...await importOriginal<typeof import("./terminalSemanticHighlight")>(),createTerminalSemanticHighlighter:()=>({dispose:vi.fn(),setPalette:vi.fn(),setRules:vi.fn()})}));
vi.mock("./terminalSearchController",async importOriginal=>({...await importOriginal<typeof import("./terminalSearchController")>(),createTerminalSearchController:()=>({dispose:vi.fn(),configure:vi.fn(),navigate:vi.fn()})}));
const controllers:RloginTerminalController[]=[];
beforeEach(()=>{vi.clearAllMocks();mocks.terminals.length=0;vi.stubGlobal("ResizeObserver",class {observe(){}disconnect(){}unobserve(){}});});
afterEach(async()=>{cleanup();for(const controller of controllers.splice(0))await controller.close();vi.unstubAllGlobals();});
async function turn(){for(let i=0;i<24;i++)await Promise.resolve();}
function fixture(){
  const client={read:vi.fn().mockResolvedValue({epoch:"0",phase:"initial_exchange_ready",reason:null,awaiting_ack:false,finished:false,requires_reset:false,frame:null}),write:vi.fn().mockResolvedValue(undefined),writeText:vi.fn().mockResolvedValue(undefined),resize:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined)};
  const controller=new RloginTerminalController(new RloginBridge("cccccccc-cccc-4ccc-8ccc-000000000001",client),"utf-8");controllers.push(controller);
  const hooks={onStatusChange:vi.fn(),onRecentOutput:vi.fn(),onCurrentDirectoryChange:vi.fn(),onPromptDirectorySnapshotChange:vi.fn(),onTerminalInputCommand:vi.fn(),canRecordTerminalInputHistory:vi.fn(),onUserInput:vi.fn(),onSessionIdChange:vi.fn(),onWarmupCaptureReady:vi.fn(),onSendSelectionToAi:vi.fn()};
  // Deliberately supply generic props: the private branch must still reject all public routing.
  const props={active:true,autoConnect:true,logSupported:true,tabId:"logical-instance",title:"Rlogin",fontFamily:"monospace",fontSize:13,theme:{},initialSessionId:"public-session-trap",initialRequestId:"public-request-trap",initialOutput:[83,69,67,82,69,84],connection:{id:"profile-trap",name:"Fixture",protocol:"ssh" as const,host:"example.invalid",port:22,username:"test",credential_mode:"prompt" as const,proxy:{kind:"none" as const},jump:{kind:"none" as const},advanced:{...defaultAdvancedConfig},is_favorite:false,created_at:"t",updated_at:"t"},rlogin:{controller,inputAvailable:()=>true},...hooks};
  return {client,controller,hooks,props};
}
describe("actual TerminalPanel private Rlogin branch",()=>{
  it("uses direct parser credit and never creates public output/listeners/history/log/provider routes",async()=>{
    const f=fixture(),view=render(<TerminalPanel {...f.props}/>);await act(turn);
    expect(mocks.terminals).toHaveLength(1);const terminal=mocks.terminals[0];
    expect(screen.queryByTestId("log-policy")).toBeNull();expect(terminal.write).not.toHaveBeenCalled();
    f.client.read.mockResolvedValueOnce({epoch:"0",phase:"initial_exchange_ready",reason:null,awaiting_ack:true,finished:false,requires_reset:false,frame:{epoch:"0",sequence:"1",data:[65]}});
    await act(()=>f.controller.tick());expect(terminal.write.mock.calls[0][0]).toBe("A");expect(f.controller.snapshot().frame).toBe("writing");
    await act(async()=>{terminal.data?.("~.\r中");terminal.binary?.("\0\x80\xff");await turn();});
    expect(f.client.writeText.mock.calls[0][0].data).toBe("~.\r中");expect(f.client.write.mock.calls[0][0].data).toEqual([0,128,255]);
    for(const hook of Object.values(f.hooks))expect(hook).not.toHaveBeenCalled();
    for(const call of [mocks.connect,mocks.write,mocks.resize,mocks.close,mocks.events,mocks.queue])expect(call).not.toHaveBeenCalled();
    view.unmount();expect(terminal.dispose).toHaveBeenCalledTimes(1);expect(f.client.close).not.toHaveBeenCalled();expect(f.controller.snapshot()).toMatchObject({attached:false,awaitingAck:true});
    terminal.write.mock.calls[0][1]();expect(f.controller.snapshot().awaitingAck).toBe(true);
  });
  it("routes Ctrl+V control mode and resize only to the dedicated controller",async()=>{
    const f=fixture();render(<TerminalPanel {...f.props} ctrlVPaste={false}/>);await act(turn);const terminal=mocks.terminals[0];
    await act(async()=>{terminal.key?.(new KeyboardEvent("keydown",{key:"v",ctrlKey:true,cancelable:true}));terminal.resize?.({cols:100,rows:40});await turn();});
    expect(f.client.writeText.mock.lastCall?.[0].data).toBe("\x16");expect(f.client.resize.mock.lastCall?.[0].window).toMatchObject({columns:100,rows:40});
    expect(mocks.write).not.toHaveBeenCalled();expect(mocks.resize).not.toHaveBeenCalled();
  });
  it("contains failed renderer attachment as a fixed visible error without entering public IO",async()=>{
    const f=fixture();await f.controller.close();render(<TerminalPanel {...f.props}/>);await act(turn);
    expect(screen.getByRole("alert").textContent).not.toContain("private");expect(screen.getByRole("alert").textContent).toContain("rlogin_terminal_renderer_failed");
    expect(mocks.terminals[0].dispose).toHaveBeenCalledTimes(1);for(const call of [mocks.connect,mocks.write,mocks.resize,mocks.close,mocks.events,mocks.queue])expect(call).not.toHaveBeenCalled();
  });

});
