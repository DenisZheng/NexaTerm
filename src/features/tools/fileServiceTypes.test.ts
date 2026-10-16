import { expect, it } from "vitest";
import { fileServiceDownloadCommand } from "./fileServiceTypes";
it("builds quoted curl arguments for POSIX and Windows shells without accepting injected values", () => {
  const value = "a".repeat(43);
  for (const windows of [false, true]) {
    const command = fileServiceDownloadCommand(12345, value, windows);
    expect(command).toBe(`${windows ? "curl.exe" : "curl"} --fail --header "Authorization: Bearer ${value}" "http://127.0.0.1:12345/file" --output download.bin`);
  }
  for (const invalid of [0, -1, 65536, 1.5, null, undefined]) expect(fileServiceDownloadCommand(invalid, value, false)).toBeNull();
  for (const invalid of [null, "", value + "'", "$".repeat(43), "a".repeat(42)]) expect(fileServiceDownloadCommand(12345, invalid, false)).toBeNull();
});
