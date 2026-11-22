import { describe, expect, it } from "vitest";

import { isTerminalImeKeyboardEvent } from "./terminalIme";

describe("isTerminalImeKeyboardEvent", () => {
  it("recognizes active composition", () => {
    expect(isTerminalImeKeyboardEvent({ isComposing: true, keyCode: 65 })).toBe(true);
  });

  it("recognizes legacy IME process key 229", () => {
    expect(isTerminalImeKeyboardEvent({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it("does not classify ordinary keyboard input as IME", () => {
    expect(isTerminalImeKeyboardEvent({ isComposing: false, keyCode: 86 })).toBe(false);
  });
});
