import { useEffect, useId, useState } from "react";
import { Highlighter } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { SettingsRow } from "./SettingsControls";
import { keywordKinds, validateKeywordRules, type KeywordKind, type TerminalKeywordRule } from "../terminal/terminalKeywordRules";

type Draft = Record<KeywordKind, string>;
const toDraft = (rules: readonly TerminalKeywordRule[]): Draft => Object.fromEntries(
  keywordKinds.map((kind) => [kind, rules.filter((rule) => rule.kind === kind).map((rule) => rule.text).join("\n")]),
) as Draft;

export function TerminalKeywordSettings({ rules, onChange }: {
  rules: readonly TerminalKeywordRule[];
  onChange: (rules: TerminalKeywordRule[]) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const saved = JSON.stringify(toDraft(rules));
  const [draft, setDraft] = useState(() => toDraft(rules));
  // Only a changed saved value (including Appearance reset) replaces local drafts.
  useEffect(() => { setDraft(JSON.parse(saved) as Draft); }, [saved]);
  const candidate = keywordKinds.flatMap((kind) => draft[kind].split("\n")
    .filter((text) => text !== "").map((text) => ({ kind, text })));
  const error = validateKeywordRules(candidate);
  const dirty = JSON.stringify(draft) !== saved;
  return (
    <SettingsRow icon={Highlighter} stack title={t("settings.keywords.title")} description={t("settings.keywords.description")}>
      <div className="settings-keyword-editor">
        {keywordKinds.map((kind) => (
          <label key={kind} htmlFor={`${id}-${kind}`}>
            <span>{t(`settings.keywords.${kind}`)}</span>
            <textarea id={`${id}-${kind}`} className="settings-input" rows={3}
              value={draft[kind]} spellCheck={false} aria-describedby={`${id}-help`}
              aria-invalid={Boolean(error)}
              onChange={(event) => setDraft({ ...draft, [kind]: event.target.value })} />
          </label>
        ))}
        <small id={`${id}-help`}>{t("settings.keywords.help")}</small>
        {error ? <p role="alert">{t(`settings.keywords.invalid.${error}`)}</p> : null}
        <div className="settings-keyword-actions">
          <button type="button" className="settings-action-button" disabled={!dirty || Boolean(error)}
              onClick={() => { if (!validateKeywordRules(candidate)) onChange(candidate); }}>
            {t("settings.keywords.save")}
          </button>
          <button type="button" className="settings-action-button" disabled={!dirty}
              onClick={() => setDraft(toDraft(rules))}>{t("settings.keywords.discard")}</button>
        </div>
      </div>
    </SettingsRow>
  );
}
