// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../../shared/i18n";
import { RloginConsentDialog } from "./RloginConsentDialog";
import { RloginConsentQueue } from "./rloginConsentQueue";
import type { RloginTarget } from "../terminal/rloginAttemptOwner";
const queues:RloginConsentQueue[]=[];
afterEach(()=>{cleanup();for(const queue of queues.splice(0))queue.dispose();});
const target=(host:string):RloginTarget=>Object.freeze({local_address:"127.0.0.1",target_address:host,port:513,local_user:"LocalCase",remote_user:"RemoteCase",terminal:"vt100",speed:9600,terminal_encoding:"big5",window:Object.freeze({rows:24,columns:80})});
describe("actual shared Rlogin this-run dialog",()=>{
  it("keeps the next target pending after an older ConfirmDialog completes asynchronously",async()=>{
    const queue=new RloginConsentQueue();queues.push(queue);render(<RloginConsentDialog queue={queue}/>);expect(screen.queryByRole("dialog")).toBeNull();
    let first!:Promise<boolean>,second!:Promise<boolean>;
    act(()=>{first=queue.request(target("192.0.2.1"),new AbortController().signal);second=queue.request(target("192.0.2.2"),new AbortController().signal);});
    expect(screen.getByRole("dialog").textContent).toContain("RemoteCase@192.0.2.1:513");
    expect(screen.getByRole("dialog").textContent).toContain("LocalCase");expect(screen.getByRole("dialog").textContent).toContain("big5");
    await act(async()=>{fireEvent.click(screen.getByRole("button",{name:t("workspace.rlogin.allowOnce")}));await first;});
    expect(await first).toBe(true);expect(screen.getByRole("dialog").textContent).toContain("RemoteCase@192.0.2.2:513");
    let secondSettled=false;void second.then(()=>{secondSettled=true;});await act(async()=>{await Promise.resolve();});expect(secondSettled).toBe(false);
    await act(async()=>{fireEvent.click(screen.getByRole("button",{name:t("common.cancel")}));await second;});expect(await second).toBe(false);expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("abort removes only its visible target and Escape declines the next one",async()=>{
    const queue=new RloginConsentQueue();queues.push(queue);const signal=new AbortController();render(<RloginConsentDialog queue={queue}/>);
    let first!:Promise<boolean>,second!:Promise<boolean>;act(()=>{first=queue.request(target("192.0.2.1"),signal.signal);second=queue.request(target("192.0.2.2"),new AbortController().signal);});
    act(()=>signal.abort());expect(await first).toBe(false);expect(screen.getByRole("dialog").textContent).toContain("192.0.2.2");
    fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape",code:"Escape"});await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(await second).toBe(false);
  });
});
