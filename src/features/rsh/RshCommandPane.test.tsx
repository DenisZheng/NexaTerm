// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import RshCommandPane from "./RshCommandPane";
import {RshTaskOwner} from "./RshTaskOwner";
import {RshOutputBuffer} from "./RshOutputBuffer";
import {RshWorkspaceSessions} from "../layout/rshWorkspaceSessions";
import {setLocalePreference} from "../../shared/i18n";
import {apiFixture,reply,finished} from "./testFixtures";
afterEach(cleanup);
function fixture(){setLocalePreference("en");const api=apiFixture(),session={owner:new RshTaskOwner(api),output:new RshOutputBuffer()};
  const sessions=new RshWorkspaceSessions(async()=>({createRshTask:()=>session}));sessions.open("task");const state=vi.fn();
  render(<RshCommandPane tabId="task" title="Rsh task" active sessions={sessions} onClose={vi.fn()} onState={state}/>);return {api,session,sessions,state};
}
async function fill(){await screen.findByLabelText("Target hostname / IPv4");for(const[label,value]of [["Target hostname / IPv4","example.invalid"],["Local IPv4 interface","127.0.0.1"],["Local username","local"],["Remote username","remote"],["Remote command (sent exactly)"," echo exact\n"]])fireEvent.change(screen.getByLabelText(label),{target:{value}});}
describe("actual Rsh command pane",()=>{
  it("focuses linked validation errors and never runs without per-command permission",async()=>{
    const f=fixture();await fill();fireEvent.click(screen.getByRole("button",{name:"Run once"}));
    const summary=screen.getByRole("alert");expect(summary).toBe(document.activeElement);expect(f.api.reserve).not.toHaveBeenCalled();
    const permit=screen.getByLabelText(/I understand this is plaintext/);fireEvent.click(permit);fireEvent.click(screen.getByRole("button",{name:"Run once"}));
    await waitFor(()=>expect(f.api.reserve).toHaveBeenCalledTimes(1));await waitFor(()=>expect((screen.getByRole("button",{name:"Run again"}) as HTMLButtonElement).disabled).toBe(false));
    expect((permit as HTMLInputElement).checked).toBe(false);expect(f.api.reserve.mock.calls[0][0].command).toBe(" echo exact\n");
    fireEvent.click(screen.getByRole("button",{name:"Run again"}));await waitFor(()=>expect(f.api.reserve).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(f.state.mock.calls)).not.toContain("exact");expect(JSON.stringify(f.state.mock.calls)).not.toContain("aaaa");await act(()=>f.sessions.dispose());
  });
  it("renders independent output before returning its exact ACK and requires new consent after edits",async()=>{
    const f=fixture();f.api.read.mockResolvedValueOnce(reply({status:{...reply().status,awaiting_ack:true},frame:{sequence:"9007199254740993",stream:"stderr",data:[101,114,114]}})).mockResolvedValueOnce(finished());
    await fill();const permit=screen.getByLabelText(/I understand this is plaintext/);fireEvent.click(permit);
    fireEvent.change(screen.getByLabelText("Remote command (sent exactly)"),{target:{value:"echo changed"}});expect((permit as HTMLInputElement).checked).toBe(false);
    fireEvent.click(permit);fireEvent.click(screen.getByRole("button",{name:"Run once"}));
    await waitFor(()=>expect(screen.getByLabelText("stderr text").textContent).toBe("err"));await waitFor(()=>expect(f.api.read.mock.calls[1][1]).toBe("9007199254740993"));
    expect(screen.getByText(/Remote exit code: unknown/)).toBeTruthy();await act(()=>f.sessions.dispose());
  });
});
