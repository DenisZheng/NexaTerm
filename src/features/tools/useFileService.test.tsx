// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFileService } from "./useFileService";
import { fileServiceAudit, fileServiceReserve, fileServiceStart, fileServiceStatus, fileServiceStop } from "../../shared/tauri/commands";
import type { FileServiceStatus } from "./fileServiceTypes";
vi.mock("../../shared/tauri/commands", () => ({fileServiceAudit:vi.fn(),fileServiceReserve:vi.fn(),fileServiceStart:vi.fn(),fileServiceStatus:vi.fn(),fileServiceStop:vi.fn()}));
const status: FileServiceStatus = {id:"first",phase:"running",port:8080,size:12};
const started = {status,token:"a".repeat(43)};
function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>{resolve=r}); return {promise,resolve}; }
beforeEach(()=>{vi.resetAllMocks();vi.mocked(fileServiceStatus).mockResolvedValue(null);vi.mocked(fileServiceReserve).mockResolvedValue("first");vi.mocked(fileServiceStart).mockResolvedValue(started);vi.mocked(fileServiceStop).mockResolvedValue();vi.mocked(fileServiceAudit).mockResolvedValue([]);});
afterEach(()=>{cleanup();vi.useRealTimers();});
it("starts only explicitly and pins file/port before reserve; duplicate click is ignored",async()=>{
 const reserve=deferred<string>();vi.mocked(fileServiceReserve).mockReturnValue(reserve.promise);
 const f=renderHook(()=>useFileService(true));expect(fileServiceStart).not.toHaveBeenCalled();let work!:Promise<void>;
 act(()=>{work=f.result.current.start("/private/file",8090);void f.result.current.start("/other",9999)});
 await act(async()=>{reserve.resolve("first");await work;});
 expect(fileServiceReserve).toHaveBeenCalledTimes(1);expect(fileServiceStart).toHaveBeenCalledWith("first","/private/file",8090);
 expect(f.result.current.token).toBe(started.token);expect(f.result.current.phase).toBe("running");
});
it("cancel before reserve response stops the late reservation without starting IO",async()=>{
 const reserve=deferred<string>();vi.mocked(fileServiceReserve).mockReturnValue(reserve.promise);
 const f=renderHook(()=>useFileService(true));let work!:Promise<void>;
 act(()=>{work=f.result.current.start("/file",0)});
 await act(async()=>{await f.result.current.stop();reserve.resolve("first");await work;});
 expect(fileServiceStart).not.toHaveBeenCalled();expect(fileServiceStop).toHaveBeenCalledWith("first");expect(f.result.current.phase).toBe("idle");
});
it("unmount releases a late reserve and does not start the server",async()=>{
 const reserve=deferred<string>();vi.mocked(fileServiceReserve).mockReturnValue(reserve.promise);
 const f=renderHook(()=>useFileService(true));let work!:Promise<void>;act(()=>{work=f.result.current.start("/file",0)});f.unmount();
 await act(async()=>{reserve.resolve("first");await work;});expect(fileServiceStart).not.toHaveBeenCalled();expect(fileServiceStop).toHaveBeenCalledWith("first");
});
it("late start cannot restore a token after stop and retry",async()=>{
 const late=deferred<typeof started>();vi.mocked(fileServiceStart).mockReturnValueOnce(late.promise).mockResolvedValueOnce({status:{...status,id:"second",port:8081},token:"b".repeat(43)});
 vi.mocked(fileServiceReserve).mockResolvedValueOnce("first").mockResolvedValueOnce("second");
 const f=renderHook(()=>useFileService(true));let work!:Promise<void>;
 await act(async()=>{work=f.result.current.start("/file",0);await Promise.resolve();});
 await act(async()=>{await f.result.current.stop();await f.result.current.start("/next",0);late.resolve(started);await work;});
 expect(f.result.current.status?.id).toBe("second");expect(f.result.current.token).toBe("b".repeat(43));expect(fileServiceStop).toHaveBeenCalledWith("first");
});
it("stop failure keeps ownership, status and retryable stop until confirmation",async()=>{
 const f=renderHook(()=>useFileService(true));await act(async()=>{await f.result.current.start("/file",0)});
 vi.mocked(fileServiceStop).mockRejectedValueOnce({code:"file_service_stop_pending",message:"private"});
 await act(async()=>{await f.result.current.stop();});expect(f.result.current.error).toBe("stop_pending");expect(f.result.current.busy).toBe(true);expect(f.result.current.status?.id).toBe("first");
 await act(async()=>{await f.result.current.stop();});expect(f.result.current.status).toBeNull();expect(f.result.current.token).toBeNull();expect(f.result.current.busy).toBe(false);
});
it("adopts existing status without token or implicit stop on unmount",async()=>{
 vi.mocked(fileServiceStatus).mockResolvedValue(status);const f=renderHook(()=>useFileService(true));await act(async()=>{await Promise.resolve()});
 expect(f.result.current.status).toEqual(status);expect(f.result.current.token).toBeNull();f.unmount();expect(fileServiceStop).not.toHaveBeenCalled();
});
it("leaving the initiating panel stops owned service and clears token",async()=>{
 const f=renderHook(({active})=>useFileService(active),{initialProps:{active:true}});await act(async()=>{await f.result.current.start("/file",0)});
 f.rerender({active:false});await act(async()=>{await Promise.resolve()});expect(fileServiceStop).toHaveBeenCalledWith("first");expect(f.result.current.token).toBeNull();
});
it("status expiry clears running service and stale reads cannot replace a retry",async()=>{
 vi.useFakeTimers();const late=deferred<FileServiceStatus|null>();
 const f=renderHook(()=>useFileService(true));await act(async()=>{await f.result.current.start("/file",0)});
 vi.mocked(fileServiceStatus).mockReturnValueOnce(late.promise);
 await act(async()=>{await vi.advanceTimersByTimeAsync(2000)});
 await act(async()=>{await f.result.current.stop();vi.mocked(fileServiceReserve).mockResolvedValue("second");vi.mocked(fileServiceStart).mockResolvedValue({...started,status:{...status,id:"second"}});await f.result.current.start("/next",0);late.resolve(status);});
 expect(f.result.current.status?.id).toBe("second");
 await act(async()=>{await vi.advanceTimersByTimeAsync(2000)});expect(f.result.current.token).toBeNull();expect(f.result.current.phase).toBe("idle");
});
it("start error exposes a fixed code and can retry without retaining private paths",async()=>{
 vi.mocked(fileServiceStart).mockRejectedValueOnce({code:"file_service_port_in_use",message:"secret path"});
 const f=renderHook(()=>useFileService(true));await act(async()=>{await f.result.current.start("/file",8080)});
 expect(f.result.current.error).toBe("port_in_use");expect(f.result.current.busy).toBe(false);
 await act(async()=>{await f.result.current.start("/file",0)});expect(f.result.current.phase).toBe("running");
});
