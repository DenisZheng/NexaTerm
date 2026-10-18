import {describe,it,expect} from "vitest";
import {validateDraft,validDestination,validIpv4} from "./rshDraft";
import {request} from "./testFixtures";
describe("Rsh exact transient form",()=>{
  it("validates without trimming command or sharing SSH identity",()=>{const draft=request();expect(validateDraft(draft)).toEqual({});expect(draft.command).toBe(" echo exact\n");expect(validateDraft({...draft,allow_plaintext:false})).toHaveProperty("allow_plaintext");});
  it.each(["127.1","0127.0.0.1","0x7f000001","0x7f.0.0.1","host:514","https://host","::1","bad host","中.example",".","a..b"])("refuses ambiguous destination %s",host=>{expect(validDestination(host)).toBe(false);});
  it.each(["localhost","Desktop.Example.invalid.","host-1","1host.example"])("supports explicit ASCII host %s",host=>{expect(validDestination(host)).toBe(true);});
  it("requires a valid numeric local interface and byte-aware user/command bounds",()=>{
    expect(validIpv4("localhost")).toBe(false);expect(validIpv4("0.0.0.0")).toBe(false);expect(validIpv4("224.0.0.1")).toBe(false);
    expect(validateDraft({...request(),remote_user:"中".repeat(6),command:"x\0y",run_timeout_seconds:86401,port:0})).toMatchObject({remote_user:"rsh.invalidUser",command:"rsh.invalidCommand",port:"rsh.invalidNumber",run_timeout_seconds:"rsh.invalidNumber"});
  });
});
