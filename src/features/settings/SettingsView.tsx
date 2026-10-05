import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Archive,
  ArrowLeft,
  Bot,
  Check,
  Clock3,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileKey,
  Folder,
  FolderOpen,
  Globe2,
  HardDrive,
  Keyboard,
  KeyRound,
  Layers,
  Loader2,
  LockKeyhole,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Rows3,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Server,
  Settings,
  Sun,
  Terminal,
  Trash2,
  Type,
  Undo2,
  Waypoints,
  X,
} from "lucide-react";

import { useI18n, type MessageKey, type Translate } from "../../shared/i18n";
import { AppSelect } from "../../shared/ui/AppSelect";
import { AppCombobox } from "../../shared/ui/AppCombobox";
import { Tooltip } from "../../shared/ui/Tooltip";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { usernameInputAttributes } from "../../shared/ui/inputAttributes";
import {
  selectLocalDownloadDirectory,
  selectLocalPrivateKeyFile,
} from "../../shared/tauri/dialog";
import {
  aiProviderConfigDelete,
  aiProviderConfigList,
  aiProviderModelsList,
  aiProviderConfigRevealApiKey,
  aiProviderConfigSave,
  aiProviderConfigTest,
  credentialRevealSecret,
  localTerminalListProfiles,
  mcpExecutablePath,
  mcpRemoteLogClear,
  mcpRemoteLogRead,
  mcpRemoteServiceRestart,
  mcpRemoteServiceStatus,
  mcpRemoteTokenRotate,
  mcpSettingsGet,
  mcpSettingsSave,
} from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import type {
  ConnectionAuthKind,
  ConnectionProfile,
  CredentialProfile,
  CredentialProfileInput,
} from "../connections/connectionTypes";
import {
  getTerminalAnsiSwatches,
  getTerminalColorScheme,
  getTerminalColorSchemes,
  getTerminalColorSchemeTone,
  isTerminalColorSchemesReady,
  loadTerminalColorSchemes,
  onTerminalColorSchemesReady,
  type TerminalColorSchemeTone,
} from "./terminalColorSchemes";
import {
  accentColorPresets,
  defaultSettings,
  type FileTransferConcurrency,
  type FileTransferConflictPolicy,
  type FileTransferSettings,
  type FileTransferTimestampFormat,
  normalizeFontFamilyInput,
  normalizeHexColor,
  normalizeLocalTerminalProfileInput,
  terminalFontPresets,
  type AccentColor,
  type AppearanceSettings,
  type BasicSettings,
  type CommandSettings,
  type FontSettingMode,
  type MxtermSettings,
  type SecuritySettings,
  type SettingsSectionId,
  type ShortcutSettings,
  type TerminalThemeSettings,
  type TerminalFontPreset,
  type TerminalCursorStyle,
  type UiFontPreset,
  type WindowMaterialMode,
  uiFontPresets,
} from "./settingsTypes";
import { getWindowMaterialLabel } from "../../shared/tauri/windowMaterial";
import {
  SegmentedControl,
  SettingsRow,
  SettingsToggle,
  Stepper,
} from "./SettingsControls";
import type {
  LocalTerminalProfile,
  LocalTerminalProfileInput,
  LocalTerminalSettings,
} from "../terminal/localTerminalTypes";
import { LocalTerminalIcon } from "../terminal/LocalTerminalIcons";
import { WebDavSyncSettingsSection } from "./WebDavSyncSettingsSection";
import { ShortcutSettingsSection } from "./ShortcutSettingsSection";
import {
  defaultMcpSettings,
  type McpRemoteLogOutput,
  type McpSettings,
} from "./mcpSettingsTypes";
import type { UseAppUpdateResult } from "./useAppUpdate";
import type {
  AiApiFormat,
  AiProviderConfig,
  AiProviderConfigInput,
  AiProviderKind,
  AiProviderModelOption,
} from "../ai/aiTypes";

interface SettingsViewProps {
  appUpdate: UseAppUpdateResult;
  connections: ConnectionProfile[];
  credentials: CredentialProfile[];
  credentialError?: string | null;
  credentialLoading?: boolean;
  effectiveWindowMaterial: WindowMaterialMode;
  hidden?: boolean;
  settings: MxtermSettings;
  activeSection?: SettingsSectionId;
  activeSectionRequestKey?: number;
  supportedWindowMaterials: WindowMaterialMode[];
  onReset: () => void;
  onReturnWorkspace: () => void;
  onSaveCredential: (input: CredentialProfileInput) => Promise<void>;
  onDeleteCredential: (credential: CredentialProfile) => Promise<void>;
  secretVaultBusy?: boolean;
  secretVaultError?: string | null;
  onDisableMasterPassword: () => Promise<boolean>;
  onEnableMasterPassword: (masterPassword: string) => Promise<boolean>;
  onUnlockSecuritySettings: (masterPassword: string) => Promise<boolean>;
  onUpdateAppearance: (update: Partial<AppearanceSettings>) => void;
  onUpdateBasic: (update: Partial<BasicSettings>) => void;
  onUpdateCommand: (update: Partial<CommandSettings>) => void;
  onUpdateFileTransfer: (update: Partial<FileTransferSettings>) => void;
  onUpdateLocalTerminal: (update: Partial<LocalTerminalSettings>) => void;
  onUpdateSecurity: (update: Partial<SecuritySettings>) => void;
  onUpdateShortcuts: (update: Partial<ShortcutSettings>) => void;
  onUpdateTerminalTheme: (update: Partial<TerminalThemeSettings>) => void;
}

const settingsSections: Array<{
  descriptionKey: MessageKey;
  icon: typeof Settings;
  id: SettingsSectionId;
  labelKey: MessageKey;
}> = [
  { id: "basic", labelKey: "settings.nav.basic.label", descriptionKey: "settings.nav.basic.description", icon: Settings },
  { id: "credentials", labelKey: "settings.nav.credentials.label", descriptionKey: "settings.nav.credentials.description", icon: Shield },
  { id: "mcp", labelKey: "settings.nav.mcp.label", descriptionKey: "settings.nav.mcp.description", icon: Waypoints },
  { id: "ai", labelKey: "settings.nav.ai.label", descriptionKey: "settings.nav.ai.description", icon: Bot },
  { id: "security", labelKey: "settings.nav.security.label", descriptionKey: "settings.nav.security.description", icon: ShieldCheck },
  { id: "sync", labelKey: "settings.nav.sync.label", descriptionKey: "settings.nav.sync.description", icon: Cloud },
  { id: "shortcuts", labelKey: "settings.nav.shortcuts.label", descriptionKey: "settings.nav.shortcuts.description", icon: Keyboard },
  { id: "appearance", labelKey: "settings.nav.appearance.label", descriptionKey: "settings.nav.appearance.description", icon: Palette },
  { id: "localTerminal", labelKey: "settings.nav.localTerminal.label", descriptionKey: "settings.nav.localTerminal.description", icon: HardDrive },
  { id: "terminalTheme", labelKey: "settings.nav.terminalTheme.label", descriptionKey: "settings.nav.terminalTheme.description", icon: Terminal },
];

