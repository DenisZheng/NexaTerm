/** Lightweight settings contract: never import xterm or terminal runtime here. */
export const KEYWORD_RULE_LIMIT = 24;
export const KEYWORD_LENGTH_LIMIT = 64;
export const keywordKinds = ["error", "warning", "success"] as const;
export type KeywordKind = typeof keywordKinds[number];
export interface TerminalKeywordRule { text: string; kind: KeywordKind }
export type KeywordRuleError = "count" | "text" | "duplicate" | "shape";

export function validateKeywordRules(value: unknown): KeywordRuleError | null {
  if (!Array.isArray(value)) return "shape";
  if (value.length > KEYWORD_RULE_LIMIT) return "count";
  const seen = new Set<string>();
  for (const rule of value) {
    if (!rule || typeof rule !== "object" || !keywordKinds.includes(rule.kind)) return "shape";
    if (typeof rule.text !== "string" || !rule.text.trim() || rule.text !== rule.text.trim() || rule.text.length > KEYWORD_LENGTH_LIMIT ||
        /[\p{Cc}\p{Cs}\u2028\u2029]/u.test(rule.text)) return "text";
    const key = rule.text.toLowerCase().replace(/ſ/g, "s").replace(/ς/g, "σ");
    if (seen.has(key)) return "duplicate";
    seen.add(key);
  }
  return null;
}

/** Old/malformed storage falls back atomically; editor validates before applying. */
export function normalizeKeywordRules(value: unknown): TerminalKeywordRule[] {
  if (validateKeywordRules(value)) return [];
  return (value as TerminalKeywordRule[]).map(({ text, kind }) => ({ text, kind }));
}
