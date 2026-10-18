import {describe,it,expect} from "vitest";
import {RshWorkspaceSessions} from "./rshWorkspaceSessions";
import {RshTaskOwner} from "../rsh/RshTaskOwner";
import {RshOutputBuffer} from "../rsh/RshOutputBuffer";
import {apiFixture,deferred,turn,request} from "../rsh/testFixtures";
import {RshError} from "../rsh/rshTypes";
describe("Rsh workspace ownership",()=>{
  it("waits a late lazy module without starting a command and cannot recreate a forgotten task",async()=>{
    const api=apiFixture(),session={owner:new RshTaskOwner(api),output:new RshOutputBuffer()},loaded=deferred<{createRshTask:()=>typeof session}>();
    const sessions=new RshWorkspaceSessions(()=>loaded.promise);sessions.open("one");let done=false;const close=sessions.close("one").then(()=>{done=true;});await turn();expect(done).toBe(false);
    loaded.resolve({createRshTask:()=>session});await close;sessions.forget("one");await expect(sessions.get("one")).rejects.toThrow("rsh_task_expired");expect(api.reserve).not.toHaveBeenCalled();
  });
  it("retains an owner on cleanup failure and removes it only after a successful explicit retry",async()=>{
    const api=apiFixture();api.start.mockRejectedValue(new RshError("legacy_socket_access_denied"));api.close.mockRejectedValue(Error("private"));
    const session={owner:new RshTaskOwner(api),output:new RshOutputBuffer()},sessions=new RshWorkspaceSessions(async()=>({createRshTask:()=>session}));sessions.open("one");
    await expect(session.owner.run(request(),session.output)).rejects.toThrow("rsh_cleanup_failed");await expect(sessions.close("one")).rejects.toThrow("rsh_cleanup_failed");
    expect(()=>sessions.forget("one")).toThrow();expect(await sessions.get("one")).toBe(session);api.close.mockResolvedValue(undefined);await sessions.close("one");sessions.forget("one");
  });
});
