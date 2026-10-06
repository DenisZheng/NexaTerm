import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowRight, ChevronDown, Plus, TerminalSquare } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useI18n } from "../../shared/i18n";
import { parseQuickConnectAddress, type QuickConnectTarget } from "../connections/quickConnect";
import { LocalSessionMenuItems, type NewSessionMenuProps } from "./NewSessionMenu";

interface HomeSessionStartProps {
  newSession: NewSessionMenuProps;
  onQuickConnect: (target: QuickConnectTarget) => void | Promise<void>;
}

export function HomeSessionStart({ newSession, onQuickConnect }: HomeSessionStartProps) {
  const { t } = useI18n();
  const id = useId();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const parsed = parseQuickConnectAddress(address);
  const error = parsed.kind === "invalid" ? t(`quickConnect.error.${parsed.code}`) : failed ? t("homeStart.failed") : null;

  return (
    <section className="home-session-start" aria-label={t("homeStart.title")}>
      <form className="home-quick-connect" onSubmit={async (event) => {
        event.preventDefault();
        if (parsed.kind !== "valid" || pending.current) return;
        pending.current = true;
        setBusy(true);
        setFailed(false);
        try {
          await onQuickConnect(parsed.target);
          setAddress("");
        } catch {
          setFailed(true);
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}>
        <label htmlFor={id}>{t("homeStart.title")}</label>
        <div className="home-quick-connect-input">
          <TerminalSquare className="ui-icon" aria-hidden="true" />
          <input className="settings-input" id={id} value={address} disabled={busy} placeholder={t("homeStart.placeholder")} spellCheck={false}
            autoComplete="off" autoCapitalize="none" aria-invalid={Boolean(error)}
            aria-describedby={`${id}-hint`} onChange={(event) => { setAddress(event.target.value); setFailed(false); }} />
          <button className="repository-primary-button" type="submit" aria-busy={busy} disabled={busy || parsed.kind !== "valid"}>
            <span>{t("homeStart.connect")}</span><ArrowRight className="ui-icon" aria-hidden="true" />
          </button>
        </div>
        <p id={`${id}-hint`} className={error ? "pane-error" : "home-start-hint"} role={error ? "alert" : undefined}>
          {error || t("homeStart.temporaryHint")}
        </p>
      </form>
      <div className="home-start-actions">
        <button className="text-tool-button" type="button" onClick={() => newSession.onCreateConnection()}>
          <Plus className="ui-icon" aria-hidden="true" /><span>{t("homeStart.saved")}</span>
        </button>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button className="text-tool-button" type="button">
              <TerminalSquare className="ui-icon" aria-hidden="true" />
              <span>{t(newSession.desktopPlatform === "windows" ? "homeStart.localWsl" : "homeStart.local")}</span>
              <ChevronDown className="ui-icon" aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="dropdown-menu-content app-entry-menu" align="start" sideOffset={4}>
              <LocalSessionMenuItems {...newSession} />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </section>
  );
}
