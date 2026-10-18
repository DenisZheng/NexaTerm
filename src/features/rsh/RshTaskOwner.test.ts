import {describe,it,expect,vi} from "vitest";
import {RshTaskOwner} from "./RshTaskOwner";
import {RshError,type RshReply} from "./rshTypes";
import {apiFixture,deferred,turn,request,reply,finished} from "./testFixtures";
const renderer=()=>({reset:vi.fn(),append:vi.fn(async()=>{})});
describe("Rsh actual task client lifecycle",()=>{
  it("requires fresh consent, freezes exact command and never exposes it in snapshots",async()=>{
    const api=apiFixture(),owner=new RshTaskOwner(api),sink=renderer(),draft=request();
    await expect(owner.run({...draft,allow_plaintext:false},sink)).rejects.toThrow("rsh_task_consent_required");expect(api.reserve).not.toHaveBeenCalled();
    const run=owner.run(draft,sink);draft.command="mutated";draft.target_address="changed.invalid";await run;
    expect(api.reserve.mock.calls[0][0]).toMatchObject({command:" echo exact\n",target_address:"example.invalid"});
    expect(JSON.stringify(owner.getSnapshot())).not.toContain("exact");expect(JSON.stringify(owner.getSnapshot())).not.toContain("aaaa");
    expect(owner.getSnapshot().phase).toBe("closed");expect(api.reserve).toHaveBeenCalledTimes(1);await turn();expect(api.reserve).toHaveBeenCalledTimes(1);
  });
  it("ACKs exact u64 sequence only after actual renderer completion",async()=>{
    const api=apiFixture(),render=deferred<void>(),sink=renderer();sink.append.mockReturnValueOnce(render.promise);
    api.read.mockResolvedValueOnce(reply({status:{...reply().status,awaiting_ack:true},frame:{sequence:"9007199254740993",stream:"stderr",data:[0,255]}}));
    const owner=new RshTaskOwner(api),run=owner.run(request(),sink);await turn();expect(sink.append).toHaveBeenCalledTimes(1);expect(api.read).toHaveBeenCalledTimes(1);
    render.resolve();await run;expect(api.read.mock.calls[1][1]).toBe("9007199254740993");expect(api.status).not.toHaveBeenCalled();
  });
  it("polls non-consuming status while rendering is paused and distinguishes transport end from output drain",async()=>{
    vi.useFakeTimers();const api=apiFixture(),render=deferred<void>(),sink=renderer();sink.append.mockReturnValueOnce(render.promise);
    api.read.mockResolvedValueOnce(reply({status:{...reply().status,awaiting_ack:true},frame:{sequence:"1",stream:"stdout",data:[1]}}));
    api.status.mockResolvedValue({...finished().status,finished:false,awaiting_ack:true});const owner=new RshTaskOwner(api),run=owner.run(request(),sink);
    try{await turn();await vi.advanceTimersByTimeAsync(250);expect(owner.getSnapshot().phase).toBe("draining");expect(api.read).toHaveBeenCalledTimes(1);
      render.resolve();await run;expect(api.read.mock.calls[1][1]).toBe("1");expect(owner.getSnapshot().phase).toBe("closed");expect(vi.getTimerCount()).toBe(0);
    }finally{render.resolve();vi.useRealTimers();}
  });
  it("late reserve after cancel is closed once without native start",async()=>{
    const api=apiFixture(),reserved=deferred<string>();api.reserve.mockReturnValueOnce(reserved.promise);const owner=new RshTaskOwner(api);
    const run=owner.run(request(),renderer());await turn();let done=false;const close=owner.close().then(()=>{done=true;});await turn();expect(done).toBe(false);
    reserved.resolve("aaaaaaaa-aaaa-4aaa-8aaa-000000000001");await Promise.all([run,close]);expect(api.start).not.toHaveBeenCalled();expect(api.close).toHaveBeenCalledTimes(1);expect(done).toBe(true);
  });
  it("cancel reaches native start immediately but waits start and actual close",async()=>{
    const api=apiFixture(),start=deferred<void>(),closed=deferred<void>();api.start.mockReturnValueOnce(start.promise);api.close.mockReturnValueOnce(closed.promise);
    const owner=new RshTaskOwner(api),run=owner.run(request(),renderer());await turn();let done=false;const cleanup=owner.close().then(()=>{done=true;});await turn();
    expect(api.cancel).toHaveBeenCalledTimes(1);expect(api.close).toHaveBeenCalledTimes(1);closed.resolve();await turn();expect(done).toBe(false);
    start.resolve();await Promise.all([run,cleanup]);expect(api.read).not.toHaveBeenCalled();expect(api.close).toHaveBeenCalledTimes(1);expect(owner.getSnapshot().phase).toBe("closed");
  });
  it("serializes EOF after accepted input and refuses later input",async()=>{
    const api=apiFixture(),read=deferred<RshReply>(),write=deferred<void>();api.read.mockReturnValueOnce(read.promise);api.writeText.mockReturnValueOnce(write.promise);
    const owner=new RshTaskOwner(api),run=owner.run(request(),renderer());await turn();const input=owner.send("exact\n\0");const eof=owner.stdinEof();await turn();
    expect(api.stdinEof).not.toHaveBeenCalled();await expect(owner.send("later")).rejects.toThrow("rsh_stdin_closed");write.resolve();await Promise.all([input,eof]);expect(api.stdinEof).toHaveBeenCalledTimes(1);
    expect(api.writeText.mock.calls[0][1]).toBe("exact\n\0");read.resolve(finished());await run;
  });
  it("signal FIFO is independent and cancel prevents a queued late signal",async()=>{
    const api=apiFixture(),read=deferred<RshReply>(),signal=deferred<void>();api.read.mockReturnValueOnce(read.promise);api.signal.mockReturnValueOnce(signal.promise);
    const owner=new RshTaskOwner(api),run=owner.run(request(),renderer());await turn();const first=owner.signal("interrupt");const second=owner.signal("terminate");void second.catch(()=>undefined);
    await turn();expect(api.signal.mock.calls.map(call=>call[1])).toEqual(["interrupt"]);const close=owner.cancel();signal.resolve();read.resolve(finished());
    await Promise.all([run,close,first]);await expect(second).rejects.toThrow("legacy_socket_cancelled");expect(api.signal).toHaveBeenCalledTimes(1);
  });
  it("retains failed cleanup and retries the same handle only on another close action",async()=>{
    const api=apiFixture();api.start.mockRejectedValueOnce(new RshError("legacy_socket_access_denied"));api.close.mockRejectedValueOnce(Error("private cleanup"));
    const owner=new RshTaskOwner(api);await expect(owner.run(request(),renderer())).rejects.toThrow("rsh_cleanup_failed");expect(owner.getSnapshot().phase).toBe("cleanup_failed");
    await expect(owner.run(request(),renderer())).rejects.toThrow("rsh_task_busy");expect(api.reserve).toHaveBeenCalledTimes(1);expect(api.close).toHaveBeenCalledTimes(1);
    await owner.close();expect(api.close.mock.calls[0][0]).toBe(api.close.mock.calls[1][0]);expect(owner.getSnapshot().phase).toBe("closed");expect(JSON.stringify(owner.getSnapshot())).not.toContain("private");
  });
  it("rejects duplicate delivery and closes the owned handle instead of ACKing new data",async()=>{
    const api=apiFixture(),frame={sequence:"1",stream:"stdout" as const,data:[1]};api.read.mockResolvedValueOnce(reply({status:{...reply().status,awaiting_ack:true},frame})).mockResolvedValueOnce(reply({status:{...reply().status,awaiting_ack:true},frame}));
    const owner=new RshTaskOwner(api),sink=renderer();await expect(owner.run(request(),sink)).rejects.toThrow("rsh_invalid_response");expect(sink.append).toHaveBeenCalledTimes(1);expect(api.close).toHaveBeenCalledTimes(1);
  });
  it("cleanup cancels immediately and waits pending input IPC before acknowledging release",async()=>{
    const api=apiFixture(),read=deferred<RshReply>(),write=deferred<void>();api.read.mockReturnValueOnce(read.promise);api.writeText.mockReturnValueOnce(write.promise);
    const owner=new RshTaskOwner(api),run=owner.run(request(),renderer());await turn();const input=owner.send("private input");const rejected=expect(input).rejects.toThrow("legacy_socket_cancelled");
    let done=false;const close=owner.close().then(()=>{done=true;});read.resolve(finished());await turn();expect(api.close).toHaveBeenCalledTimes(1);expect(done).toBe(false);
    write.resolve();await Promise.all([run,close,rejected]);expect(done).toBe(true);
  });
  it("explicit rerun creates one new generation and never derives an exit code",async()=>{
    const api=apiFixture(),owner=new RshTaskOwner(api);await owner.run(request(),renderer());await owner.run(request(),renderer());
    expect(api.reserve).toHaveBeenCalledTimes(2);expect(owner.getSnapshot().generation).toBe(2);expect(owner.getSnapshot().status?.remote_exit_code).toBeNull();
  });
});
