import { describe, expect, it } from "vitest";
import { localDirectoryParent } from "./localFilePaths";

describe("local folder parent", () => {
  it.each([
    ["/", "/"], ["/home/user", "/home"], ["/home", "/"],
    ["C:\\", "C:\\"], ["C:\\folder", "C:\\"],
    ["\\\\?\\C:\\", "\\\\?\\C:\\"], ["\\\\?\\C:\\folder", "\\\\?\\C:\\"],
    ["\\\\server\\share", "\\\\server\\share"], ["\\\\server\\share\\folder", "\\\\server\\share\\"],
    ["\\\\?\\UNC\\server\\share\\", "\\\\?\\UNC\\server\\share\\"],
    ["\\\\?\\UNC\\server\\share\\folder", "\\\\?\\UNC\\server\\share\\"],
  ])("%s → %s", (path, expected) => expect(localDirectoryParent(path)).toBe(expected));
});
