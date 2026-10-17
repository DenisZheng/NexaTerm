import { describe, expect, it } from "vitest";
import type { ConnectionTerminalEncoding } from "../connections/connectionTypes";
import { RloginDecoder } from "./rloginDecoder";
const cases:[ConnectionTerminalEncoding,number[],string][]=[
  ["utf-8",[0xe4,0xb8,0xad],"中"],["gbk",[0xd6,0xd0],"中"],["gb18030",[0x94,0x39,0xfc,0x36],"😀"],
  ["big5",[0xa4,0xa4],"中"],["euc-jp",[0xa4,0xa2],"あ"],
  ["iso-2022-jp",[27,36,66,36,34,27,40,66],"あ"],["shift-jis",[0x82,0xa0],"あ"],["euc-kr",[0xb0,0xa1],"가"],
];
describe("Rlogin incremental output decoder",() => {
  it.each(cases)("preserves %s across every possible frame boundary",(label,bytes,text) => {
    for (let split=0;split<=bytes.length;split++) {
      const decoder=new RloginDecoder(label);
      expect(decoder.decode(Uint8Array.from(bytes.slice(0,split)))+decoder.decode(Uint8Array.from(bytes.slice(split)))+decoder.finish()).toBe(text);
    }
  });
  it.each(cases)("preserves terminal control bytes under %s",(label) => {
    const decoder=new RloginDecoder(label), text="\0\r\n\x7f\x03\x1b[31mred\x1b[0m";
    expect(decoder.decode(new TextEncoder().encode(text))+decoder.finish()).toBe(text);
  });
  it("keeps BOM visible and finalizes exactly once",() => {
    const decoder=new RloginDecoder("utf-8");
    expect(decoder.decode(Uint8Array.of(0xef,0xbb))).toBe("");
    expect(decoder.decode(Uint8Array.of(0xbf,65))).toBe("\ufeffA");
    expect(decoder.finish()).toBe(""); expect(decoder.finish()).toBe("");
    expect(() => decoder.decode(Uint8Array.of(1))).toThrow("rlogin_terminal_closed");
  });
  it("rejects invalid bytes and a truncated EOF suffix without replacement or raw detail",() => {
    const invalid=new RloginDecoder("utf-8"); expect(() => invalid.decode(Uint8Array.of(0xff))).toThrow("rlogin_terminal_decode_failed");
    const truncated=new RloginDecoder("gbk"); expect(truncated.decode(Uint8Array.of(0xd6))).toBe("");
    expect(() => truncated.finish()).toThrow("rlogin_terminal_decode_failed");
  });
  it("resets only on epoch change, discarding an incomplete old character after flush",() => {
    const decoder=new RloginDecoder("utf-8"); decoder.decode(Uint8Array.of(0xe4)); decoder.reset("0");
    expect(decoder.decode(Uint8Array.of(0xb8,0xad))).toBe("中");
    decoder.decode(Uint8Array.of(0xe4)); decoder.reset("9007199254740993");
    expect(decoder.decode(Uint8Array.of(65))+decoder.finish()).toBe("A");
  });
  it("separates ISO designations from ANSI even while the character set remains JIS",() => {
    const bytes=[27,36,66,36,34,27,91,51,49,109,36,36,27,40,66,27,93,48,59,84,105,116,108,101,27,92];
    for (let split=0;split<=bytes.length;split++) {
      const decoder=new RloginDecoder("iso-2022-jp");
      expect(decoder.decode(Uint8Array.from(bytes.slice(0,split)))+decoder.decode(Uint8Array.from(bytes.slice(split)))+decoder.finish())
        .toBe("あ\x1b[31mい\x1b]0;Title\x1b\\");
    }
  });
  it("handles fragmented VT charset/DCS/OSC controls without retaining their growing payload",() => {
    const decoder=new RloginDecoder("iso-2022-jp"), text="\x1b(0\x1bPqabcdef\x1b\\\x1b]0;title\x07text\x1b[2J";
    expect(Array.from(new TextEncoder().encode(text),b => decoder.decode(Uint8Array.of(b))).join("")+decoder.finish()).toBe(text);
  });
  it("resets an incomplete ISO designation on flush and rejects one at EOF",() => {
    const decoder=new RloginDecoder("iso-2022-jp"); expect(decoder.decode(Uint8Array.of(27,36))).toBe("");
    decoder.reset("1"); expect(decoder.decode(Uint8Array.of(65))).toBe("A");
    decoder.decode(Uint8Array.of(27)); expect(() => decoder.finish()).toThrow("rlogin_terminal_decode_failed");
  });
  it("preserves repeated ESC, interleaved controls and cancelled VT sequences under ISO",() => {
    const bytes=new TextEncoder().encode("\x1b\x1b[31mA\x1b\r[0m\x1b]0;title\x18normal\x1bPq\x07data\x1aend");
    for (let split=0;split<=bytes.length;split++) {
      const decoder=new RloginDecoder("iso-2022-jp");
      expect(decoder.decode(bytes.subarray(0,split))+decoder.decode(bytes.subarray(split))+decoder.finish()).toBe(new TextDecoder().decode(bytes));
    }
  });
  it("rejects unsupported labels rather than silently falling back to UTF-8",() => {
    // @ts-expect-error Simulate an invalid persisted/wire label at runtime.
    expect(() => new RloginDecoder("utf-16")).toThrow("rlogin_terminal_encoding_invalid");
  });
});
