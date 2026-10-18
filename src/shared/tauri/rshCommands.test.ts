import {beforeEach,describe,it,expect,vi} from "vitest";
const {invoke}=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock("@tauri-apps/api/core",()=>({invoke}));
import {rshApi} from "./rshCommands";
import {request,reply} from "../../features/rsh/testFixtures";
beforeEach(()=>invoke.mockReset());
describe("Rsh actual typed command bridge",()=>{
  it("uses exact nested reserve fields and a canonical returned ID",async()=>{
    const draft=request();invoke.mockResolvedValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-000000000001");
    await rshApi.reserve(draft);expect(invoke).toHaveBeenCalledExactlyOnceWith("rsh_reserve",{request:draft});
  });
  it("keeps top-level camelCase IDs and nested snake_case fields and exact u64 ACK",async()=>{
    invoke.mockResolvedValue(undefined);await rshApi.start("run");await rshApi.stdinEof("run");await rshApi.signal("run","interrupt");
    expect(invoke.mock.calls.slice(0,3)).toEqual([["rsh_start",{reservationId:"run"}],["rsh_stdin_eof",{reservationId:"run"}],["rsh_signal",{request:{reservation_id:"run",signal:"interrupt"}}]]);
    invoke.mockResolvedValueOnce(reply());await rshApi.read("run","9007199254740993");expect(invoke).toHaveBeenLastCalledWith("rsh_read",{request:{reservation_id:"run",ack:"9007199254740993"}});
  });
  it("rejects invented success and sanitizes backend/OS text",async()=>{
    invoke.mockResolvedValueOnce({...reply(),status:{...reply().status,remote_exit_code:0}});await expect(rshApi.read("run",null)).rejects.toThrow("rsh_invalid_response");
    invoke.mockRejectedValueOnce({code:"private remote command",message:"private"});await expect(rshApi.start("run")).rejects.toThrow("rsh_task_unavailable");
  });
});
