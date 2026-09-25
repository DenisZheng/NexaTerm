import { FolderOpen, Plus, SquarePlus } from "lucide-react";
import { useRef, useState } from "react";

import { useI18n } from "../../shared/i18n";
import { AnchoredSurfacePortal } from "../../shared/ui/AnchoredSurfacePortal";
import { Tooltip } from "../../shared/ui/Tooltip";
import { LocalTerminalIcon } from "../terminal/LocalTerminalIcons";
import type { LocalTerminalProfile } from "../terminal/localTerminalTypes";

export interface NewSessionMenuProps {
  localProfiles: readonly LocalTerminalProfile[];
  localProfilesLoading: boolean;
  onCreateConnection: () => void;
  onOpenLocalProfile: (profile: LocalTerminalProfile) => void;
  onQuickOpen: () => void;
}

/**
 * "新建会话"入口（WF-01 切片 3）：本地终端 profile、新建连接、打开已保存连接。
 * 聚合"终端"按钮退役后（WS-E13），本地终端从这里新建实例；切片 4 的工具栏"新建会话"复用本组件。
 */
export function NewSessionMenu({
  localProfiles,
  localProfilesLoading,
  onCreateConnection,
  onOpenLocalProfile,
  onQuickOpen,
}: NewSessionMenuProps) {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <>
      <Tooltip label={t("newSession.title")}>
        <button
          ref={triggerRef}
          className="title-tool-button title-new-session"
          type="button"
          aria-label={t("newSession.title")}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
        >
          <Plus className="title-tool-icon" aria-hidden="true" />
        </button>
      </Tooltip>
      <AnchoredSurfacePortal
        anchorRef={triggerRef}
        ariaLabel={t("newSession.title")}
        className="title-new-session-menu dropdown-menu-content"
        desiredHeight={420}
        minHeight={160}
        open={open}
        role="menu"
        width={300}
        onOpenChange={setOpen}
      >
        <div className="title-new-session-menu-heading">{t("newSession.localTerminals")}</div>
        {localProfilesLoading ? (
          <div className="title-new-session-menu-empty">{t("newSession.profilesLoading")}</div>
        ) : localProfiles.length === 0 ? (
          <div className="title-new-session-menu-empty">{t("newSession.noProfiles")}</div>
        ) : (
          localProfiles.map((profile) => (
            <button
              key={profile.id}
              className="local-terminal-profile-menu-item dropdown-menu-item"
              type="button"
              role="menuitem"
              onClick={() => choose(() => onOpenLocalProfile(profile))}
            >
              <span className="local-terminal-menu-label">
                <LocalTerminalIcon className="ui-icon" kind={profile.kind} title={profile.name} />
                <span>{profile.name}</span>
              </span>
            </button>
          ))
        )}
        <div className="context-menu-separator" role="separator" />
        <button
          className="local-terminal-profile-menu-item dropdown-menu-item"
          type="button"
          role="menuitem"
          onClick={() => choose(onCreateConnection)}
        >
          <span className="local-terminal-menu-label">
            <SquarePlus className="ui-icon" aria-hidden="true" />
            <span>{t("newSession.createConnection")}</span>
          </span>
        </button>
        <button
          className="local-terminal-profile-menu-item dropdown-menu-item"
          type="button"
          role="menuitem"
          onClick={() => choose(onQuickOpen)}
        >
          <span className="local-terminal-menu-label">
            <FolderOpen className="ui-icon" aria-hidden="true" />
            <span>{t("newSession.quickOpen")}</span>
          </span>
        </button>
      </AnchoredSurfacePortal>
    </>
  );
}