export function SettingsView({
  appUpdate,
  connections,
  credentials,
  credentialError,
  credentialLoading = false,
  effectiveWindowMaterial,
  hidden = false,
  settings,
  activeSection: requestedActiveSection,
  activeSectionRequestKey,
  supportedWindowMaterials,
  onReset,
  onReturnWorkspace,
  onSaveCredential,
  onDeleteCredential,
  secretVaultBusy = false,
  secretVaultError = null,
  onDisableMasterPassword,
  onEnableMasterPassword,
  onUnlockSecuritySettings,
  onUpdateAppearance,
  onUpdateBasic,
  onUpdateCommand,
  onUpdateFileTransfer,
  onUpdateLocalTerminal,
  onUpdateSecurity,
  onUpdateShortcuts,
  onUpdateTerminalTheme,
}: SettingsViewProps) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("basic");
  const [accentDraft, setAccentDraft] = useState(settings.appearance.accentColorCustom);
  const effectiveAllowPasswordReveal =
    !settings.security.masterPasswordEnabled || settings.security.allowPasswordReveal;

  useEffect(() => {
    setAccentDraft(settings.appearance.accentColorCustom);
  }, [settings.appearance.accentColorCustom]);

  useEffect(() => {
    if (requestedActiveSection) {
      setActiveSection(requestedActiveSection);
    }
  }, [requestedActiveSection, activeSectionRequestKey]);

  return (
    <section className="settings-view" hidden={hidden} aria-label={t("settings.shell.aria")} aria-hidden={hidden}>
      <aside className="settings-sidebar app-sidebar" aria-label={t("settings.nav.aria")}>
        <button className="settings-return" type="button" onClick={onReturnWorkspace}>
          <ArrowLeft className="ui-icon" aria-hidden="true" />
          <span>{t("settings.returnWorkspace")}</span>
        </button>

        <nav className="settings-nav" aria-label={t("settings.nav.navigation")}>
          {settingsSections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                className={`settings-nav-item ${activeSection === section.id ? "active" : ""}`}
                key={section.id}
                type="button"
                aria-current={activeSection === section.id ? "page" : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                <Icon className="ui-icon" aria-hidden="true" />
                <span>
                  <strong>{t(section.labelKey)}</strong>
                  <small>{t(section.descriptionKey)}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="settings-sidebar-foot">{t("settings.autoSave")}</div>
      </aside>

      <div className="settings-content">
        {activeSection === "basic" ? (
          <BasicSettingsSection
            appUpdate={appUpdate}
            fileTransferSettings={settings.fileTransfer}
            settings={settings.basic}
            onUpdate={onUpdateBasic}
            onUpdateFileTransfer={onUpdateFileTransfer}
          />
        ) : null}
        {activeSection === "appearance" ? (
          <AppearanceSettingsSection
            accentDraft={accentDraft}
            effectiveWindowMaterial={effectiveWindowMaterial}
            settings={settings.appearance}
            supportedWindowMaterials={supportedWindowMaterials}
            onAccentDraftChange={setAccentDraft}
            onReset={onReset}
            onUpdate={onUpdateAppearance}
          />
        ) : null}
        {activeSection === "localTerminal" ? (
          <LocalTerminalSettingsSection
            appearanceSettings={settings.appearance}
            basicSettings={settings.basic}
            commandSettings={settings.command}
            settings={settings.localTerminal}
            onUpdateAppearance={onUpdateAppearance}
            onUpdateBasic={onUpdateBasic}
            onUpdateCommand={onUpdateCommand}
            onUpdate={onUpdateLocalTerminal}
          />
        ) : null}
        {activeSection === "credentials" ? (
          <CredentialSettingsSection
            allowPasswordReveal={effectiveAllowPasswordReveal}
            credentials={credentials}
            error={credentialError || null}
            loading={credentialLoading}
            onDelete={onDeleteCredential}
            onSave={onSaveCredential}
          />
        ) : null}
        {activeSection === "security" ? (
          <SecuritySettingsSection
            busy={secretVaultBusy}
            error={secretVaultError}
            settings={settings.security}
            onDisableMasterPassword={onDisableMasterPassword}
            onEnableMasterPassword={onEnableMasterPassword}
            onUnlockSecuritySettings={onUnlockSecuritySettings}
            onUpdate={onUpdateSecurity}
          />
        ) : null}
        {activeSection === "mcp" ? <McpSettingsSection connections={connections} /> : null}
        {activeSection === "ai" ? <AiSettingsSection /> : null}
        {activeSection === "sync" ? <WebDavSyncSettingsSection /> : null}
        {activeSection === "shortcuts" ? (
          <ShortcutSettingsSection
            settings={settings.shortcuts}
            onUpdate={onUpdateShortcuts}
          />
        ) : null}
        {activeSection === "terminalTheme" ? (
          <TerminalThemeSettingsSection
            settings={settings.terminalTheme}
            onUpdate={onUpdateTerminalTheme}
          />
        ) : null}
      </div>
    </section>
  );
}

interface AiProviderDraft {
  id?: string;
  name: string;
  provider: AiProviderKind;
  api_format: AiApiFormat;
  endpoint: string;
  model: string;
  api_key: string;
  api_key_touched: boolean;
}

function AiSettingsSection() {
  const { t } = useI18n();
  const desktopRuntime = hasTauriRuntime();
  const [configs, setConfigs] = useState<AiProviderConfig[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const selectedIdRef = useRef("");
  const [draft, setDraft] = useState<AiProviderDraft>(() => emptyAiProviderDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<AiProviderModelOption[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyRevealBusy, setApiKeyRevealBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AiProviderConfig | null>(null);
  const selectedConfig = configs.find((config) => config.id === selectedId) || null;
  const savedApiKeyCount = configs.filter((config) => config.api_key_saved).length;
  const apiKeyStatus = draft.api_key_touched
    ? draft.api_key.trim()
      ? t("settings.ai.key.willUpdate")
      : t("settings.ai.key.willClear")
    : selectedConfig?.api_key_saved
      ? draft.api_key
        ? t("settings.ai.key.revealed")
        : t("settings.ai.key.saved")
      : t("settings.ai.key.notSaved");
  const formTitle = selectedConfig ? t("settings.ai.form.edit") : t("settings.ai.form.new");
  const formDescription = selectedConfig
    ? `${formatAiAccessModeLabel(draft.api_format, t)} · ${draft.model || t("settings.ai.form.unsetModel")}`
    : t("settings.ai.form.description");
  const modelSourceKey = [
    draft.api_format,
    draft.endpoint.trim(),
    draft.id || selectedConfig?.id || "",
    draft.api_key_touched ? draft.api_key.trim() : selectedConfig?.api_key_saved ? "__saved__" : "",
  ].join("|");
  const modelSourceKeyRef = useRef(modelSourceKey);
  const modelSelectOptions = modelOptions.map((option) => ({
    label: renderAiModelOption(option),
    searchText: [option.id, option.display_name || "", option.subtitle || ""].join(" "),
    value: option.id,
  }));

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (modelSourceKeyRef.current === modelSourceKey) {
      return;
    }
    modelSourceKeyRef.current = modelSourceKey;
    setModelOptions([]);
    setModelsLoading(false);
  }, [modelSourceKey]);

  useEffect(() => {
    let disposed = false;
    async function load() {
      if (!desktopRuntime) {
        setConfigs([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setTesting(false);
      setModelsLoading(false);
      setModelOptions([]);
      try {
        const next = await aiProviderConfigList();
        if (disposed) {
          return;
        }
        setConfigs(next);
        const nextSelected = selectedId && next.some((config) => config.id === selectedId)
          ? selectedId
          : next[0]?.id || "";
        setSelectedId(nextSelected);
        setDraft(nextSelected ? draftFromConfig(next.find((config) => config.id === nextSelected) || null) : emptyAiProviderDraft());
      } catch (nextError) {
        if (!disposed) {
          setError(formatSettingsError(nextError, t("settings.ai.error.load")));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopRuntime, t]);

  function selectConfig(id: string) {
    setSelectedId(id);
    setDraft(draftFromConfig(configs.find((config) => config.id === id) || null));
    setShowApiKey(false);
    setApiKeyRevealBusy(false);
    setTesting(false);
    setModelsLoading(false);
    setModelOptions([]);
    setError(null);
    setMessage(null);
  }

  function newConfig() {
    setSelectedId("");
    setDraft(emptyAiProviderDraft());
    setShowApiKey(false);
    setApiKeyRevealBusy(false);
    setTesting(false);
    setModelsLoading(false);
    setModelOptions([]);
    setError(null);
    setMessage(null);
  }

  function resetDraft() {
    setDraft(draftFromConfig(selectedConfig));
    setShowApiKey(false);
    setApiKeyRevealBusy(false);
    setTesting(false);
    setModelsLoading(false);
    setModelOptions([]);
    setError(null);
    setMessage(null);
  }

  async function reloadConfigs(selectId?: string) {
    const next = await aiProviderConfigList();
    setConfigs(next);
    const nextSelected = selectId || selectedId;
    if (nextSelected && next.some((config) => config.id === nextSelected)) {
      setSelectedId(nextSelected);
      setDraft(draftFromConfig(next.find((config) => config.id === nextSelected) || null));
    } else {
      setSelectedId(next[0]?.id || "");
      setDraft(draftFromConfig(next[0] || null));
    }
    setShowApiKey(false);
    setApiKeyRevealBusy(false);
    setTesting(false);
    setModelsLoading(false);
    setModelOptions([]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!desktopRuntime) {
      setError(t("settings.ai.error.saveDesktop"));
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const input = buildAiProviderConfigInput(draft);
      const saved = await aiProviderConfigSave(input);
      await reloadConfigs(saved.id);
      setMessage(t("settings.ai.message.saved"));
    } catch (nextError) {
      setError(formatSettingsError(nextError, t("settings.ai.error.save")));
    } finally {
      setSaving(false);
    }
  }

  async function testConfig() {
    if (!desktopRuntime) {
      setError(t("settings.ai.error.testDesktop"));
      return;
    }
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await aiProviderConfigTest(buildAiProviderConfigInput(draft));
      setMessage(result.message);
    } catch (nextError) {
      setError(formatSettingsError(nextError, t("settings.ai.error.test")));
    } finally {
      setTesting(false);
    }
  }

  async function fetchModels() {
    if (!desktopRuntime) {
      setError(t("settings.ai.error.modelsDesktop"));
      return;
    }
    setModelsLoading(true);
    setError(null);
    setMessage(null);
    const requestSourceKey = modelSourceKeyRef.current;
    try {
      const models = await aiProviderModelsList(buildAiProviderConfigInput(draft));
      if (modelSourceKeyRef.current !== requestSourceKey) {
        return;
      }
      setModelOptions(models);
      setMessage(t("settings.ai.message.models", { count: models.length }));
    } catch (nextError) {
      if (modelSourceKeyRef.current !== requestSourceKey) {
        return;
      }
      setError(formatSettingsError(nextError, t("settings.ai.error.models")));
      setModelOptions([]);
    } finally {
      if (modelSourceKeyRef.current === requestSourceKey) {
        setModelsLoading(false);
      }
    }
  }

  async function confirmDeleteConfig() {
    if (!deleteTarget) {
      return;
    }
    try {
      await aiProviderConfigDelete(deleteTarget.id);
      setDeleteTarget(null);
      await reloadConfigs();
      setMessage(t("settings.ai.message.deleted"));
    } catch (nextError) {
      setError(formatSettingsError(nextError, t("settings.ai.error.delete")));
    }
  }

  async function toggleApiKeyVisibility() {
    if (showApiKey) {
      setShowApiKey(false);
      return;
    }
    if (draft.api_key_touched || draft.api_key || !selectedConfig?.api_key_saved) {
      setShowApiKey(true);
      return;
    }
    if (!desktopRuntime) {
      setError(t("settings.ai.error.revealDesktop"));
      return;
    }
    const configId = draft.id || selectedConfig.id;
    setApiKeyRevealBusy(true);
    setError(null);
    setMessage(null);
    try {
      const revealed = await aiProviderConfigRevealApiKey(configId);
      if (selectedIdRef.current !== configId) {
        return;
      }
      setDraft((current) =>
        current.id === configId
          ? {
              ...current,
              api_key: revealed.api_key,
              api_key_touched: false,
            }
          : current,
      );
      setShowApiKey(true);
    } catch (nextError) {
      setError(formatSettingsError(nextError, t("settings.ai.error.reveal")));
    } finally {
      setApiKeyRevealBusy(false);
    }
  }

  return (
    <section className="settings-page-section">
      <header className="settings-section-head">
        <h1>{t("settings.ai.title")}</h1>
        <p>{t("settings.ai.description")}</p>
      </header>

      <div className="ai-settings-layout">
        <section className="settings-panel ai-settings-list-panel" aria-label={t("settings.ai.listAria")}>
          <header className="ai-settings-list-head">
            <span>
              <strong>{t("settings.ai.list.title")}</strong>
              <small>{aiConfigSummary(configs.length, savedApiKeyCount, t)}</small>
            </span>
            <button
              className="repository-icon-button"
              type="button"
              aria-label={t("settings.ai.list.newAria")}
              disabled={loading || saving || testing || modelsLoading}
              onClick={newConfig}
            >
              <Plus className="ui-icon" aria-hidden="true" />
            </button>
          </header>

          <div className="ai-settings-list-body">
            {loading ? <p className="settings-note">{t("settings.ai.list.loading")}</p> : null}
            {configs.length === 0 && !loading ? (
              <div className="ai-settings-empty-state">
                <Bot className="ui-icon" aria-hidden="true" />
                <strong>{t("settings.ai.empty.title")}</strong>
                <small>{t("settings.ai.empty.description")}</small>
                <div>
                  <button type="button" onClick={newConfig}>{t("settings.ai.empty.new")}</button>
                </div>
              </div>
            ) : null}
            {configs.map((config) => (
              <button
                className={`ai-settings-list-item ${selectedConfig?.id === config.id ? "active" : ""}`}
                key={config.id}
                type="button"
                title={config.endpoint}
                onClick={() => selectConfig(config.id)}
              >
                <span className="ai-settings-list-icon">
                  <Bot className="ui-icon" aria-hidden="true" />
                </span>
                <span className="ai-settings-list-copy">
                  <strong>{config.name}</strong>
                  <small>{aiConfigMetaSummary(config, t)}</small>
                </span>
                <span
                  className={`ai-settings-list-kind ${
                    config.api_key_saved ? "saved" : "missing"
                  }`}
                >
                  {config.api_key_saved ? t("settings.ai.key.badge.saved") : t("settings.ai.key.badge.missing")}
                </span>
              </button>
            ))}
          </div>
        </section>

        <form
          className="settings-panel ai-settings-form-panel ai-provider-form"
          onSubmit={(event) => void submit(event)}
        >
          <header className="ai-settings-form-head">
            <span className="ai-settings-form-icon">
              <Bot className="ui-icon" aria-hidden="true" />
            </span>
            <span>
              <strong>{formTitle}</strong>
              <small>{formDescription}</small>
            </span>
          </header>

          <div className="ai-settings-form-body">
            <SettingsRow
              className="ai-provider-row-field"
              icon={Bot}
              title={t("settings.ai.name.title")}
              description={t("settings.ai.name.description")}
            >
              <input
                value={draft.name}
                placeholder={t("settings.ai.name.placeholder")}
                onChange={(event) => {
                  const value = event.target?.value;
                  if (value !== undefined) {
                    setDraft((current) => ({ ...current, name: value }));
                  }
                }}
              />
            </SettingsRow>
            <SettingsRow
              className="ai-provider-row-field"
              icon={Server}
              title={t("settings.ai.endpoint.title")}
              description={t("settings.ai.endpoint.description")}
            >
              <input
                value={draft.endpoint}
                placeholder={
                  draft.api_format === "anthropic"
                    ? "https://api.example.com/anthropic"
                    : "https://api.openai.com/v1"
                }
                spellCheck={false}
                onChange={(event) => {
                  const value = event.target?.value;
                  if (value !== undefined) {
                    setDraft((current) => ({ ...current, endpoint: value }));
                  }
                }}
              />
            </SettingsRow>
            <SettingsRow
              className="ai-provider-row-field"
              icon={Layers}
              title={t("settings.ai.access.title")}
              description={t("settings.ai.access.description")}
            >
              <AppSelect
                ariaLabel={t("settings.ai.access.aria")}
                className="ai-settings-inline-select"
                options={[{ label: t("settings.ai.access.anthropic"), value: "anthropic" }, { label: t("settings.ai.access.openai"), value: "openai_compatible" }]}
                value={draft.api_format}
                onChange={(api_format) =>
                  setDraft((value) => ({
                    ...value,
                    api_format,
                    provider: providerFromAiApiFormat(api_format),
                  }))
                }
              />
            </SettingsRow>
            <SettingsRow
              className="ai-provider-row-field"
              icon={KeyRound}
              title="API Key"
              description={apiKeyStatus}
            >
              <div className="ai-api-key-field">
                <input
                  value={draft.api_key}
                  type={showApiKey ? "text" : "password"}
                  placeholder={selectedConfig?.api_key_saved ? t("settings.ai.key.placeholder.keep") : t("settings.ai.key.placeholder.input")}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => {
                    const value = event.target?.value;
                    if (value !== undefined) {
                      setDraft((current) => ({
                        ...current,
                        api_key: value,
                        api_key_touched: true,
                      }));
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={showApiKey ? t("settings.ai.key.hide") : t("settings.ai.key.show")}
                  disabled={apiKeyRevealBusy || loading || saving}
                  onClick={() => void toggleApiKeyVisibility()}
                >
                  {apiKeyRevealBusy ? (
                    <Loader2 className="ui-icon spin" aria-hidden="true" />
                  ) : showApiKey ? (
                    <EyeOff className="ui-icon" aria-hidden="true" />
                  ) : (
                    <Eye className="ui-icon" aria-hidden="true" />
                  )}
                </button>
              </div>
            </SettingsRow>
            <SettingsRow
              className="ai-provider-row-field ai-model-row-field"
              icon={FileKey}
              title={t("settings.ai.model.title")}
              description={t("settings.ai.model.description")}
            >
              <div className="ai-model-field">
                <div className="ai-model-input-row">
                  <AppCombobox
                    ariaLabel={t("settings.ai.model.aria")}
                    className="ai-model-combobox"
                    disabled={loading || saving || testing || modelsLoading || !desktopRuntime}
                    emptyText={t("settings.ai.model.empty")}
                    menuMinWidth={420}
                    options={modelSelectOptions}
                    placeholder={t("settings.ai.model.placeholder")}
                    value={draft.model}
                    onChange={(value) => {
                      setDraft((current) => ({ ...current, model: value }));
                    }}
                  />
                  <button
                    className="settings-action-button"
                    type="button"
                    disabled={loading || saving || testing || modelsLoading || !desktopRuntime}
                    onClick={() => void fetchModels()}
                  >
                    {modelsLoading ? (
                      <Loader2 className="ui-icon spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="ui-icon" aria-hidden="true" />
                    )}
                    <span>{modelsLoading ? t("settings.ai.model.loading") : t("settings.ai.model.fetch")}</span>
                  </button>
                </div>
              </div>
            </SettingsRow>
          </div>

          {!desktopRuntime ? (
            <p className="settings-note">{t("settings.ai.preview")}</p>
          ) : null}
          {error ? <p className="settings-path-error" role="alert">{error}</p> : null}
          {message ? <p className="settings-note" role="status">{message}</p> : null}

          <footer className="ai-provider-form-actions">
            <div>
              {selectedConfig ? (
                <button
                  className="danger-button ai-provider-danger-button"
                  disabled={saving || testing || modelsLoading}
                  type="button"
                  onClick={() => setDeleteTarget(selectedConfig)}
                >
                  <Trash2 className="ui-icon" aria-hidden="true" />
                  {t("settings.credentials.delete")}
                </button>
              ) : null}
            </div>
            <div>
              <button
                disabled={saving || loading || testing || modelsLoading}
                type="button"
                onClick={resetDraft}
              >
                {selectedConfig ? t("settings.ai.reset") : t("settings.ai.clear")}
              </button>
              <button
                disabled={saving || loading || testing || modelsLoading || !desktopRuntime}
                type="button"
                onClick={() => void testConfig()}
              >
                {testing ? (
                  <Loader2 className="ui-icon spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="ui-icon" aria-hidden="true" />
                )}
                <span>{testing ? t("settings.ai.testing") : t("settings.ai.test")}</span>
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={saving || loading || testing || modelsLoading || !desktopRuntime}
              >
                <Save className="ui-icon" aria-hidden="true" />
                <span>{saving ? t("settings.ai.saving") : t("settings.ai.save")}</span>
              </button>
            </div>
          </footer>
        </form>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("settings.ai.delete.title")}
        description={t("settings.ai.delete.description", { name: deleteTarget?.name || t("settings.ai.delete.fallback") })}
        confirmLabel={t("settings.credentials.deleteConfirm")}
        onConfirm={confirmDeleteConfig}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </section>
  );
}

type McpClientConfigTab = "stdio" | "remote-http" | "legacy-sse";

function isSshConnection(connection: ConnectionProfile) {
  return (connection.protocol || "ssh") === "ssh";
}

function McpSettingsSection({ connections }: { connections: ConnectionProfile[] }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<McpSettings>(defaultMcpSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeConfigTab, setActiveConfigTab] = useState<McpClientConfigTab>("stdio");
  const [copied, setCopied] = useState(false);
  const [remoteConfigCopied, setRemoteConfigCopied] = useState(false);
  const [legacySseConfigCopied, setLegacySseConfigCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [remoteActionBusy, setRemoteActionBusy] = useState<string | null>(null);
  const [remoteLog, setRemoteLog] = useState<McpRemoteLogOutput | null>(null);
  const [remotePortDraft, setRemotePortDraft] = useState(defaultMcpSettings.remote_port.toString());
  const [remoteTokenDraft, setRemoteTokenDraft] = useState("");
  const desktopRuntime = hasTauriRuntime();
  const [executablePath, setExecutablePath] = useState("mxterm-mcp.exe");
  const [connectionExposureQuery, setConnectionExposureQuery] = useState("");
  const connectionExposureSearchQuery = connectionExposureQuery.trim();
  const connectionExposureSearchActive = connectionExposureSearchQuery.length > 0;
  const sshConnections = useMemo(
    () => connections.filter(isSshConnection),
    [connections],
  );
  const connectionIds = useMemo(
    () => sshConnections.map((connection) => connection.id),
    [sshConnections],
  );
  const filteredConnections = useMemo(() => {
    const query = connectionExposureSearchQuery.toLowerCase();
    if (!query) {
      return sshConnections;
    }
    return sshConnections.filter((connection) =>
      [
        connection.name,
        connection.group,
        connection.host,
        connection.username,
        connection.port.toString(),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [connectionExposureSearchQuery, sshConnections]);
  const filteredConnectionIds = useMemo(
    () => filteredConnections.map((connection) => connection.id),
    [filteredConnections],
  );
  const exposedConnectionIds = useMemo(
    () =>
      settings.connection_exposure_mode === "all"
        ? connectionIds
        : connectionIds.filter((id) => settings.exposed_connection_ids.includes(id)),
    [connectionIds, settings.connection_exposure_mode, settings.exposed_connection_ids],
  );
  const exposedConnectionIdSet = useMemo(
    () => new Set(exposedConnectionIds),
    [exposedConnectionIds],
  );
  const connectionExposureDisabled =
    loading || saving || !desktopRuntime || !settings.enabled || !settings.expose_connections;
  const connectionExposureBatchDisabled =
    connectionExposureDisabled || filteredConnectionIds.length === 0;
  const remoteStatus = settings.remote_status;
  const remoteMcpUrl = `http://127.0.0.1:${settings.remote_port.toString()}/mcp`;
  const remoteSseUrl = `http://127.0.0.1:${settings.remote_port.toString()}/sse`;
  const remoteToken = settings.remote_token || settings.generated_remote_token || null;
  const remoteTokenForSnippet = remoteToken || t("settings.mcp.tokenPlaceholder");
  const configSnippet = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            mxterm: {
              command: executablePath,
              args: [],
            },
          },
        },
        null,
        2,
      ),
    [executablePath],
  );
  const remoteConfigSnippet = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            mxterm: {
              type: "streamable-http",
              url: remoteMcpUrl,
              headers: {
                Authorization: `Bearer ${remoteTokenForSnippet}`,
              },
            },
          },
        },
        null,
        2,
      ),
    [remoteMcpUrl, remoteTokenForSnippet],
  );
  const legacySseConfigSnippet = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            mxterm: {
              type: "sse",
              url: remoteSseUrl,
              headers: {
                Authorization: `Bearer ${remoteTokenForSnippet}`,
              },
            },
          },
        },
        null,
        2,
      ),
    [remoteSseUrl, remoteTokenForSnippet],
  );
  const configTabs = [
    {
      id: "stdio" as const,
      label: "stdio client",
      title: t("settings.mcp.config.stdio.title"),
      description: t("settings.mcp.config.stdio.description"),
      snippet: configSnippet,
      copied,
      setCopied,
    },
    {
      id: "remote-http" as const,
      label: t("settings.mcp.config.remote.label"),
      title: t("settings.mcp.config.remote.title"),
      description:
        t("settings.mcp.config.remote.description"),
      snippet: remoteConfigSnippet,
      copied: remoteConfigCopied,
      setCopied: setRemoteConfigCopied,
    },
    {
      id: "legacy-sse" as const,
      label: t("settings.mcp.config.sse.label"),
      title: t("settings.mcp.config.sse.title"),
      description: t("settings.mcp.config.sse.description"),
      snippet: legacySseConfigSnippet,
      copied: legacySseConfigCopied,
      setCopied: setLegacySseConfigCopied,
    },
  ];
  const activeConfig = configTabs.find((tab) => tab.id === activeConfigTab) ?? configTabs[0];

  useEffect(() => {
    setRemotePortDraft(settings.remote_port.toString());
    setRemoteTokenDraft(remoteToken || "");
  }, [remoteToken, settings.remote_port]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!desktopRuntime) {
        setSettings(defaultMcpSettings);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const [next, nextRemoteLog] = await Promise.all([
          mcpSettingsGet(),
          mcpRemoteLogRead().catch(() => null),
        ]);
        const nextExecutablePath = await mcpExecutablePath().catch(() => executablePath);
        if (!cancelled) {
          setSettings(next);
          setRemoteLog(nextRemoteLog);
          setExecutablePath(nextExecutablePath);
          setError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : t("settings.mcp.error.load"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [desktopRuntime, t]);

  async function saveUpdate(update: Partial<McpSettings>) {
    if (!desktopRuntime) {
      setError(t("settings.mcp.error.desktop"));
      return;
    }
    const previous = settings;
    const next = { ...settings, ...update };
    setSettings(next);
    setSaving(true);
    setError(null);
    try {
      const payload: McpSettings = {
        ...next,
        remote_host: "127.0.0.1",
        remote_host_stored: "127.0.0.1",
        remote_host_downgraded: false,
        remote_exposure_acknowledged: false,
      };
      const saved = await mcpSettingsSave(payload);
      setSettings(saved);
    } catch (error) {
      setSettings(previous);
      setError(error instanceof Error ? error.message : t("settings.mcp.error.save"));
    } finally {
      setSaving(false);
    }
  }

  function setAllConnectionExposure(exposed: boolean) {
    if (!connectionExposureSearchActive) {
      void saveUpdate(
        exposed
          ? {
              connection_exposure_mode: "all",
              exposed_connection_ids: [],
            }
          : {
              connection_exposure_mode: "custom",
              exposed_connection_ids: [],
            },
      );
      return;
    }

    const nextIds = new Set(exposedConnectionIds);
    for (const connectionId of filteredConnectionIds) {
      if (exposed) {
        nextIds.add(connectionId);
      } else {
        nextIds.delete(connectionId);
      }
    }
    void saveUpdate({
      connection_exposure_mode: "custom",
      exposed_connection_ids: connectionIds.filter((id) => nextIds.has(id)),
    });
  }

  function setConnectionExposure(connectionId: string, exposed: boolean) {
    const nextIds = new Set(exposedConnectionIds);
    if (exposed) {
      nextIds.add(connectionId);
    } else {
      nextIds.delete(connectionId);
    }
    void saveUpdate({
      connection_exposure_mode: "custom",
      exposed_connection_ids: connectionIds.filter((id) => nextIds.has(id)),
    });
  }

  async function copyText(text: string, onCopied: (copied: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      onCopied(true);
      window.setTimeout(() => onCopied(false), 1600);
    } catch {
      setError(t("settings.mcp.error.clipboard"));
    }
  }

  async function saveRemoteEndpoint() {
    const remote_port = Number(remotePortDraft);
    if (!Number.isInteger(remote_port) || remote_port < 1 || remote_port > 65535) {
      setError(t("settings.mcp.error.port"));
      return;
    }
    if (remote_port === settings.remote_port) {
      return;
    }
    await saveUpdate({
      remote_host: "127.0.0.1",
      remote_host_stored: "127.0.0.1",
      remote_host_downgraded: false,
      remote_exposure_acknowledged: false,
      remote_port,
    });
  }

  async function saveRemoteToken() {
    const remote_token = remoteTokenDraft.trim();
    if (!remote_token) {
      if (settings.remote_token_saved) {
        setRemoteTokenDraft(remoteToken || "");
      } else {
        setError(t("settings.mcp.error.token"));
      }
      return;
    }
    if (remote_token === remoteToken) {
      return;
    }
    await saveUpdate({ remote_token });
  }

  async function refreshRemoteStatus() {
    if (!desktopRuntime) {
      return;
    }
    setRemoteActionBusy("status");
    setError(null);
    try {
      const status = await mcpRemoteServiceStatus();
      setSettings((current) => ({
        ...current,
        remote_status: status,
        remote_token_saved: status.token_saved,
        remote_token_preview: status.token_preview,
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : t("settings.mcp.error.status"));
    } finally {
      setRemoteActionBusy(null);
    }
  }

  async function restartRemoteService() {
    if (!desktopRuntime) {
      return;
    }
    setRemoteActionBusy("restart");
    setError(null);
    try {
      const status = await mcpRemoteServiceRestart();
      setSettings((current) => ({
        ...current,
        remote_status: status,
        remote_token_saved: status.token_saved,
        remote_token_preview: status.token_preview,
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : t("settings.mcp.error.restart"));
    } finally {
      setRemoteActionBusy(null);
    }
  }

  async function refreshRemoteLog() {
    if (!desktopRuntime) {
      return;
    }
    setRemoteActionBusy("log");
    try {
      setRemoteLog(await mcpRemoteLogRead());
    } catch (error) {
      setError(error instanceof Error ? error.message : t("settings.mcp.error.logRead"));
    } finally {
      setRemoteActionBusy(null);
    }
  }

  async function clearRemoteLog() {
    if (!desktopRuntime) {
      return;
    }
    setRemoteActionBusy("clear-log");
    try {
      setRemoteLog(await mcpRemoteLogClear());
    } catch (error) {
      setError(error instanceof Error ? error.message : t("settings.mcp.error.logClear"));
    } finally {
      setRemoteActionBusy(null);
    }
  }

  async function rotateRemoteToken() {
    if (!desktopRuntime) {
      return;
    }
    setRemoteActionBusy("token");
    setError(null);
    try {
      const next = await mcpRemoteTokenRotate();
      setSettings(next);
      setTokenCopied(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("settings.mcp.error.tokenReset"));
    } finally {
      setRemoteActionBusy(null);
    }
  }

  return (
    <section className="settings-page-section">
      <header className="settings-section-head">
        <h1>MCP</h1>
        <p>{t("settings.mcp.description")}</p>
      </header>

      <div className="settings-panel mcp-settings-panel">
        <SettingsRow
          icon={Waypoints}
          title={t("settings.mcp.enable.title")}
          description={t("settings.mcp.enable.description")}
        >
          <SettingsToggle
            checked={settings.enabled}
            disabled={loading || saving || !desktopRuntime}
            label={t("settings.mcp.enable.label")}
            onChange={(enabled) => void saveUpdate({ enabled })}
          />
        </SettingsRow>

        <SettingsRow
          icon={Server}
          title={t("settings.mcp.expose.title")}
          description={t("settings.mcp.expose.description")}
        >
          <SettingsToggle
            checked={settings.expose_connections}
            disabled={loading || saving || !desktopRuntime || !settings.enabled}
            label={t("settings.mcp.expose.label")}
            onChange={(expose_connections) => void saveUpdate({ expose_connections })}
          />
        </SettingsRow>

        <SettingsRow
          icon={Terminal}
          title={t("settings.mcp.ssh.title")}
          description={t("settings.mcp.ssh.description")}
        >
          <SettingsToggle
            checked={settings.ssh_operations_enabled}
            disabled={loading || saving || !desktopRuntime || !settings.enabled}
            label={t("settings.mcp.ssh.label")}
            onChange={(ssh_operations_enabled) => void saveUpdate({ ssh_operations_enabled })}
          />
        </SettingsRow>

        <SettingsRow
          icon={ShieldCheck}
          title={t("settings.mcp.dangerous.title")}
          description={t("settings.mcp.dangerous.description")}
        >
          <SettingsToggle
            checked={settings.allow_dangerous_commands}
            disabled={
              loading ||
              saving ||
              !desktopRuntime ||
              !settings.enabled ||
              !settings.ssh_operations_enabled
            }
            label={t("settings.mcp.dangerous.label")}
            onChange={(allow_dangerous_commands) =>
              void saveUpdate({ allow_dangerous_commands })
            }
          />
        </SettingsRow>

        <SettingsRow
          icon={Globe2}
          title={t("settings.mcp.remote.title")}
          description={t("settings.mcp.remote.description")}
        >
          <SettingsToggle
            checked={settings.remote_enabled}
            disabled={loading || saving || !desktopRuntime || !settings.enabled}
            label={t("settings.mcp.remote.label")}
            onChange={(remote_enabled) => void saveUpdate({ remote_enabled })}
          />
        </SettingsRow>

        <div className="mcp-remote-service-block">
          <div className="mcp-remote-fields">
            <label className="mcp-remote-field">
              <span>{t("settings.mcp.remote.host")}</span>
              <input
                className="settings-input"
                value="127.0.0.1"
                disabled
                readOnly
              />
            </label>
            <label className="mcp-remote-field">
              <span>{t("settings.mcp.remote.port")}</span>
              <input
                className="settings-input"
                type="number"
                min={1}
                max={65535}
                value={remotePortDraft}
                disabled={loading || saving || !desktopRuntime}
                onBlur={() => void saveRemoteEndpoint()}
                onChange={(event) => setRemotePortDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
          </div>

          <p className="settings-note">
            {t("settings.mcp.remote.note")}
            <code>{`ssh -N -L ${settings.remote_port.toString()}:127.0.0.1:${settings.remote_port.toString()} <user>@<nexaterm-host>`}</code>
          </p>

          <div className="mcp-remote-actions">
            <span
              className={`mcp-remote-status ${
                remoteStatus?.running ? "is-running" : settings.remote_enabled ? "is-warn" : ""
              }`}
              title={remoteStatus?.pid ? `PID ${remoteStatus.pid.toString()}` : undefined}
            >
              {remoteStatus?.running
                ? remoteStatus.pid
                  ? t("settings.mcp.remote.runningPid", { pid: remoteStatus.pid })
                  : t("settings.mcp.remote.running")
                : settings.remote_enabled
                ? t("settings.mcp.remote.notRunning")
                : t("settings.mcp.remote.disabled")}
            </span>
            <button
              className="settings-action-button"
              type="button"
              disabled={!desktopRuntime || remoteActionBusy === "status"}
              onClick={() => void refreshRemoteStatus()}
            >
              {remoteActionBusy === "status" ? (
                <Loader2 className="ui-icon spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="ui-icon" aria-hidden="true" />
              )}
              <span>{t("settings.mcp.remote.refresh")}</span>
            </button>
            <button
              className="settings-action-button"
              type="button"
              disabled={
                !desktopRuntime ||
                !settings.remote_enabled ||
                !settings.remote_token_saved ||
                remoteActionBusy === "restart"
              }
              onClick={() => void restartRemoteService()}
            >
              {remoteActionBusy === "restart" ? (
                <Loader2 className="ui-icon spin" aria-hidden="true" />
              ) : (
                <Power className="ui-icon" aria-hidden="true" />
              )}
              <span>{t("settings.mcp.remote.restart")}</span>
            </button>
          </div>

          <div className="mcp-remote-runtime-meta">
            <span>{t("settings.mcp.remote.health", { value: remoteStatus?.healthy ? t("settings.mcp.remote.healthOk") : settings.remote_enabled ? t("settings.mcp.remote.healthWarn") : t("settings.mcp.remote.healthDisabled") })}</span>
            <span>{t("settings.mcp.remote.restarts", { count: remoteStatus?.restart_count || 0 })}</span>
            {remoteStatus?.started_at ? <span>{t("settings.mcp.remote.started", { value: remoteStatus.started_at })}</span> : null}
            {remoteStatus?.error ? <span className="is-error">{t("settings.mcp.remote.lastError", { value: remoteStatus.error })}</span> : null}
          </div>

          <section className="mcp-remote-log" aria-label={t("settings.mcp.log.aria")}>
            <header>
              <div>
                <strong>{t("settings.mcp.log.title")}</strong>
                <small>{remoteLog?.truncated ? t("settings.mcp.log.truncated") : remoteLog?.path || remoteStatus?.log_path || t("settings.mcp.log.unread")}</small>
              </div>
              <div>
                <Tooltip label={t("settings.mcp.log.refresh")}>
                  <button type="button" aria-label={t("settings.mcp.log.refreshAria")} onClick={() => void refreshRemoteLog()}>
                    {remoteActionBusy === "log" ? <Loader2 className="ui-icon spin" aria-hidden="true" /> : <RefreshCw className="ui-icon" aria-hidden="true" />}
                  </button>
                </Tooltip>
                <Tooltip label={t("settings.mcp.log.copy")}>
                  <button type="button" aria-label={t("settings.mcp.log.copyAria")} disabled={!remoteLog?.content} onClick={() => void navigator.clipboard.writeText(remoteLog?.content || "")}>
                    <Copy className="ui-icon" aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip label={t("settings.mcp.log.open")}>
                  <button type="button" aria-label={t("settings.mcp.log.openAria")} disabled={!remoteLog?.path && !remoteStatus?.log_path} onClick={() => void revealItemInDir(remoteLog?.path || remoteStatus?.log_path || "")}>
                    <FolderOpen className="ui-icon" aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip label={t("settings.mcp.log.clear")}>
                  <button type="button" aria-label={t("settings.mcp.log.clearAria")} disabled={remoteActionBusy === "clear-log"} onClick={() => void clearRemoteLog()}>
                    <Trash2 className="ui-icon" aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
            </header>
            <pre>{remoteLog?.content || t("settings.mcp.log.empty")}</pre>
          </section>

          <div className="mcp-remote-token-line">
            <label className="mcp-remote-token-field">
              <span>{t("settings.mcp.token.title")}</span>
              <input
                className="settings-input"
                value={remoteTokenDraft}
                placeholder={settings.remote_token_saved ? t("settings.mcp.token.revealPlaceholder") : t("settings.mcp.token.generatePlaceholder")}
                disabled={loading || saving || !desktopRuntime}
                onBlur={() => void saveRemoteToken()}
                onChange={(event) => setRemoteTokenDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
              <small>
                {remoteToken
                  ? t("settings.mcp.token.saved", { preview: settings.remote_token_preview ? ` (${settings.remote_token_preview})` : "" })
                  : settings.remote_token_saved
                  ? t("settings.mcp.token.legacy")
                  : t("settings.mcp.token.auto")}
              </small>
            </label>
            <div>
              <button
                className="settings-action-button"
                type="button"
                disabled={!desktopRuntime || remoteActionBusy === "token"}
                onClick={() => void rotateRemoteToken()}
              >
                {remoteActionBusy === "token" ? (
                  <Loader2 className="ui-icon spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="ui-icon" aria-hidden="true" />
                )}
                <span>{t("settings.mcp.token.reset")}</span>
              </button>
              <button
                className="settings-action-button"
                type="button"
                disabled={!remoteToken}
                onClick={() => void copyText(remoteToken || "", setTokenCopied)}
              >
                <Copy className="ui-icon" aria-hidden="true" />
                <span>{tokenCopied ? t("settings.mcp.copied") : t("settings.mcp.token.copy")}</span>
              </button>
            </div>
          </div>

          {remoteStatus?.error ? (
            <p className="settings-path-error" role="alert">
              {remoteStatus.error}
            </p>
          ) : null}
        </div>

        <div className="mcp-config-block">
          <div
            className="settings-segmented mcp-config-tabs"
            role="tablist"
            aria-label={t("settings.mcp.config.aria")}
          >
            {configTabs.map((tab) => (
              <button
                className={tab.id === activeConfigTab ? "active" : ""}
                id={`mcp-config-tab-${tab.id}`}
                key={tab.id}
                type="button"
                role="tab"
                aria-controls={`mcp-config-panel-${tab.id}`}
                aria-selected={tab.id === activeConfigTab}
                onClick={() => setActiveConfigTab(tab.id)}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div>
            <strong>{activeConfig.title}</strong>
            <small>{activeConfig.description}</small>
          </div>
          <button
            className="settings-action-button"
            type="button"
            disabled={!desktopRuntime}
            onClick={() => void copyText(activeConfig.snippet, activeConfig.setCopied)}
          >
            <Check className="ui-icon" aria-hidden="true" />
            <span>{activeConfig.copied ? t("settings.mcp.copied") : t("settings.mcp.config.copy")}</span>
          </button>
          <pre
            id={`mcp-config-panel-${activeConfig.id}`}
            role="tabpanel"
            aria-labelledby={`mcp-config-tab-${activeConfig.id}`}
          >
            {activeConfig.snippet}
          </pre>
        </div>

        {!desktopRuntime ? (
          <p className="settings-note">{t("settings.mcp.preview")}</p>
        ) : null}
        {error ? (
          <p className="settings-path-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="settings-panel mcp-connection-exposure-panel">
        <div className="mcp-connection-exposure-head">
          <span>
            <strong>{t("settings.mcp.connections.title")}</strong>
            <small>
              {connectionExposureSearchActive
                ? t("settings.mcp.connections.searchSummary", { matched: filteredConnections.length, total: sshConnections.length, exposed: exposedConnectionIds.length })
                : settings.connection_exposure_mode === "all"
                ? t("settings.mcp.connections.allSummary", { total: sshConnections.length })
                : t("settings.mcp.connections.customSummary", { exposed: exposedConnectionIds.length, total: sshConnections.length })}
            </small>
          </span>
          <div>
            <button
              className="settings-action-button"
              type="button"
              disabled={connectionExposureBatchDisabled}
              onClick={() => setAllConnectionExposure(true)}
            >
              {connectionExposureSearchActive ? t("settings.mcp.connections.openMatched") : t("settings.mcp.connections.openAll")}
            </button>
            <button
              className="settings-action-button"
              type="button"
              disabled={connectionExposureBatchDisabled}
              onClick={() => setAllConnectionExposure(false)}
            >
              {connectionExposureSearchActive ? t("settings.mcp.connections.closeMatched") : t("settings.mcp.connections.closeAll")}
            </button>
          </div>
        </div>
        <div className="mcp-connection-exposure-tools">
          <label className="mcp-connection-search">
            <Search className="ui-icon" aria-hidden="true" />
            <input
              type="search"
              value={connectionExposureQuery}
              placeholder={t("settings.mcp.connections.searchPlaceholder")}
              aria-label={t("settings.mcp.connections.searchAria")}
              onChange={(event) => setConnectionExposureQuery(event.currentTarget.value)}
            />
          </label>
        </div>
        <div className="mcp-connection-exposure-list">
          {sshConnections.length === 0 ? (
            <p className="settings-note">{t("settings.mcp.connections.empty")}</p>
          ) : filteredConnections.length === 0 ? (
            <p className="settings-note">{t("settings.mcp.connections.noMatch")}</p>
          ) : (
            filteredConnections.map((connection) => {
              const exposed = exposedConnectionIdSet.has(connection.id);
              return (
                <div className="mcp-connection-exposure-row" key={connection.id}>
                  <span>
                    <strong>{connection.name}</strong>
                    <small>
                      {connection.username}@{connection.host}:{connection.port.toString()}
                    </small>
                  </span>
                  <SettingsToggle
                    checked={exposed}
                    disabled={connectionExposureDisabled}
                    label={t("settings.mcp.connections.toggle", { name: connection.name })}
                    onChange={(nextExposed) =>
                      setConnectionExposure(connection.id, nextExposed)
                    }
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function SecuritySettingsSection({
  busy,
  error,
  settings,
  onDisableMasterPassword,
  onEnableMasterPassword,
  onUnlockSecuritySettings,
  onUpdate,
}: {
  busy: boolean;
  error: string | null;
  settings: SecuritySettings;
  onDisableMasterPassword: () => Promise<boolean>;
  onEnableMasterPassword: (masterPassword: string) => Promise<boolean>;
  onUnlockSecuritySettings: (masterPassword: string) => Promise<boolean>;
  onUpdate: (update: Partial<SecuritySettings>) => void;
}) {
  const { t } = useI18n();
  const [enabling, setEnabling] = useState(false);
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [nextPassword, setNextPassword] = useState("");
  const [nextConfirmPassword, setNextConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.masterPasswordEnabled) {
      setSettingsUnlocked(false);
      setUnlockPassword("");
      setChangingPassword(false);
    }
  }, [settings.masterPasswordEnabled]);

  async function submitEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = masterPassword.trim();
    if (!password) {
      setLocalError(t("settings.security.error.passwordRequired"));
      return;
    }
    if (password !== confirmPassword.trim()) {
      setLocalError(t("settings.security.error.passwordMismatch"));
      return;
    }

    setLocalError(null);
    const ok = await onEnableMasterPassword(password);
    if (ok) {
      onUpdate({ masterPasswordEnabled: true });
      setSettingsUnlocked(false);
      setMasterPassword("");
      setConfirmPassword("");
      setEnabling(false);
    }
  }

  async function submitUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = unlockPassword.trim();
    if (!password) {
      setLocalError(t("settings.security.error.passwordRequired"));
      return;
    }
    setLocalError(null);
    const ok = await onUnlockSecuritySettings(password);
    if (ok) {
      setSettingsUnlocked(true);
      setUnlockPassword("");
    }
  }

  async function submitChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = nextPassword.trim();
    if (!password) {
      setLocalError(t("settings.security.error.newPasswordRequired"));
      return;
    }
    if (password !== nextConfirmPassword.trim()) {
      setLocalError(t("settings.security.error.passwordMismatch"));
      return;
    }
    setLocalError(null);
    const ok = await onEnableMasterPassword(password);
    if (ok) {
      setChangingPassword(false);
      setNextPassword("");
      setNextConfirmPassword("");
    }
  }

  async function disableMasterPassword() {
    setLocalError(null);
    const ok = await onDisableMasterPassword();
    if (ok) {
      onUpdate({ masterPasswordEnabled: false });
      setEnabling(false);
      setSettingsUnlocked(false);
    }
  }

  const autoLockOptions = [
    { label: t("settings.security.autoLock.never"), value: "0" },
    { label: t("settings.security.autoLock.minutes", { count: 5 }), value: "5" },
    { label: t("settings.security.autoLock.minutes", { count: 15 }), value: "15" },
    { label: t("settings.security.autoLock.minutes", { count: 30 }), value: "30" },
    { label: t("settings.security.autoLock.minutes", { count: 60 }), value: "60" },
  ];

  return (
    <section className="settings-page-section">
      <header className="settings-section-head">
        <h1>{t("settings.security.title")}</h1>
        <p>{t("settings.security.description")}</p>
      </header>

      <div className="settings-panel">
        <SettingsRow
          icon={LockKeyhole}
          title={t("settings.security.advanced.title")}
          description={
            settings.masterPasswordEnabled
              ? t("settings.security.advanced.enabledDescription")
              : t("settings.security.advanced.disabledDescription")
          }
        >
          <SettingsToggle
            checked={settings.masterPasswordEnabled}
            label={t("settings.security.advanced.label")}
            onChange={(checked) => {
              if (checked) {
                setEnabling(true);
                setLocalError(null);
              } else if (settingsUnlocked) {
                void disableMasterPassword();
              }
            }}
            disabled={settings.masterPasswordEnabled && !settingsUnlocked}
          />
        </SettingsRow>

        {!settings.masterPasswordEnabled && enabling ? (
          <form className="settings-security-master-form" onSubmit={submitEnable}>
            <label className="credential-field">
              <span>{t("settings.security.password")}</span>
              <input
                className="settings-input"
                type="password"
                autoComplete="new-password"
                value={masterPassword}
                onChange={(event) => setMasterPassword(event.currentTarget.value)}
              />
            </label>
            <label className="credential-field">
              <span>{t("settings.security.passwordConfirm")}</span>
              <input
                className="settings-input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.currentTarget.value)}
              />
            </label>
            <div className="settings-security-master-actions">
              <button className="settings-action-button" type="submit" disabled={busy}>
                {t("settings.security.enable")}
              </button>
              <button
                className="settings-action-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setEnabling(false);
                  setLocalError(null);
                  setMasterPassword("");
                  setConfirmPassword("");
                }}
              >
                {t("settings.security.cancel")}
              </button>
            </div>
          </form>
        ) : null}

        {settings.masterPasswordEnabled && !settingsUnlocked ? (
          <form className="settings-security-master-form" onSubmit={submitUnlock}>
            <label className="credential-field">
              <span>{t("settings.security.password")}</span>
              <input
                className="settings-input"
                type="password"
                autoComplete="current-password"
                value={unlockPassword}
                onChange={(event) => setUnlockPassword(event.currentTarget.value)}
              />
            </label>
            <div className="settings-security-master-actions">
              <button className="settings-action-button" type="submit" disabled={busy}>
                {t("settings.security.unlock")}
              </button>
            </div>
          </form>
        ) : null}

        {settings.masterPasswordEnabled && settingsUnlocked ? (
          <>
            <SettingsRow
              icon={Clock3}
              title={t("settings.security.autoLock.title")}
              description={t("settings.security.autoLock.description")}
            >
              <AppSelect
                ariaLabel={t("settings.security.autoLock.aria")}
                className="settings-select"
                value={String(settings.autoLockMinutes)}
                options={autoLockOptions}
                onChange={(value) =>
                  onUpdate({ autoLockMinutes: Number(value) as SecuritySettings["autoLockMinutes"] })
                }
              />
            </SettingsRow>

            <SettingsRow
              icon={Eye}
              title={t("settings.security.reveal.title")}
              description={t("settings.security.reveal.description")}
            >
              <SettingsToggle
                checked={settings.allowPasswordReveal}
                label={t("settings.security.reveal.label")}
                onChange={(allowPasswordReveal) => onUpdate({ allowPasswordReveal })}
              />
            </SettingsRow>

            {changingPassword ? (
              <form className="settings-security-master-form" onSubmit={submitChangePassword}>
                <label className="credential-field">
                  <span>{t("settings.security.newPassword")}</span>
                  <input
                    className="settings-input"
                    type="password"
                    autoComplete="new-password"
                    value={nextPassword}
                    onChange={(event) => setNextPassword(event.currentTarget.value)}
                  />
                </label>
                <label className="credential-field">
                  <span>{t("settings.security.passwordConfirm")}</span>
                  <input
                    className="settings-input"
                    type="password"
                    autoComplete="new-password"
                    value={nextConfirmPassword}
                    onChange={(event) => setNextConfirmPassword(event.currentTarget.value)}
                  />
                </label>
                <div className="settings-security-master-actions">
                  <button className="settings-action-button" type="submit" disabled={busy}>
                    {t("settings.security.saveNewPassword")}
                  </button>
                  <button
                    className="settings-action-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setChangingPassword(false);
                      setNextPassword("");
                      setNextConfirmPassword("");
                    }}
                  >
                    {t("settings.security.cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="settings-security-master-actions">
                <button
                  className="settings-action-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setChangingPassword(true)}
                >
                  {t("settings.security.changePassword")}
                </button>
                <button
                  className="danger-button credential-danger-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void disableMasterPassword()}
                >
                  {t("settings.security.disable")}
                </button>
              </div>
            )}
          </>
        ) : null}

        <p className="settings-note">
          {t("settings.security.note")}
        </p>

        {localError || error ? (
          <p className="settings-path-error" role="alert">
            {localError || error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CredentialSettingsSection({
  allowPasswordReveal,
  credentials,
  error,
  loading,
  onDelete,
  onSave,
}: {
  allowPasswordReveal: boolean;
  credentials: CredentialProfile[];
  error: string | null;
  loading: boolean;
  onDelete: (credential: CredentialProfile) => Promise<void>;
  onSave: (input: CredentialProfileInput) => Promise<void>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<CredentialProfile | null>(null);
  const [form, setForm] = useState<CredentialProfileInput>(emptyCredentialForm());
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CredentialProfile | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | ConnectionAuthKind>("all");
  const [query, setQuery] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const passwordCount = credentials.filter((credential) => credential.kind === "password").length;
  const privateKeyCount = credentials.length - passwordCount;
  const filteredCredentials = useMemo(
    () =>
      credentials.filter((credential) => {
        const matchesKind = kindFilter === "all" || credential.kind === kindFilter;
        const keyword = query.trim().toLowerCase();
        const matchesQuery =
          !keyword ||
          credential.name.toLowerCase().includes(keyword) ||
          (credential.username || "").toLowerCase().includes(keyword) ||
          (credential.notes || "").toLowerCase().includes(keyword);
        return matchesKind && matchesQuery;
      }),
    [credentials, kindFilter, query],
  );
  const editingKindLabel =
    form.kind === "private_key"
      ? t("settings.credentials.kind.privateKeyShort")
      : t("settings.credentials.kind.passwordShort");

  function startCreate(kind: ConnectionAuthKind = "password") {
    setEditing(null);
    setForm(emptyCredentialForm(kind));
    setFormError(null);
    setShowSecret(false);
    setShowPassphrase(false);
  }

  function startEdit(credential: CredentialProfile) {
    setEditing(credential);
    setForm({
      id: credential.id,
      kind: credential.kind,
      name: credential.name,
      username: credential.username || "",
      notes: credential.notes || "",
      password: "",
      password_touched: false,
      private_key_passphrase: "",
      private_key_passphrase_touched: false,
      private_key_path: credential.private_key_path || "",
    });
    setFormError(null);
    setShowSecret(false);
    setShowPassphrase(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await onSave(form);
      startCreate(form.kind);
    } catch (nextError) {
      setFormError(formatError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await onDelete(deleteTarget);
      if (editing?.id === deleteTarget.id) {
        startCreate(deleteTarget.kind);
      }
      setDeleteTarget(null);
    } catch (nextError) {
      setFormError(formatError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function choosePrivateKeyPath() {
    if (!hasTauriRuntime()) {
      return;
    }
    setFormError(null);
    try {
      const selectedPath = await selectLocalPrivateKeyFile();
      if (selectedPath) {
        setForm((current) => ({ ...current, private_key_path: selectedPath }));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("settings.credentials.error.privateKeyPicker"));
    }
  }

  return (
    <section className="settings-page-section credential-page-section">
      <header className="settings-section-head settings-section-head-row">
        <span>
          <h1>{t("settings.credentials.title")}</h1>
          <p>{t("settings.credentials.description")}</p>
        </span>
        <button
          className="repository-primary-button credential-new-button"
          type="button"
          onClick={() => startCreate()}
        >
          <Plus className="ui-icon" aria-hidden="true" />
          <span>{t("settings.credentials.new")}</span>
        </button>
      </header>

      <div className="credential-settings-layout">
        <section className="settings-panel credential-list-panel" aria-label={t("settings.credentials.listAria")}>
          <header className="credential-list-head">
            <span>
              <strong>{t("settings.credentials.library")}</strong>
              <small>{credentialSummary(credentials.length, passwordCount, privateKeyCount, t)}</small>
            </span>
            <button
              className="repository-icon-button"
              type="button"
              aria-label={t("settings.credentials.newPrivateKeyAria")}
              onClick={() => startCreate("private_key")}
            >
              <FileKey className="ui-icon" aria-hidden="true" />
            </button>
          </header>

          <div className="credential-list-tools">
            <label className="credential-search">
              <Search className="ui-icon" aria-hidden="true" />
              <input
                value={query}
                placeholder={t("settings.credentials.searchPlaceholder")}
                aria-label={t("settings.credentials.searchAria")}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
            <SegmentedControl
              value={kindFilter}
              options={[
                { value: "all", label: t("settings.credentials.filter.all") },
                { value: "password", label: t("settings.credentials.kind.password") },
                { value: "private_key", label: t("settings.credentials.kind.privateKey") },
              ]}
              onChange={setKindFilter}
            />
          </div>

          <div className="credential-list-body">
            {loading ? <p className="settings-note">{t("settings.credentials.loading")}</p> : null}
            {error ? <p className="form-error credential-list-error">{error}</p> : null}
            {credentials.length === 0 && !loading ? (
              <div className="credential-empty-state">
                <ShieldCheck className="ui-icon" aria-hidden="true" />
                <strong>{t("settings.credentials.empty.title")}</strong>
                <small>{t("settings.credentials.empty.description")}</small>
                <div>
                  <button type="button" onClick={() => startCreate("password")}>
                    {t("settings.credentials.empty.newPassword")}
                  </button>
                  <button type="button" onClick={() => startCreate("private_key")}>
                    {t("settings.credentials.empty.newPrivateKey")}
                  </button>
                </div>
              </div>
            ) : null}
            {credentials.length > 0 && filteredCredentials.length === 0 ? (
              <p className="settings-note">{t("settings.credentials.noMatch")}</p>
            ) : null}
            {filteredCredentials.map((credential) => {
              const Icon = credential.kind === "private_key" ? FileKey : KeyRound;
              return (
                <button
                  className={`credential-list-item ${
                    editing?.id === credential.id ? "active" : ""
                  }`}
                  key={credential.id}
                  type="button"
                  onClick={() => startEdit(credential)}
                >
                  <span className="credential-list-icon">
                    <Icon className="ui-icon" aria-hidden="true" />
                  </span>
                  <span className="credential-list-copy">
                    <strong>{credential.name}</strong>
                    <small>
                      {credential.username || t("settings.credentials.noUsername")}
                      {` · ${credential.kind === "private_key" ? t("settings.credentials.kind.privateKey") : t("settings.credentials.kind.password")}`}
                      {credential.notes ? ` · ${credential.notes}` : ""}
                    </small>
                  </span>
                  <span className="credential-list-kind">
                    {credential.kind === "private_key" ? t("settings.credentials.kind.privateKey") : t("settings.credentials.kind.password")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <form className="settings-panel credential-form-panel" onSubmit={submit}>
          <header className="credential-form-head">
            <span className="credential-form-icon">
              {form.kind === "private_key" ? (
                <FileKey className="ui-icon" aria-hidden="true" />
              ) : (
                <KeyRound className="ui-icon" aria-hidden="true" />
              )}
            </span>
            <span>
              <strong>{editing ? t("settings.credentials.edit") : t("settings.credentials.create", { kind: editingKindLabel })}</strong>
              <small>{t("settings.credentials.formDescription")}</small>
            </span>
          </header>

          <div className="credential-form-body">
            <label className="credential-field credential-field-name">
              <span>{t("settings.credentials.name")}</span>
              <input
                className="settings-input"
                value={form.name || ""}
                placeholder={t("settings.credentials.namePlaceholder")}
                aria-label={t("settings.credentials.nameAria")}
                onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
              />
            </label>
            <label className="credential-field credential-field-kind">
              <span>{t("settings.credentials.type")}</span>
              <AppSelect
                ariaLabel={t("settings.credentials.typeAria")}
                className="settings-select"
                value={form.kind}
                options={[{ label: t("settings.credentials.kind.password"), value: "password" }, { label: t("settings.credentials.kind.privateKey"), value: "private_key" }]}
                onChange={(kind) => {
                  setForm(emptyCredentialForm(kind, form));
                  setShowSecret(false);
                  setShowPassphrase(false);
                }}
              />
            </label>

            <label className="credential-field credential-field-full">
              <span>{t("settings.credentials.username")}</span>
              <input
                className="settings-input"
                {...usernameInputAttributes}
                value={form.username || ""}
                placeholder={t("settings.credentials.usernamePlaceholder")}
                aria-label={t("settings.credentials.usernameAria")}
                onChange={(event) => setForm({ ...form, username: event.currentTarget.value })}
              />
            </label>

            {form.kind === "password" ? (
              <label className="credential-field credential-field-full">
                <span>{t("settings.credentials.password")}</span>
                <div className="credential-secret-field">
                  <LockKeyhole className="ui-icon" aria-hidden="true" />
                  <input
                    type={showSecret ? "text" : "password"}
                    value={form.password || ""}
                    placeholder={editing ? t("settings.credentials.passwordKeep") : t("settings.credentials.passwordInput")}
                    aria-label={t("settings.credentials.passwordAria")}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        password: event.currentTarget.value,
                        password_touched: true,
                      })
                    }
                  />
                  {allowPasswordReveal ? (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={showSecret ? t("settings.credentials.passwordHide") : t("settings.credentials.passwordShow")}
                      onClick={() => void toggleCredentialSecretVisibility()}
                    >
                      {showSecret ? (
                        <EyeOff className="ui-icon" aria-hidden="true" />
                      ) : (
                        <Eye className="ui-icon" aria-hidden="true" />
                      )}
                    </button>
                  ) : null}
                </div>
              </label>
            ) : (
              <>
                <label className="credential-field credential-field-full">
                  <span>{t("settings.credentials.privateKeyPath")}</span>
                  <div className="settings-path-picker credential-private-key-picker">
                    <input
                      className="settings-input settings-path-input"
                      value={form.private_key_path || ""}
                      placeholder="~/.ssh/id_ed25519"
                      aria-label={t("settings.credentials.privateKeyPathAria")}
                      onChange={(event) =>
                        setForm({ ...form, private_key_path: event.currentTarget.value })
                      }
                    />
                    <button
                      className="settings-action-button settings-path-button"
                      type="button"
                      aria-label={t("settings.credentials.privateKeyChooseAria")}
                      onClick={choosePrivateKeyPath}
                    >
                      <FolderOpen className="ui-icon" aria-hidden="true" />
                      <span>{t("settings.credentials.choose")}</span>
                    </button>
                  </div>
                </label>
                <label className="credential-field credential-field-full">
                  <span>{t("settings.credentials.passphrase")}</span>
                  <div className="credential-secret-field">
                    <LockKeyhole className="ui-icon" aria-hidden="true" />
                    <input
                      type={showPassphrase ? "text" : "password"}
                      value={form.private_key_passphrase || ""}
                      placeholder={editing ? t("settings.credentials.passphraseKeep") : t("settings.credentials.optional")}
                      aria-label={t("settings.credentials.passphraseAria")}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          private_key_passphrase: event.currentTarget.value,
                          private_key_passphrase_touched: true,
                        })
                      }
                    />
                    {allowPasswordReveal ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={showPassphrase ? t("settings.credentials.passphraseHide") : t("settings.credentials.passphraseShow")}
                        onClick={() => void toggleCredentialPassphraseVisibility()}
                      >
                        {showPassphrase ? (
                          <EyeOff className="ui-icon" aria-hidden="true" />
                        ) : (
                          <Eye className="ui-icon" aria-hidden="true" />
                        )}
                      </button>
                    ) : null}
                  </div>
                </label>
              </>
            )}

            <label className="credential-field credential-field-full">
              <span>{t("settings.credentials.notes")}</span>
              <textarea
                className="settings-input credential-notes-input"
                value={form.notes || ""}
                placeholder={t("settings.credentials.notesPlaceholder")}
                aria-label={t("settings.credentials.notesAria")}
                onChange={(event) => setForm({ ...form, notes: event.currentTarget.value })}
              />
            </label>
          </div>

          {formError ? <p className="form-error credential-form-error">{formError}</p> : null}

          <footer className="credential-form-actions">
            <div>
              {editing ? (
                <button
                  className="danger-button credential-danger-button"
                  disabled={busy}
                  type="button"
                  onClick={() => setDeleteTarget(editing)}
                >
                  <Trash2 className="ui-icon" aria-hidden="true" />
                  {t("settings.credentials.delete")}
                </button>
              ) : null}
            </div>
            <div>
              <button disabled={busy} type="button" onClick={() => startCreate(form.kind)}>
                {t("settings.credentials.clear")}
              </button>
              <button className="primary-button" disabled={busy} type="submit">
                <ShieldCheck className="ui-icon" aria-hidden="true" />
                {t("settings.credentials.save")}
              </button>
            </div>
          </footer>
        </form>
      </div>

      <ConfirmDialog
        confirmLabel={t("settings.credentials.deleteConfirm")}
        description={
          deleteTarget
            ? t("settings.credentials.deleteDescription", { name: deleteTarget.name })
            : ""
        }
        open={Boolean(deleteTarget)}
        title={t("settings.credentials.deleteTitle")}
        onConfirm={confirmDelete}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </section>
  );

  async function toggleCredentialSecretVisibility() {
    if (showSecret) {
      setShowSecret(false);
      return;
    }
    if (!form.password && editing?.id) {
      await revealCredentialSecret("password");
      return;
    }
    setShowSecret(true);
  }

  async function toggleCredentialPassphraseVisibility() {
    if (showPassphrase) {
      setShowPassphrase(false);
      return;
    }
    if (!form.private_key_passphrase && editing?.id) {
      await revealCredentialSecret("private_key");
      return;
    }
    setShowPassphrase(true);
  }

  async function revealCredentialSecret(kind: ConnectionAuthKind) {
    if (!editing?.id) {
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const secret = await credentialRevealSecret(editing.id);
      if (secret.kind !== kind) {
        return;
      }
      if (kind === "password") {
        setForm((current) => ({
          ...current,
          password: secret.password || "",
          password_touched: false,
        }));
        setShowSecret(true);
      } else {
        setForm((current) => ({
          ...current,
          private_key_passphrase: secret.private_key_passphrase || "",
          private_key_passphrase_touched: false,
        }));
        setShowPassphrase(true);
      }
    } catch (nextError) {
      setFormError(formatError(nextError));
    } finally {
      setBusy(false);
    }
  }
}

function emptyCredentialForm(
  kind: ConnectionAuthKind = "password",
  base?: CredentialProfileInput,
): CredentialProfileInput {
  return {
    id: base?.id,
    kind,
    name: base?.name || "",
    username: base?.username || "",
    notes: base?.notes || "",
    password: kind === "password" ? base?.password || "" : "",
    password_touched: false,
    private_key_passphrase:
      kind === "private_key" ? base?.private_key_passphrase || "" : "",
    private_key_passphrase_touched: false,
    private_key_path: kind === "private_key" ? base?.private_key_path || "" : "",
  };
}

function credentialSummary(total: number, passwordCount: number, privateKeyCount: number, t: Translate) {
  if (total === 0) {
    return t("settings.credentials.summary.zero");
  }
  return t("settings.credentials.summary", {
    total,
    password: passwordCount,
    privateKey: privateKeyCount,
  });
}

function formatError(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return String(error);
}

function formatSettingsError(error: unknown, fallback: string) {
  const message = formatError(error);
  return message && message !== "[object Object]" ? message : fallback;
}

function emptyAiProviderDraft(): AiProviderDraft {
  return {
    name: "",
    provider: "openai",
    api_format: "openai_compatible",
    endpoint: "",
    model: "",
    api_key: "",
    api_key_touched: false,
  };
}

function draftFromConfig(config: AiProviderConfig | null): AiProviderDraft {
  if (!config) {
    return emptyAiProviderDraft();
  }
  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    api_format: config.api_format,
    endpoint: config.endpoint,
    model: config.model,
    api_key: "",
    api_key_touched: false,
  };
}

function buildAiProviderConfigInput(draft: AiProviderDraft): AiProviderConfigInput {
  return {
    id: draft.id,
    name: draft.name,
    provider: draft.provider,
    api_format: draft.api_format,
    endpoint: draft.endpoint,
    model: draft.model,
    api_key: draft.api_key_touched ? draft.api_key : draft.api_key || undefined,
    api_key_touched: draft.api_key_touched,
  };
}

function renderAiModelOption(option: AiProviderModelOption) {
  const title = option.display_name?.trim() || option.id;
  const subtitle = option.display_name?.trim()
    ? option.subtitle?.trim() || option.id
    : option.subtitle?.trim() || null;
  return (
    <span className="ai-model-option">
      <strong>{title}</strong>
      {subtitle ? <small>{subtitle}</small> : null}
    </span>
  );
}

function providerFromAiApiFormat(apiFormat: AiApiFormat): AiProviderKind {
  return apiFormat === "anthropic" ? "claude" : "openai";
}

function formatAiAccessModeLabel(apiFormat: AiApiFormat, t: Translate) {
  return apiFormat === "anthropic"
    ? t("settings.ai.access.anthropic")
    : t("settings.ai.access.openai");
}

function aiConfigSummary(total: number, savedApiKeyCount: number, t: Translate) {
  if (total === 0) {
    return t("settings.ai.summary.zero");
  }
  return t("settings.ai.summary", { total, saved: savedApiKeyCount });
}

function aiConfigMetaSummary(
  config: Pick<AiProviderConfig, "provider" | "api_format" | "model" | "endpoint">,
  t: Translate,
) {
  return [
    formatAiAccessModeLabel(config.api_format, t),
    config.model,
    summarizeAiEndpoint(config.endpoint),
  ]
    .filter(Boolean)
    .join(" · ");
}

function summarizeAiEndpoint(endpoint: string) {
  try {
    const parsed = new URL(endpoint);
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return `${parsed.host}${path}`;
  } catch {
    return endpoint.replace(/^https?:\/\//u, "");
  }
}

async function openExternalUrl(url: string) {
  if (hasTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function BasicSettingsSection({
  appUpdate,
  fileTransferSettings,
  settings,
  onUpdate,
  onUpdateFileTransfer,
}: {
  appUpdate: UseAppUpdateResult;
  fileTransferSettings: FileTransferSettings;
  settings: BasicSettings;
  onUpdate: (update: Partial<BasicSettings>) => void;
  onUpdateFileTransfer: (update: Partial<FileTransferSettings>) => void;
}) {
  const { t } = useI18n();
  const [downloadRootError, setDownloadRootError] = useState<string | null>(null);
  const hasCustomDownloadRoot = fileTransferSettings.downloadRoot.trim().length > 0;

  async function chooseDownloadRoot() {
    if (!hasTauriRuntime()) {
      return;
    }
    setDownloadRootError(null);
    try {
      const selectedPath = await selectLocalDownloadDirectory();
      if (selectedPath) {
        onUpdateFileTransfer({ downloadRoot: selectedPath });
      }
    } catch (error) {
      setDownloadRootError(error instanceof Error ? error.message : t("settings.downloadRoot.error"));
    }
  }

  return (
    <section className="settings-page-section">
      <header className="settings-section-head">
        <h1>{t("settings.basic.title")}</h1>
        <p>{t("settings.basic.description")}</p>
      </header>

      <div className="settings-panel settings-update-panel" id="settings-app-update">
        <SettingsRow
          icon={Download}
          title={t("settings.update.title")}
          description={
            <span>
              {t("settings.update.current", { version: appUpdate.currentVersion, distribution: appUpdate.distributionLabel })}
            </span>
          }
        >
          <div className="settings-update-control">
            <div className="settings-update-status" role="status">
              <strong>{appUpdate.statusLabel}</strong>
              <small>{appUpdate.message || t("settings.update.releaseFallback")}</small>
            </div>
            <div className="settings-update-actions">
              <button
                className="settings-action-button"
                type="button"
                disabled={appUpdate.checking || appUpdate.installing}
                onClick={() => void appUpdate.checkNow()}
              >
                <RefreshCw
                  className={`ui-icon ${appUpdate.checking ? "spin" : ""}`}
                  aria-hidden="true"
                />
                <span>{appUpdate.checking ? t("settings.update.checking") : t("settings.update.checkNow")}</span>
              </button>
              <button
                className="settings-action-button"
                type="button"
                disabled={!appUpdate.canInstall || appUpdate.checking || appUpdate.installing}
                onClick={() => void appUpdate.installNow()}
              >
                {appUpdate.installing ? (
                  <Loader2 className="ui-icon spin" aria-hidden="true" />
                ) : (
                  <Download className="ui-icon" aria-hidden="true" />
                )}
                <span>{appUpdate.installing ? t("settings.update.installing") : t("settings.update.installRestart")}</span>
              </button>
              <button
                className="settings-action-button"
                type="button"
                onClick={() => void openExternalUrl(appUpdate.repositoryUrl)}
              >
                <ExternalLink className="ui-icon" aria-hidden="true" />
                <span>GitHub</span>
              </button>
            </div>
          </div>
        </SettingsRow>
        <SettingsRow
          icon={RefreshCw}
          title={t("settings.update.auto.title")}
          description={t("settings.update.auto.description")}
        >
          <SettingsToggle
            checked={settings.autoCheckAppUpdate}
            label={t("settings.update.auto.title")}
            onChange={(autoCheckAppUpdate) => onUpdate({ autoCheckAppUpdate })}
          />
        </SettingsRow>
      </div>

      <div className="settings-panel">
        <SettingsRow
          icon={Globe2}
          title={t("settings.locale.title")}
          description={t("settings.locale.description")}
        >
          <AppSelect
            ariaLabel={t("settings.locale.title")}
            menuMinWidth={170}
            value={settings.locale}
            options={[
              { label: t("settings.locale.system"), value: "system" },
              { label: t("settings.locale.en"), value: "en" },
              { label: t("settings.locale.zhCN"), value: "zh-CN" },
            ]}
            onChange={(locale) => onUpdate({ locale })}
          />
        </SettingsRow>
        <SettingsRow
          icon={RotateCcw}
          title={t("settings.restore.title")}
          description={t("settings.restore.description")}
        >
          <SettingsToggle
            checked={settings.restoreWorkspaceOnLaunch}
            label={t("settings.restore.title")}
            onChange={(restoreWorkspaceOnLaunch) => onUpdate({ restoreWorkspaceOnLaunch })}
          />
        </SettingsRow>
        <SettingsRow
          icon={Server}
          title={t("settings.keepFailed.title")}
          description={t("settings.keepFailed.description")}
        >
          <SettingsToggle
            checked={settings.keepFailedTerminalTabs}
            label={t("settings.keepFailed.title")}
            onChange={(keepFailedTerminalTabs) => onUpdate({ keepFailedTerminalTabs })}
          />
        </SettingsRow>
        <SettingsRow
          icon={Folder}
          title={t("settings.filePanelFollow.title")}
          description={t("settings.filePanelFollow.description")}
        >
          <SettingsToggle
            checked={settings.filePanelFollowsActiveConnection}
            label={t("settings.filePanelFollow.title")}
            onChange={(filePanelFollowsActiveConnection) =>
              onUpdate({ filePanelFollowsActiveConnection })
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={Rows3}
          title={t("settings.remoteFileOpen.title")}
          description={t("settings.remoteFileOpen.description")}
        >
          <AppSelect
            ariaLabel={t("settings.remoteFileOpen.title")}
            menuMinWidth={150}
            value={settings.remoteFileOpenMode}
            options={[
              { label: t("settings.remoteFileOpen.split"), value: "split" },
              { label: t("settings.remoteFileOpen.unified"), value: "unified" },
            ]}
            onChange={(remoteFileOpenMode) => onUpdate({ remoteFileOpenMode })}
          />
        </SettingsRow>
        <SettingsRow
          icon={Clock3}
          title={t("settings.recent.title")}
          description={t("settings.recent.description")}
        >
          <Stepper
            value={settings.recentConnectionLimit}
            values={[5, 10, 15, 20, 30, 50] as const}
            onChange={(recentConnectionLimit) => onUpdate({ recentConnectionLimit })}
          />
        </SettingsRow>
      </div>

      <div className="settings-panel">
        <SettingsRow
          icon={Download}
          title={t("settings.downloadRoot.title")}
          description={
            hasCustomDownloadRoot
              ? t("settings.downloadRoot.customDescription")
              : t("settings.downloadRoot.defaultDescription")
          }
        >
          <div className="settings-path-control">
            <div className="settings-path-picker">
              <input
                className="settings-input settings-path-input"
                value={fileTransferSettings.downloadRoot}
                placeholder={t("settings.downloadRoot.placeholder")}
                spellCheck={false}
                aria-label={t("settings.downloadRoot.title")}
                onChange={(event) => {
                  setDownloadRootError(null);
                  onUpdateFileTransfer({ downloadRoot: event.currentTarget.value });
                }}
              />
              <button
                className="settings-action-button settings-path-button"
                type="button"
                disabled={!hasTauriRuntime()}
                title={hasTauriRuntime() ? t("settings.downloadRoot.chooseTitle") : t("settings.downloadRoot.desktopTitle")}
                onClick={() => void chooseDownloadRoot()}
              >
                <FolderOpen className="ui-icon" aria-hidden="true" />
                <span>{t("settings.credentials.choose")}</span>
              </button>
              <button
                className="settings-action-button settings-path-button"
                type="button"
                disabled={!hasCustomDownloadRoot}
                title={t("settings.downloadRoot.resetTitle")}
                onClick={() => {
                  setDownloadRootError(null);
                  onUpdateFileTransfer({ downloadRoot: "" });
                }}
              >
                <X className="ui-icon" aria-hidden="true" />
                <span>{t("settings.downloadRoot.default")}</span>
              </button>
            </div>
            {downloadRootError ? <small className="settings-path-error">{downloadRootError}</small> : null}
          </div>
        </SettingsRow>
        <SettingsRow
          icon={Waypoints}
          title={t("settings.transfer.concurrent.title")}
          description={t("settings.transfer.concurrent.description")}
        >
          <Stepper<FileTransferConcurrency>
            value={fileTransferSettings.concurrentTransfers}
            values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const}
            onChange={(concurrentTransfers) =>
              onUpdateFileTransfer({ concurrentTransfers })
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={Folder}
          title={t("settings.transfer.group.title")}
          description={t("settings.transfer.group.description")}
        >
          <SettingsToggle
            checked={fileTransferSettings.groupBySession}
            label={t("settings.transfer.group.title")}
            onChange={(groupBySession) => onUpdateFileTransfer({ groupBySession })}
          />
        </SettingsRow>
        <SettingsRow
          icon={Clock3}
          title={t("settings.transfer.timestampDir.title")}
          description={t("settings.transfer.timestampDir.description")}
        >
          <SettingsToggle
            checked={fileTransferSettings.timestampDirectory}
            label={t("settings.transfer.timestampDir.title")}
            onChange={(timestampDirectory) => onUpdateFileTransfer({ timestampDirectory })}
          />
        </SettingsRow>
        <SettingsRow icon={Clock3} title={t("settings.transfer.timestampFormat.title")} description={t("settings.transfer.timestampFormat.description")}>
          <SegmentedControl<FileTransferTimestampFormat>
            value={fileTransferSettings.timestampFormat}
            options={[
              { value: "yyyyMMddHHmm", label: t("settings.transfer.timestampFormat.compact") },
              { value: "yyyyMMdd-HHmm", label: t("settings.transfer.timestampFormat.dash") },
              { value: "yyyy-MM-dd-HHmm", label: t("settings.transfer.timestampFormat.date") },
            ]}
            onChange={(timestampFormat) => onUpdateFileTransfer({ timestampFormat })}
          />
        </SettingsRow>
        <SettingsRow icon={Save} title={t("settings.transfer.keepArchives.title")} description={t("settings.transfer.keepArchives.description")}>
          <SettingsToggle
            checked={fileTransferSettings.keepArchives}
            label={t("settings.transfer.keepArchives.title")}
            onChange={(keepArchives) => onUpdateFileTransfer({ keepArchives })}
          />
        </SettingsRow>
        <SettingsRow icon={Archive} title={t("settings.transfer.compress.title")} description={t("settings.transfer.compress.description")}>
          <SettingsToggle
            checked={fileTransferSettings.compressDirectories}
            label={t("settings.transfer.compress.title")}
            onChange={(compressDirectories) =>
              onUpdateFileTransfer({ compressDirectories })
            }
          />
        </SettingsRow>
        <SettingsRow icon={Rows3} title={t("settings.transfer.conflict.title")} description={t("settings.transfer.conflict.description")}>
          <SegmentedControl<FileTransferConflictPolicy>
            value={fileTransferSettings.conflictPolicyDefault}
            options={[
              { value: "ask", label: t("settings.transfer.conflict.ask") },
              { value: "rename", label: t("settings.transfer.conflict.rename") },
              { value: "overwrite", label: t("settings.transfer.conflict.overwrite") },
              { value: "skip", label: t("settings.transfer.conflict.skip") },
            ]}
            onChange={(conflictPolicyDefault) =>
              onUpdateFileTransfer({ conflictPolicyDefault })
            }
          />
        </SettingsRow>
      </div>

      <ConfirmDialog
        open={appUpdate.mcpStopConfirmationOpen}
        title={t("settings.update.mcpConfirm.title")}
        description={t("settings.update.mcpConfirm.description", { count: appUpdate.mcpStopProcessCount })}
        confirmLabel={t("settings.update.mcpConfirm.confirm")}
        onConfirm={appUpdate.confirmInstallAfterMcpStop}
        onOpenChange={(open) => {
          if (!open) {
            appUpdate.cancelInstallAfterMcpStop();
          }
        }}
      />
    </section>
  );
}

function AppearanceSettingsSection({
  accentDraft,
  effectiveWindowMaterial,
  settings,
  supportedWindowMaterials,
  onAccentDraftChange,
  onReset,
  onUpdate,
}: {
  accentDraft: string;
  effectiveWindowMaterial: WindowMaterialMode;
  settings: AppearanceSettings;
  supportedWindowMaterials: WindowMaterialMode[];
  onAccentDraftChange: (value: string) => void;
  onReset: () => void;
  onUpdate: (update: Partial<AppearanceSettings>) => void;
}) {
  const { t } = useI18n();
  const [uiFontDraft, setUiFontDraft] = useState(settings.uiFontCustom);
  const [terminalFontDraft, setTerminalFontDraft] = useState(settings.terminalFontCustom);
  const windowMaterialDescription =
    supportedWindowMaterials.length > 1
      ? t("settings.appearance.material.descriptionSupported")
      : t("settings.appearance.material.descriptionDefault");

  useEffect(() => {
    setUiFontDraft(settings.uiFontCustom);
  }, [settings.uiFontCustom]);

  useEffect(() => {
    setTerminalFontDraft(settings.terminalFontCustom);
  }, [settings.terminalFontCustom]);

  function commitCustomAccent(value: string) {
    const nextColor = normalizeHexColor(value, defaultSettings.appearance.accentColorCustom);
    onAccentDraftChange(nextColor);
    onUpdate({
      accentColor: "custom",
      accentColorCustom: nextColor,
    });
  }

  function commitUiFontFamily(value: string) {
    const nextValue = normalizeFontFamilyInput(
      value,
      defaultSettings.appearance.uiFontCustom,
    );
    setUiFontDraft(nextValue);
    onUpdate({ uiFontCustom: nextValue });
  }

  function commitTerminalFontFamily(value: string) {
    const nextValue = normalizeFontFamilyInput(
      value,
      defaultSettings.appearance.terminalFontCustom,
    );
    setTerminalFontDraft(nextValue);
    onUpdate({ terminalFontCustom: nextValue });
  }

  return (
    <section className="settings-page-section">
      <header className="settings-section-head">
        <h1>{t("settings.appearance.title")}</h1>
        <p>{t("settings.appearance.description")}</p>
      </header>

      <div className="appearance-preview" aria-hidden="true">
        <div className="appearance-preview-sidebar">
          <span className="appearance-preview-accent" />
          <span />
          <span />
          <span className="short" />
        </div>
        <div className="appearance-preview-main">
          <div className="appearance-preview-toolbar">
            <span>{t("settings.appearance.preview")}</span>
            <i />
          </div>
          <div className="appearance-preview-workbench">
            <div className="appearance-preview-terminal">
              <code>$ ssh prod-core</code>
              <code>connected to 10.0.2.16</code>
              <code>~/apps/nexaterm $</code>
            </div>
            <div className="appearance-preview-files">
              <span>src</span>
              <span>logs</span>
              <span>deploy.sh</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-panel">
        <SettingsRow icon={Monitor} title={t("settings.appearance.theme.title")} description={t("settings.appearance.theme.description")}>
          <SegmentedControl
            value={settings.themeMode}
            options={[
              { value: "system", label: t("settings.appearance.theme.system"), icon: Monitor },
              { value: "light", label: t("settings.appearance.theme.light"), icon: Sun },
              { value: "dark", label: t("settings.appearance.theme.dark"), icon: Moon },
            ]}
            onChange={(themeMode) => onUpdate({ themeMode })}
          />
        </SettingsRow>

        <SettingsRow icon={Layers} title={t("settings.appearance.material.title")} description={windowMaterialDescription}>
          <SegmentedControl<WindowMaterialMode>
            value={effectiveWindowMaterial}
            options={supportedWindowMaterials.map((material) => ({
              value: material,
              label: material === "auto" ? t("settings.appearance.material.auto") : getWindowMaterialLabel(material),
            }))}
            onChange={(windowMaterial) => onUpdate({ windowMaterial })}
          />
        </SettingsRow>

        <SettingsRow icon={Palette} title={t("settings.appearance.accent.title")} description={t("settings.appearance.accent.description")}>
          <div className="settings-accent-picker">
            {accentColorPresets.map((preset) => (
              <button
                className={settings.accentColor === preset.value ? "active" : ""}
                key={preset.value}
                type="button"
                aria-label={t("settings.appearance.accent.chooseAria", { name: appearanceAccentLabel(preset.value, t) })}
                title={appearanceAccentLabel(preset.value, t)}
                onClick={() => onUpdate({ accentColor: preset.value })}
              >
                <span
                  className="settings-accent-swatch"
                  style={{ "--settings-accent-swatch": preset.light } as CSSProperties}
                />
                <span>{appearanceAccentLabel(preset.value, t)}</span>
              </button>
            ))}
            <label
              className={`settings-accent-custom ${
                settings.accentColor === "custom" ? "active" : ""
              }`}
              title={t("settings.appearance.accent.customTitle")}
            >
              <input
                type="color"
                value={normalizeHexColor(accentDraft, defaultSettings.appearance.accentColorCustom)}
                aria-label={t("settings.appearance.accent.customAria")}
                onChange={(event) => commitCustomAccent(event.target.value)}
              />
              <span
                className="settings-accent-swatch"
                style={{
                  "--settings-accent-swatch": normalizeHexColor(
                    accentDraft,
                    defaultSettings.appearance.accentColorCustom,
                  ),
                } as CSSProperties}
              />
              <span>{t("settings.appearance.accent.custom")}</span>
            </label>
            <input
              className="settings-input settings-accent-value-input"
              value={accentDraft}
              maxLength={7}
              spellCheck={false}
              aria-label={t("settings.appearance.accent.valueAria")}
              onFocus={() => {
                if (settings.accentColor !== "custom") {
                  onUpdate({ accentColor: "custom" as AccentColor });
                }
              }}
              onChange={(event) => onAccentDraftChange(event.target.value)}
              onBlur={() => commitCustomAccent(accentDraft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitCustomAccent(accentDraft);
                }
              }}
            />
          </div>
        </SettingsRow>

        <SettingsRow icon={Rows3} title={t("settings.appearance.density.title")} description={t("settings.appearance.density.description")}>
          <SegmentedControl
            value={settings.density}
            options={[
              { value: "comfortable", label: t("settings.appearance.density.comfortable") },
              { value: "compact", label: t("settings.appearance.density.compact") },
            ]}
            onChange={(density) => onUpdate({ density })}
          />
        </SettingsRow>

        <SettingsRow icon={Type} title={t("settings.appearance.uiFont.title")} description={t("settings.appearance.uiFont.description")}>
          <FontFamilyControl<UiFontPreset>
            modeValue={settings.uiFontMode}
            onModeChange={(uiFontMode) => onUpdate({ uiFontMode })}
            presetValue={settings.uiFontPreset}
            presetOptions={uiFontPresets.map((preset) => ({ ...preset, label: appearanceFontPresetLabel(preset.value, preset.label, t) }))}
            onPresetChange={(uiFontPreset) => onUpdate({ uiFontPreset })}
            customValue={uiFontDraft}
            customPlaceholder={t("settings.appearance.uiFont.placeholder")}
            onCustomChange={setUiFontDraft}
            onCustomCommit={() => commitUiFontFamily(uiFontDraft)}
          />
        </SettingsRow>

        <SettingsRow icon={Terminal} title={t("settings.appearance.terminalFont.title")} description={t("settings.appearance.terminalFont.description")}>
          <FontFamilyControl<TerminalFontPreset>
            modeValue={settings.terminalFontMode}
            onModeChange={(terminalFontMode) => onUpdate({ terminalFontMode })}
            presetValue={settings.terminalFontPreset}
            presetOptions={terminalFontPresets}
            onPresetChange={(terminalFontPreset) => onUpdate({ terminalFontPreset })}
            customValue={terminalFontDraft}
            customPlaceholder={t("settings.appearance.terminalFont.placeholder")}
            onCustomChange={setTerminalFontDraft}
            onCustomCommit={() => commitTerminalFontFamily(terminalFontDraft)}
          />
        </SettingsRow>

        <SettingsRow icon={Type} title={t("settings.appearance.uiFontSize.title")} description={t("settings.appearance.uiFontSize.description")}>
          <Stepper
            value={settings.uiFontSize}
            values={[12, 13, 14, 15] as const}
            onChange={(uiFontSize) => onUpdate({ uiFontSize })}
          />
        </SettingsRow>

        <SettingsRow icon={Terminal} title={t("settings.appearance.terminalFontSize.title")} description={t("settings.appearance.terminalFontSize.description")}>
          <Stepper
            value={settings.terminalFontSize}
            values={[12, 13, 14, 15, 16] as const}
            onChange={(terminalFontSize) => onUpdate({ terminalFontSize })}
          />
        </SettingsRow>

        <SettingsRow icon={PanelLeft} title={t("settings.appearance.iconSize.title")} description={t("settings.appearance.iconSize.description")}>
          <SegmentedControl
            value={settings.iconSize}
            options={[
              { value: "small", label: t("settings.appearance.iconSize.small") },
              { value: "medium", label: t("settings.appearance.iconSize.medium") },
              { value: "large", label: t("settings.appearance.iconSize.large") },
            ]}
            onChange={(iconSize) => onUpdate({ iconSize })}
          />
        </SettingsRow>

        <SettingsRow icon={PanelLeft} title={t("settings.appearance.rememberPaneWidths.title")} description={t("settings.appearance.rememberPaneWidths.description")}>
          <SettingsToggle
            checked={settings.rememberPaneWidths}
            label={t("settings.appearance.rememberPaneWidths.label")}
            onChange={(rememberPaneWidths) => onUpdate({ rememberPaneWidths })}
          />
        </SettingsRow>

        <SettingsRow icon={RotateCcw} title={t("settings.appearance.reset.title")} description={t("settings.appearance.reset.description")}>
          <button className="settings-action-button" type="button" onClick={onReset}>
            <RotateCcw className="ui-icon" aria-hidden="true" />
            <span>{t("settings.appearance.reset")}</span>
          </button>
        </SettingsRow>
      </div>
    </section>
  );
}

function FontFamilyControl<TPreset extends string>({
  modeValue,
  onModeChange,
  presetValue,
  presetOptions,
  onPresetChange,
  customValue,
  customPlaceholder,
  onCustomChange,
  onCustomCommit,
}: {
  modeValue: FontSettingMode;
  onModeChange: (value: FontSettingMode) => void;
  presetValue: TPreset;
  presetOptions: ReadonlyArray<{ label: string; value: TPreset }>;
  onPresetChange: (value: TPreset) => void;
  customValue: string;
  customPlaceholder: string;
  onCustomChange: (value: string) => void;
  onCustomCommit: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="settings-font-control">
      <div className="settings-font-main">
        <SegmentedControl
          value={modeValue}
          options={[
            { value: "preset", label: t("settings.appearance.fontMode.preset") },
            { value: "custom", label: t("settings.appearance.fontMode.custom") },
          ]}
          onChange={onModeChange}
        />
        {modeValue === "custom" ? (
          <input
            className="settings-input settings-font-custom-input"
            value={customValue}
            placeholder={customPlaceholder}
            title={t("settings.appearance.fontCustomTitle")}
            aria-label={t("settings.appearance.fontCustomAria")}
            spellCheck={false}
            onChange={(event) => onCustomChange(event.currentTarget.value)}
            onBlur={onCustomCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCustomCommit();
              }
            }}
          />
        ) : (
          <AppSelect
            ariaLabel={t("settings.appearance.fontPresetAria")}
            className="settings-select"
            value={presetValue}
            options={presetOptions.map((preset) => ({
              label: preset.label,
              value: preset.value,
            }))}
            onChange={onPresetChange}
          />
        )}
      </div>
    </div>
  );
}

function appearanceAccentLabel(value: string, t: Translate) {
  if (value === "blue") return t("settings.appearance.accent.blue");
  if (value === "emerald") return t("settings.appearance.accent.emerald");
  if (value === "amber") return t("settings.appearance.accent.amber");
  if (value === "rose") return t("settings.appearance.accent.rose");
  return t("settings.appearance.accent.violet");
}

function appearanceFontPresetLabel(value: string, fallback: string, t: Translate) {
  if (value === "system") return t("settings.appearance.uiFont.systemDefault");
  if (value === "microsoft-yahei") return t("settings.appearance.uiFont.microsoftYahei");
  return fallback;
}

function LocalTerminalSettingsSection({
  appearanceSettings,
  basicSettings,
  commandSettings,
  settings,
  onUpdate,
  onUpdateAppearance,
  onUpdateBasic,
  onUpdateCommand,
}: {
  appearanceSettings: AppearanceSettings;
  basicSettings: BasicSettings;
  commandSettings: CommandSettings;
  settings: LocalTerminalSettings;
  onUpdate: (update: Partial<LocalTerminalSettings>) => void;
  onUpdateAppearance: (update: Partial<AppearanceSettings>) => void;
  onUpdateBasic: (update: Partial<BasicSettings>) => void;
  onUpdateCommand: (update: Partial<CommandSettings>) => void;
}) {
  const { t } = useI18n();
  const [detectedProfiles, setDetectedProfiles] = useState<LocalTerminalProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<LocalTerminalProfileInput | null>(null);
  const [form, setForm] = useState<LocalTerminalProfileInput>(emptyLocalTerminalProfile());
  const [formError, setFormError] = useState<string | null>(null);
  const customProfiles = settings.customProfiles
    .map((profile) => normalizeLocalTerminalProfileInput(profile))
    .filter((profile): profile is LocalTerminalProfileInput => Boolean(profile));
  const profileOptions = [...detectedProfiles, ...customProfiles];
  const visibleDetectedProfiles = detectedProfiles.filter(
    (profile) => !settings.hiddenProfileIds.includes(profile.id),
  );

  useEffect(() => {
    let disposed = false;

    async function loadProfiles() {
      setLoading(true);
      setError(null);
      try {
        const profiles = hasTauriRuntime()
          ? await localTerminalListProfiles()
          : previewSettingsLocalTerminalProfiles(t);
        if (!disposed) {
          setDetectedProfiles(profiles);
        }
      } catch (nextError) {
        if (!disposed) {
          setError(formatError(nextError));
          setDetectedProfiles(previewSettingsLocalTerminalProfiles(t));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void loadProfiles();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (editingProfile) {
      setForm(editingProfile);
    }
  }, [editingProfile]);

  const currentDefaultOption = profileOptions.find(
    (profile) => profile.id === settings.defaultProfileId,
  );
  const effectiveDefaultOption = currentDefaultOption || profileOptions[0] || null;

  function toggleHiddenProfile(profileId: string, hidden: boolean) {
    const nextHiddenIds = hidden
      ? [...new Set([...settings.hiddenProfileIds, profileId])]
      : settings.hiddenProfileIds.filter((id) => id !== profileId);
    onUpdate({ hiddenProfileIds: nextHiddenIds });
  }

  function resetForm() {
    setEditingProfile(null);
    setForm(emptyLocalTerminalProfile());
    setFormError(null);
  }

  function saveCustomProfile() {
    const normalized = normalizeLocalTerminalProfileInput(form);
    if (!normalized || !normalized.name || !normalized.command) {
      setFormError(t("settings.localTerminal.error.required"));
      return;
    }

    const nextCustomProfiles = [...settings.customProfiles];
    const nextId = normalized.id || editingProfile?.id || `custom-${Date.now().toString()}`;
    const nextProfile = { ...normalized, id: nextId };
    const existingIndex = nextCustomProfiles.findIndex((item) => item.id === nextProfile.id);
    if (existingIndex >= 0) {
      nextCustomProfiles[existingIndex] = nextProfile;
    } else {
      nextCustomProfiles.push(nextProfile);
    }

    onUpdate({ customProfiles: nextCustomProfiles });
    resetForm();
  }

  function deleteCustomProfile(profileId?: string) {
    if (!profileId) {
      return;
    }
    onUpdate({
      customProfiles: settings.customProfiles.filter((item) => item.id !== profileId),
      defaultProfileId:
        settings.defaultProfileId === profileId ? visibleDetectedProfiles[0]?.id || null : settings.defaultProfileId,
    });
    if (editingProfile?.id === profileId) {
      resetForm();
    }
  }

  return (
    <section className="settings-page-section">
      <header className="settings-section-head settings-section-head-row">
        <span>
          <h1>{t("settings.localTerminal.title")}</h1>
          <p>{t("settings.localTerminal.description")}</p>
        </span>
        <button className="repository-primary-button" type="button" onClick={resetForm}>
          <Plus className="ui-icon" aria-hidden="true" />
          <span>{t("settings.localTerminal.addProfile")}</span>
        </button>
      </header>

      <div className="settings-panel">
        <SettingsRow
          className="settings-row-compact settings-local-terminal-default-row"
          icon={HardDrive}
          title={t("settings.localTerminal.default.title")}
        >
          <div className="settings-local-terminal-default">
            <AppSelect
              ariaLabel={t("settings.localTerminal.default.aria")}
              className="settings-select"
              options={profileOptions.map((profile) => ({
                label: (
                  <span className="local-terminal-menu-label">
                    <LocalTerminalIcon className="ui-icon" kind={profile.kind} title={profile.name} />
                    <span>{profile.name}</span>
                  </span>
                ),
                value: profile.id || `custom-fallback-${profile.name}`,
              }))}
              placeholder={loading ? t("settings.localTerminal.default.detecting") : t("settings.localTerminal.default.choose")}
              value={effectiveDefaultOption?.id || ""}
              onChange={(defaultProfileId) => onUpdate({ defaultProfileId })}
            />
          </div>
        </SettingsRow>
        <SettingsRow
          icon={Terminal}
          title={t("settings.localTerminal.reopen.title")}
          description={t("settings.localTerminal.reopen.description")}
        >
          <SettingsToggle
            checked={basicSettings.reopenLastTerminal}
            label={t("settings.localTerminal.reopen.label")}
            onChange={(reopenLastTerminal) => onUpdateBasic({ reopenLastTerminal })}
          />
        </SettingsRow>
        <SettingsRow
          icon={RotateCcw}
          title={t("settings.localTerminal.restore.title")}
          description={t("settings.localTerminal.restore.description")}
        >
          <SettingsToggle
            checked={settings.reopenLastLocalWorkspace}
            label={t("settings.localTerminal.restore.label")}
            onChange={(reopenLastLocalWorkspace) => onUpdate({ reopenLastLocalWorkspace })}
          />
        </SettingsRow>
        <SettingsRow
          icon={Keyboard}
          title={t("settings.localTerminal.ctrlV.title")}
          description={t("settings.localTerminal.ctrlV.description")}
        >
          <SettingsToggle
            checked={settings.ctrlVPaste}
            label={t("settings.localTerminal.ctrlV.label")}
            onChange={(ctrlVPaste) => onUpdate({ ctrlVPaste })}
          />
        </SettingsRow>
        <SettingsRow
          icon={Terminal}
          title={t("settings.localTerminal.history.title")}
          description={t("settings.localTerminal.history.description")}
        >
          <SettingsToggle
            checked={commandSettings.recordTerminalInputHistory}
            label={t("settings.localTerminal.history.label")}
            onChange={(recordTerminalInputHistory) =>
              onUpdateCommand({ recordTerminalInputHistory })
            }
          />
        </SettingsRow>
      </div>

      <div className="settings-panel">
        <SettingsRow icon={Terminal} title={t("settings.localTerminal.cursor.title")} description={t("settings.localTerminal.cursor.description")}>
          <SegmentedControl<TerminalCursorStyle>
            value={appearanceSettings.cursorStyle}
            options={[
              { value: "block", label: t("settings.localTerminal.cursor.block") },
              { value: "bar", label: t("settings.localTerminal.cursor.bar") },
              { value: "underline", label: t("settings.localTerminal.cursor.underline") },
            ]}
            onChange={(cursorStyle) => onUpdateAppearance({ cursorStyle })}
          />
        </SettingsRow>
        <SettingsRow icon={Terminal} title={t("settings.localTerminal.blink.title")} description={t("settings.localTerminal.blink.description")}>
          <SettingsToggle
            checked={appearanceSettings.cursorBlink}
            label={t("settings.localTerminal.blink.label")}
            onChange={(cursorBlink) => onUpdateAppearance({ cursorBlink })}
          />
        </SettingsRow>
      </div>

      <div className="settings-panel local-terminal-detected-panel">
        <header className="local-terminal-panel-head">
          <span>
            <strong>{t("settings.localTerminal.detected.title")}</strong>
            <small>{loading ? t("settings.localTerminal.detected.loading") : t("settings.localTerminal.count", { count: detectedProfiles.length })}</small>
          </span>
          {error ? <small className="form-error">{error}</small> : null}
        </header>
        <div className="local-terminal-profile-list">
          {detectedProfiles.map((profile) => {
            const hidden = settings.hiddenProfileIds.includes(profile.id);
            return (
              <div className={`local-terminal-profile-card ${hidden ? "is-hidden-profile" : ""}`} key={profile.id}>
                <div className="local-terminal-profile-main">
                  <span className="local-terminal-profile-icon">
                    <LocalTerminalIcon className="ui-icon" kind={profile.kind} title={profile.name} />
                  </span>
                  <span>
                    <strong>{profile.name}</strong>
                    <small>{profile.command}</small>
                  </span>
                </div>
                <button
                  className="settings-action-button"
                  type="button"
                  onClick={() => toggleHiddenProfile(profile.id, !hidden)}
                >
                  {hidden ? t("settings.localTerminal.show") : t("settings.localTerminal.hide")}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="local-terminal-settings-grid">
        <section className="settings-panel local-terminal-custom-list">
          <header className="local-terminal-panel-head">
            <span>
              <strong>{t("settings.localTerminal.custom.title")}</strong>
              <small>{t("settings.localTerminal.count", { count: customProfiles.length })}</small>
            </span>
          </header>
          <div className="local-terminal-profile-list">
            {customProfiles.length === 0 ? (
              <p className="settings-note">{t("settings.localTerminal.custom.empty")}</p>
            ) : (
              customProfiles.map((profile, index) => (
                <div className="local-terminal-profile-card" key={profile.id || `custom-${index.toString()}`}>
                  <div className="local-terminal-profile-main">
                    <span className="local-terminal-profile-icon">
                      <LocalTerminalIcon className="ui-icon" kind={profile.kind} title={profile.name} />
                    </span>
                    <span>
                      <strong>{profile.name}</strong>
                      <small>{profile.command}</small>
                    </span>
                  </div>
                  <div className="local-terminal-profile-actions">
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => setEditingProfile(profile)}
                    >
                      {t("settings.localTerminal.edit")}
                    </button>
                    <button
                      className="settings-action-button danger-button"
                      type="button"
                      onClick={() => deleteCustomProfile(profile.id)}
                    >
                      {t("settings.credentials.delete")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="settings-panel local-terminal-custom-form">
          <header className="local-terminal-panel-head">
            <span>
              <strong>{editingProfile ? t("settings.localTerminal.form.edit") : t("settings.localTerminal.form.new")}</strong>
              <small>{t("settings.localTerminal.form.description")}</small>
            </span>
          </header>
          <div className="local-terminal-form-grid">
            <label>
              <span>{t("settings.credentials.name")}</span>
              <input
                className="settings-input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>{t("settings.credentials.type")}</span>
              <input
                className="settings-input"
                value={form.kind}
                placeholder={t("settings.localTerminal.form.typePlaceholder")}
                onChange={(event) => setForm({ ...form, kind: event.currentTarget.value })}
              />
            </label>
            <label className="local-terminal-form-span">
              <span>{t("settings.localTerminal.form.command")}</span>
              <input
                className="settings-input"
                value={form.command}
                placeholder={t("settings.localTerminal.form.commandPlaceholder")}
                onChange={(event) => setForm({ ...form, command: event.currentTarget.value })}
              />
            </label>
            <label className="local-terminal-form-span">
              <span>{t("settings.localTerminal.form.args")}</span>
              <input
                className="settings-input"
                value={form.args.join(" ")}
                placeholder={t("settings.localTerminal.form.argsPlaceholder")}
                onChange={(event) =>
                  setForm({
                    ...form,
                    args: event.currentTarget.value
                      .split(/\s+/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label className="local-terminal-form-span">
              <span>{t("settings.localTerminal.form.cwd")}</span>
              <input
                className="settings-input"
                value={form.cwd || ""}
                placeholder={t("settings.localTerminal.form.optional")}
                onChange={(event) => setForm({ ...form, cwd: event.currentTarget.value })}
              />
            </label>
          </div>
          {formError ? <p className="form-error">{formError}</p> : null}
          <footer className="credential-form-actions">
            <div />
            <div>
              <button type="button" onClick={resetForm}>
                {t("settings.credentials.clear")}
              </button>
              <button className="primary-button" type="button" onClick={saveCustomProfile}>
                {t("settings.localTerminal.form.save")}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </section>
  );
}

function emptyLocalTerminalProfile(): LocalTerminalProfileInput {
  return {
    args: [],
    command: "",
    cwd: "",
    detected: false,
    env: {},
    hidden: false,
    icon: "terminal-shell",
    id: undefined,
    kind: "custom",
    name: "",
    platform: "all",
    source: "custom",
  };
}

function previewSettingsLocalTerminalProfiles(t: Translate): LocalTerminalProfile[] {
  return [
    {
      args: ["-NoLogo", "-NoProfile"],
      command: "pwsh.exe",
      cwd: null,
      detected: true,
      env: {},
      hidden: false,
      icon: "terminal-powershell",
      id: "pwsh",
      kind: "powershell_core",
      name: "PowerShell 7",
      platform: "windows",
      source: "detected",
    },
    {
      args: [],
      command: "cmd.exe",
      cwd: null,
      detected: true,
      env: {},
      hidden: false,
      icon: "terminal-cmd",
      id: "cmd",
      kind: "cmd",
      name: t("settings.localTerminal.preview.cmd"),
      platform: "windows",
      source: "detected",
    },
  ];
}

function TerminalThemeSettingsSection({
  settings,
  onUpdate,
}: {
  settings: TerminalThemeSettings;
  onUpdate: (update: Partial<TerminalThemeSettings>) => void;
}) {
  const { t } = useI18n();
  const [terminalSchemeQuery, setTerminalSchemeQuery] = useState("");
  const [terminalSchemeTone, setTerminalSchemeTone] =
    useState<"all" | TerminalColorSchemeTone>("all");
  // 配色方案数据（约 280KB / 531 项）已拆为独立 chunk。进入本页时主动加载，
  // 加载完成前只渲染轻量状态，避免设置页打开瞬间同步铺开大列表。
  const [schemesReady, setSchemesReady] = useState(() => isTerminalColorSchemesReady());
  const [schemesLoadError, setSchemesLoadError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = onTerminalColorSchemesReady(() => {
      if (active) {
        setSchemesReady(true);
        setSchemesLoadError(null);
      }
    });
    void loadTerminalColorSchemes().catch((error) => {
      if (active) {
        setSchemesLoadError(formatError(error));
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const allTerminalColorSchemes = useMemo(
    () => (schemesReady ? getTerminalColorSchemes() : []),
    [schemesReady],
  );
  const selectedScheme = useMemo(
    () => getTerminalColorScheme(settings.scheme),
    [settings.scheme, schemesReady],
  );
  const filteredTerminalColorSchemes = useMemo(() => {
    const query = terminalSchemeQuery.trim().toLowerCase();

    return allTerminalColorSchemes.filter((scheme) => {
      const matchesQuery =
        !query ||
        [scheme.name, scheme.id, scheme.source].some((value) =>
          value.toLowerCase().includes(query),
        );
      const matchesTone =
        terminalSchemeTone === "all" ||
        getTerminalColorSchemeTone(scheme) === terminalSchemeTone;

      return matchesQuery && matchesTone;
    });
  }, [allTerminalColorSchemes, terminalSchemeQuery, terminalSchemeTone]);

  const schemePageSize = 36;
  const [visibleSchemeCount, setVisibleSchemeCount] = useState(schemePageSize);
  const schemeListRef = useRef<HTMLDivElement | null>(null);
  const schemeSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleSchemeCount(schemePageSize);
  }, [schemePageSize, terminalSchemeQuery, terminalSchemeTone]);

  useEffect(() => {
    const total = filteredTerminalColorSchemes.length;
    const root = schemeListRef.current?.closest(".settings-content") ?? null;
    const node = schemeSentinelRef.current;
    if (!node) {
      return;
    }
    // observer 只在筛选结果变化时重建一次，不随 visibleSchemeCount 变化重建。
    // 这样每次翻页用的是同一个 observer，不会因重建导致首帧回调连环触发，
    // 进而避免打开终端配色瞬间把 531 张卡片几乎同步铺开（"打开就卡"）。
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        // 首帧防误触发：列表刚挂载时布局未稳定，sentinel 可能短暂落入
        // rootMargin 内。仅当 sentinel 实际位于 root 下边界附近时才加载下一批，
        // 避免打开瞬间一次性铺开全部卡片。
        const rootRect = entry.rootBounds;
        if (rootRect) {
          const distance = entry.boundingClientRect.top - rootRect.bottom;
          if (distance > 0 && distance > rootRect.height) {
            return;
          }
        }
        setVisibleSchemeCount((prev) =>
          prev >= total ? prev : Math.min(prev + schemePageSize, total),
        );
      },
      { root, rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredTerminalColorSchemes.length, schemePageSize]);

  return (
    <section className="settings-page-section terminal-theme-section">
      <header className="settings-section-head settings-section-head-row">
        <span>
          <h1>{t("settings.terminalTheme.title")}</h1>
          <p>{t("settings.terminalTheme.description")}</p>
        </span>
        <Tooltip label={t("settings.terminalTheme.customLater")}>
          <button className="settings-action-button" type="button" disabled>
            <Plus className="ui-icon" aria-hidden="true" />
            <span>{t("settings.terminalTheme.add")}</span>
          </button>
        </Tooltip>
      </header>

      <div className="terminal-scheme-toolbar">
        <div className="terminal-scheme-tools">
          <label className="terminal-scheme-search">
            <Search className="ui-icon" aria-hidden="true" />
            <input
              type="search"
              value={terminalSchemeQuery}
              aria-label={t("settings.terminalTheme.searchAria")}
              placeholder={t("settings.terminalTheme.searchPlaceholder")}
              onChange={(event) => setTerminalSchemeQuery(event.currentTarget.value)}
            />
          </label>
          <SegmentedControl
            value={terminalSchemeTone}
            options={[
              { value: "all", label: t("settings.credentials.filter.all") },
              { value: "dark", label: t("settings.terminalTheme.dark"), icon: Moon },
              { value: "light", label: t("settings.terminalTheme.light"), icon: Sun },
            ]}
            onChange={setTerminalSchemeTone}
          />
        </div>
        <span className="terminal-scheme-count">
          {schemesReady
            ? `${filteredTerminalColorSchemes.length.toString()} / ${allTerminalColorSchemes.length.toString()}`
            : t("settings.terminalTheme.loading")}
        </span>
      </div>

      <div ref={schemeListRef} className="terminal-scheme-list" aria-label={t("settings.terminalTheme.listAria")}>
        {schemesLoadError ? (
          <div className="terminal-scheme-empty" role="status">
            {t("settings.terminalTheme.loadError", { message: schemesLoadError })}
          </div>
        ) : !schemesReady ? (
          <div className="terminal-scheme-empty" role="status">
            {t("settings.terminalTheme.loadingSchemes")}
          </div>
        ) : filteredTerminalColorSchemes.length > 0 ? (
          <>
            {filteredTerminalColorSchemes.slice(0, visibleSchemeCount).map((scheme) => (
              <button
                className={`terminal-scheme-card ${
                  settings.scheme === scheme.id ? "active" : ""
                }`}
                key={scheme.id}
                type="button"
                aria-pressed={settings.scheme === scheme.id}
                onClick={() => onUpdate({ scheme: scheme.id })}
                style={{
                  "--terminal-scheme-bg": scheme.theme.background,
                  "--terminal-scheme-fg": scheme.theme.foreground,
                } as CSSProperties}
              >
                <span className="terminal-scheme-preview">
                  <span className="terminal-scheme-prompt">{scheme.name}</span>
                  <span className="terminal-scheme-command">$ ls --color</span>
                </span>
                <span className="terminal-scheme-meta">
                  <strong>{scheme.name}</strong>
                  <small>{scheme.source}</small>
                </span>
                <span className="terminal-scheme-swatches" aria-hidden="true">
                  {getTerminalAnsiSwatches(scheme).map((color, index) => (
                    <span
                      key={`${scheme.id}-${color}-${index.toString()}`}
                      style={{ "--terminal-swatch": color } as CSSProperties}
                    />
                  ))}
                </span>
                {settings.scheme === scheme.id ? (
                  <span className="terminal-scheme-check" aria-hidden="true">
                    <Check className="ui-icon" />
                  </span>
                ) : null}
              </button>
            ))}
            {visibleSchemeCount < filteredTerminalColorSchemes.length ? (
              <div ref={schemeSentinelRef} className="terminal-scheme-sentinel" aria-hidden="true" />
            ) : null}
          </>
        ) : (
          <div className="terminal-scheme-empty" role="status">
            {t("settings.terminalTheme.noMatch")}
          </div>
        )}
      </div>

      <footer className="terminal-scheme-actions">
        <span>
          {t("settings.terminalTheme.current")} <strong>{selectedScheme.name}</strong>
        </span>
        <div>
          <button className="settings-action-button" type="button" disabled>
            <Save className="ui-icon" aria-hidden="true" />
            <span>{t("settings.terminalTheme.saved")}</span>
          </button>
          <button
            className="settings-action-button"
            type="button"
            onClick={() => onUpdate({ scheme: defaultSettings.terminalTheme.scheme })}
          >
            <Undo2 className="ui-icon" aria-hidden="true" />
            <span>{t("settings.terminalTheme.discard")}</span>
          </button>
        </div>
      </footer>
    </section>
  );
}
