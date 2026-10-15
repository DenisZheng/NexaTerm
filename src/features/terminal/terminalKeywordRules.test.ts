import { expect, it } from "vitest";
import { normalizeKeywordRules, validateKeywordRules } from "./terminalKeywordRules";
import { normalizeSettings } from "../settings/settingsTypes";

it("roundtrips literal config and excludes unknown fields; old settings keep empty custom rules", () => {
  const input = [{ text: "(timeout)", kind: "warning", sessionId: "not-persisted" }];
  const settings = normalizeSettings({ appearance: { terminalKeywordRules: input } });
  expect(settings.appearance.terminalKeywordRules).toEqual([{ text: "(timeout)", kind: "warning" }]);
  expect(normalizeSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  expect(normalizeSettings({}).appearance.terminalKeywordRules).toEqual([]);
  expect(input[0].sessionId).toBe("not-persisted");
});
it("rejects oversized, duplicate, control, malformed and padded rules atomically", () => {
  for (const bad of [null, {}, [{text:"x",kind:"url"}], [{text:"x".repeat(65),kind:"error"}],
    [{text:"x\n",kind:"error"}], [{text:" ",kind:"error"}], [{text:" x",kind:"error"}],
    [{text:"\ud800",kind:"error"}], [{text:"foo",kind:"error"},{text:"FOO",kind:"success"}],
    Array.from({length:25},(_,i)=>({text:`item${i}`,kind:"warning"}))]) {
    expect(validateKeywordRules(bad)).not.toBeNull();
    expect(normalizeKeywordRules(bad)).toEqual([]);
  }
  expect(validateKeywordRules([{text:"a".repeat(64),kind:"error"}])).toBeNull();
  expect(validateKeywordRules([{text:"ſ",kind:"error"},{text:"S",kind:"success"}])).toBe("duplicate");
});
