// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RloginTerminalPane from "./RloginTerminalPane";
import type { RloginOwnedAttempt, RloginWorkspaceSnapshot } from "../layout/rloginWorkspaceSessions";
import type { RloginAttemptPhase } from "./rloginAttemptOwner";
import type { RloginTerminalController } from "./rloginTerminalController";
import type { TerminalPanelProps } from "./TerminalPanel";
import { t } from "../../shared/i18n";
const calls=vi.hoisted(()=>({panels:[] as TerminalPanelProps[]}));
vi.mock("./TerminalPanel",()=>({TerminalPanel:(props:TerminalPanelProps)=>{calls.panels.push(props);return <div data-testid="private-panel">{props.rloginHeader}</div>;}}));
afterEach(()=>{cleanup();calls.panels.length=0;});
function fixture(phase:RloginAttemptPhase="initial_exchange_ready"){
 const controller={} as RloginTerminalController;
 let current:RloginTerminalController|null=controller;
 const snapshot={generation:1,phase,reason:null,closeIntent:false} satisfies RloginWorkspaceSnapshot;
 const owner={getController:()=>current,getSnapshot:()=>snapshot,connect:vi.fn(),cancel:vi.fn(),close:vi.fn(),subscribe:vi.fn()} satisfies RloginOwnedAttempt;
 const callbacks={onConnect:vi.fn(),onCancel:vi.fn(),onClose:vi.fn()};
 return {controller,owner,snapshot,callbacks,setController:(value:RloginTerminalController|null)=>{current=value;},props:{tabId:"logical",title:"Fixture",owner,snapshot,profileAvailable:true,appearance:{active:true,fontFamily:"monospace",fontSize:13,theme:{}},...callbacks}};
}
describe("mounted Rlogin pane state and actions",()=>{
 it("keeps a pre-ACK controller off the terminal and offers cancellation",()=>{
  const f=fixture("starting");render(<RloginTerminalPane {...f.props}/>);expect(screen.queryByTestId("private-panel")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:t("workspace.rlogin.cancelConnect")}));expect(f.callbacks.onCancel).toHaveBeenCalledTimes(1);expect(calls.panels).toHaveLength(0);
 });
 it("binds only private IO after ACK and gates a stale adapter when the owner changes generation",()=>{
  const f=fixture();render(<RloginTerminalPane {...f.props}/>);const props=calls.panels[calls.panels.length-1]!;
  expect(props.connection).toBeNull();expect(props.initialSessionId).toBe("");expect(props.autoConnect).toBe(false);expect(props.logSupported).toBe(false);
  expect(props.rlogin?.inputAvailable()).toBe(true);expect(props.onRecentOutput).toBeUndefined();expect(props.onTerminalInputCommand).toBeUndefined();expect(props.onUserInput).toBeUndefined();
  fireEvent.click(screen.getByRole("button",{name:t("workspace.rlogin.reconnect")}));expect(f.callbacks.onConnect).toHaveBeenCalledTimes(1);
  f.setController(null);expect(props.rlogin?.inputAvailable()).toBe(false);
 });
 it("retains the rendered terminal after EOF while disabling input and allowing explicit reconnect",()=>{
  const f=fixture(),view=render(<RloginTerminalPane {...f.props}/>);f.snapshot.phase="closed";
  view.rerender(<RloginTerminalPane {...f.props} snapshot={{...f.snapshot}}/>);expect(screen.getByTestId("private-panel")).toBeTruthy();expect(calls.panels[calls.panels.length-1]!.rlogin?.inputAvailable()).toBe(false);
  view.unmount();expect(f.owner.close).not.toHaveBeenCalled();
 });
 it("retains cleanup failure with retry-close and excludes reconnect",()=>{
  const f=fixture("cleanup_failed");render(<RloginTerminalPane {...f.props} snapshot={{...f.snapshot,closeIntent:true,reason:"rlogin_attempt_cleanup_failed"}}/>);
  expect(screen.queryByRole("button",{name:t("workspace.rlogin.reconnect")})).toBeNull();fireEvent.click(screen.getByRole("button",{name:t("workspace.rlogin.retryClose")}));expect(f.callbacks.onClose).toHaveBeenCalledTimes(1);
 });
 it("restores without a provider or automatic connect and keeps a deleted profile closable",()=>{
  const f=fixture(),view=render(<RloginTerminalPane {...f.props} owner={null} snapshot={null}/>);expect(f.callbacks.onConnect).not.toHaveBeenCalled();
  expect(screen.getByRole("button",{name:t("workspace.rlogin.connect")})).toBeTruthy();view.rerender(<RloginTerminalPane {...f.props} owner={null} snapshot={null} profileAvailable={false}/>);
  expect(screen.queryByRole("button",{name:t("workspace.rlogin.connect")})).toBeNull();fireEvent.click(screen.getByRole("button",{name:t("workspace.tabs.close")}));expect(f.callbacks.onClose).toHaveBeenCalledTimes(1);
 });
});
