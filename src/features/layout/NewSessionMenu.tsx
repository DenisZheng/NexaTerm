import "../../styles/actionbar.css";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Menubar from "@radix-ui/react-menubar";
import { Cable, ChevronRight, FolderOpen, Plus, SquarePlus, TerminalSquare } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { Tooltip } from "../../shared/ui/Tooltip";
import { LocalTerminalIcon } from "../terminal/LocalTerminalIcons";
import type { DesktopPlatform } from "../../shared/tauri/platformCapabilities";
import type { ConnectionProtocol } from "../connections/connectionTypes";
import type { LocalTerminalProfile, WslProviderStatus } from "../terminal/localTerminalTypes";
import { newSessionCharacterEntries } from "./newSessionCharacterEntries";
import { buildNewSessionTerminalSections, type WslEntryReason } from "./newSessionLocalEntries";

export interface NewSessionMenuProps {
  desktopPlatform?: DesktopPlatform;
  localProfiles: readonly LocalTerminalProfile[];
  localProfilesError?: string | null;
  localProfilesLoading: boolean;
  wslProviderStatus?: WslProviderStatus | null;
  onCreateConnection: (protocol?: ConnectionProtocol) => void;
  onOpenLocalProfile: (profile: LocalTerminalProfile) => void;
  onQuickOpen: () => void;
}
interface NewSessionItemsProps extends NewSessionMenuProps { variant?: "menubar" | "dropdown" }

/** The titlebar, toolbar and Session submenu share these exact choices and callbacks. */
export function NewSessionMenuItems({ variant = "dropdown", ...props }: NewSessionItemsProps) {
  const { t } = useI18n();
  const Menu = variant === "menubar" ? Menubar : DropdownMenu;
  const sections = buildNewSessionTerminalSections({
    platform: props.desktopPlatform || "unknown",
    profiles: props.localProfiles,
    profilesFailed: Boolean(props.localProfilesError),
    profilesLoading: props.localProfilesLoading,
    wslProviderStatus: props.wslProviderStatus,
  });
  const wslReasonKey = (reason: WslEntryReason) => {
    if (reason === "loading") return "newSession.wslProfilesLoading" as const;
    if (reason === "detectionFailed") return "newSession.wslDetectionFailed" as const;
    if (reason === "commandMissing") return "newSession.wslCommandMissing" as const;
    if (reason === "noDistribution") return "newSession.wslNoDistribution" as const;
    if (reason === "probeTimeout") return "newSession.wslProbeTimeout" as const;
    if (reason === "probeFailed") return "newSession.wslProbeFailed" as const;
    if (reason === "availableHidden") return "newSession.wslAvailableHidden" as const;
    return "newSession.wslNotDetected" as const;
  };
  return (
    <>
      <Menu.Label className="title-new-session-menu-heading">{t("newSession.localTerminals")}</Menu.Label>
      {props.localProfilesLoading || sections.localProfiles.length === 0 ? (
        <Menu.Item disabled className="dropdown-menu-item">
          {t(props.localProfilesLoading ? "newSession.profilesLoading" : "newSession.noProfiles")}
        </Menu.Item>
      ) : sections.localProfiles.map((profile) => (
        <Menu.Item key={profile.id} className="local-terminal-profile-menu-item dropdown-menu-item"
          textValue={profile.name} onSelect={() => props.onOpenLocalProfile(profile)}>
          <span className="local-terminal-menu-label">
            <LocalTerminalIcon className="ui-icon" kind={profile.kind} title={profile.name} />
            <span>{profile.name}</span>
          </span>
        </Menu.Item>
      ))}
      {sections.showWslSection ? (
        <>
          <Menu.Separator className="context-menu-separator" />
          <Menu.Label className="title-new-session-menu-heading">{t("newSession.wsl")}</Menu.Label>
          {sections.wslProfiles.length > 0 ? sections.wslProfiles.map((profile) => (
            <Menu.Item key={profile.id} className="local-terminal-profile-menu-item dropdown-menu-item"
              textValue={profile.name} onSelect={() => props.onOpenLocalProfile(profile)}>
              <span className="local-terminal-menu-label">
                <LocalTerminalIcon className="ui-icon" kind={profile.kind} title={profile.name} />
                <span>{profile.name}</span>
              </span>
            </Menu.Item>
          )) : (
            <Menu.Item disabled className="dropdown-menu-item">{t(wslReasonKey(sections.wslReason))}</Menu.Item>
          )}
        </>
      ) : null}
      <Menu.Separator className="context-menu-separator" />
      <Menu.Label className="title-new-session-menu-heading">{t("newSession.characterTerminals")}</Menu.Label>
      {newSessionCharacterEntries.map((entry) => (
        <Menu.Item
          key={entry.protocol}
          className="dropdown-menu-item"
          onSelect={() => props.onCreateConnection(entry.protocol)}
        >
          {entry.protocol === "telnet" ? (
            <TerminalSquare className="ui-icon" aria-hidden="true" />
          ) : (
            <Cable className="ui-icon" aria-hidden="true" />
          )}
          {t(entry.labelKey)}
        </Menu.Item>
      ))}
      <Menu.Separator className="context-menu-separator" />
      <Menu.Item className="dropdown-menu-item" onSelect={() => props.onCreateConnection()}>
        <SquarePlus className="ui-icon" aria-hidden="true" />{t("newSession.createConnection")}
      </Menu.Item>
      <Menu.Item className="dropdown-menu-item" onSelect={props.onQuickOpen}>
        <FolderOpen className="ui-icon" aria-hidden="true" />{t("newSession.quickOpen")}
      </Menu.Item>
    </>
  );
}

export function NewSessionSubMenu({ variant = "dropdown", ...props }: NewSessionItemsProps) {
  const { t } = useI18n();
  const Menu = variant === "menubar" ? Menubar : DropdownMenu;
  return (
    <Menu.Sub>
      <Menu.SubTrigger className="dropdown-menu-item" textValue={t("newSession.title")}>
        <Plus className="ui-icon" aria-hidden="true" />{t("newSession.title")}
        <ChevronRight className="ui-icon" aria-hidden="true" />
      </Menu.SubTrigger>
      <Menu.Portal><Menu.SubContent className="dropdown-menu-content app-entry-menu" sideOffset={4}>
        <NewSessionMenuItems {...props} variant={variant} />
      </Menu.SubContent></Menu.Portal>
    </Menu.Sub>
  );
}

export function NewSessionMenu({ toolbar = false, showLabel = false, ...props }: NewSessionMenuProps & {
  toolbar?: boolean; showLabel?: boolean;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu.Root modal={false}>
      <Tooltip label={t("newSession.title")}>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label={t("newSession.title")}
            data-toolbar-control={toolbar ? "true" : undefined}
            className={toolbar ? "app-toolbar-button" : "title-tool-button title-new-session"}>
            <Plus className={toolbar ? "ui-icon" : "title-tool-icon"} aria-hidden="true" />
            {showLabel ? <span>{t("newSession.title")}</span> : null}
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal><DropdownMenu.Content align="start" sideOffset={4}
        className="title-new-session-menu dropdown-menu-content app-entry-menu">
        <NewSessionMenuItems {...props} />
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
