import { groupOptions as canonicalGroupOptions } from "./connectionGroupModel";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Monitor,
  MonitorPlay,
  RefreshCw,
  Terminal,
  TerminalSquare,
  X,
} from "lucide-react";
import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import { AppSelect } from "../../shared/ui/AppSelect";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { usernameInputAttributes } from "../../shared/ui/inputAttributes";
import {
  connectionRevealInlineSecret,
  rdpTestRunner,
  serialListPorts,
  vncTestRunner,
} from "../../shared/tauri/commands";
import {
  getPlatformCapabilities,
  resolveDesktopPlatform,
} from "../../shared/tauri/platformCapabilities";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { t as tr, useI18n } from "../../shared/i18n";
import { selectLocalPrivateKeyFile } from "../../shared/tauri/dialog";
import type {
  ConnectionAuthKind,
  ConnectionCredentialMode,
  ConnectionProtocol,
  ConnectionProfile,
  ConnectionProfileInput,
  ConnectionProxyKind,
  ConnectionTerminalEncoding,
  CredentialProfile,
  HostKeyInfo,
  RdpAudioMode,
  RdpCertificatePolicy,
  RdpConnectionConfig,
  RdpDisplayMode,
  RdpGatewayMode,
  RdpNetworkLevelAuthentication,
  RdpPerformancePreset,
  RdpRenderMode,
  SerialConnectionConfig,
  VncConnectionConfig,
  VncPerformancePreset,
  VncRenderMode,
  VncScaleMode,
} from "./connectionTypes";
import {
  defaultAdvancedConfig,
  defaultJumpConfig,
  defaultProxyConfig,
  defaultRdpConfig,
  defaultSerialConfig,
  defaultTelnetConfig,
  defaultVncConfig,
  defaultRdpExternalRunnerForPlatform,
  formatRdpRunnerKind,
  formatVncRunnerKind,
  normalizeTerminalEncoding,
  rdpExternalModeLabelForPlatform,
  rdpExternalModeNoteForPlatform,
  terminalEncodingOptions,
  vncPerformancePresetDefaults,
} from "./connectionTypes";
import {
  parseHostKeyError,
  type ParsedHostKeyError,
} from "./hostKeyErrors";
import {
  connectionNetworkKind,
  errorDiagnosticId,
} from "./connectionErrorCodes";
import { connectionDialogSubmitPolicy, validateConnectionNetworkPath, type ConnectionSaveIntent } from "./connectionDialogSubmit";
import { serialPortAvailability } from "./serialPortAvailability";
import { buildJumpPlanPreview, jumpCandidateWouldCycle, validateJumpPlanSelection } from "./jumpPlanPreview";
import type {
  CharacterBackspaceMode,
  SerialDataBits,
  SerialFlowControl,
  SerialParity,
  SerialPortEntry,
  SerialStopBits,
  TelnetEnterMode,
} from "../terminal/characterSessionTypes";

interface ConnectionDialogProps {
  connection: ConnectionProfile | null;
  connections: ConnectionProfile[];
  credentials: CredentialProfile[];
  defaultGroup?: string | null;
  duplicate?: boolean;
  groups: ConnectionDialogGroup[];
  initialProtocol?: ConnectionProtocol | null;
  allowPasswordReveal: boolean;
  open: boolean;
  onClose: () => void;
  onDelete: (connection: ConnectionProfile) => Promise<void>;
  onManageCredentials: () => void;
  onSave: (input: ConnectionProfileInput, intent: ConnectionSaveIntent) => Promise<void>;
  onTest: (input: ConnectionProfileInput) => Promise<void>;
  onTrustHostKey: (hostKey: HostKeyInfo) => Promise<void>;
}

interface ConnectionDialogGroup {
  id: string;
  name: string;
  parentId?: string | null;
}

interface GroupOption {
  label: string;
  value: string;
}

type ConnectionDialogTab = "basic" | "proxy" | "rdp" | "vnc" | "advanced";
type ConnectionTestState = "idle" | "running" | "success" | "error" | "host-key";
type ConnectionNetworkPathMode = "direct" | "proxy" | "ssh_jump";

interface DialogFeedback {
  detail: string;
  hostKey?: HostKeyInfo | null;
  hostKeyDecision?: ParsedHostKeyError["decision"] | null;
  oldHostKeyFingerprint?: string | null;
  title: string;
  rawMessage?: string | null;
}

const emptyForm: ConnectionProfileInput = {
  protocol: "ssh",
  name: "",
  group: "",
  host: "",
  port: 22,
  username: "",
  credential_mode: "inline",
  credential_id: "",
  inline_auth_kind: "password",
  inline_password: "",
  inline_password_touched: false,
  inline_private_key_path: "",
  inline_private_key_passphrase: "",
  inline_private_key_passphrase_touched: false,
  prompt_auth_kind: "password",
  jump: defaultJumpConfig,
  proxy: defaultProxyConfig,
  advanced: defaultAdvancedConfig,
  rdp: defaultRdpConfig,
  vnc: defaultVncConfig,
  telnet: defaultTelnetConfig,
  serial: defaultSerialConfig,
  notes: "",
};

const protocolDefaultPorts = {
  ssh: 22,
  rdp: 3389,
  vnc: 5900,
  telnet: 23,
  serial: 1,
} as const;

function protocolOptions(): Array<{
  icon: typeof Terminal;
  label: string;
  value: ConnectionProtocol;
}> {
  return [
    { icon: Terminal, label: "SSH", value: "ssh" },
    { icon: Monitor, label: "RDP", value: "rdp" },
    { icon: MonitorPlay, label: "VNC", value: "vnc" },
    { icon: TerminalSquare, label: "Telnet", value: "telnet" },
    { icon: Cable, label: tr("connectionDialog.protocol.serial"), value: "serial" },
  ];
}

function credentialModeOptions(): Array<{
  label: string;
  value: ConnectionCredentialMode;
}> {
  return [
    { label: tr("connectionDialog.credential.saved"), value: "saved" },
    { label: tr("connectionDialog.credential.inline"), value: "inline" },
    { label: tr("connectionDialog.credential.prompt"), value: "prompt" },
  ];
}

function authKindOptions(): Array<{
  label: string;
  value: ConnectionAuthKind;
}> {
  return [
    { label: tr("connectionDialog.auth.password"), value: "password" },
    { label: tr("connectionDialog.auth.privateKey"), value: "private_key" },
  ];
}

function networkPathOptions(): Array<{
  label: string;
  value: ConnectionNetworkPathMode;
}> {
  return [
    { label: tr("connectionDialog.network.direct"), value: "direct" },
    { label: tr("connectionDialog.network.proxy"), value: "proxy" },
    { label: tr("connectionDialog.network.jump"), value: "ssh_jump" },
  ];
}

const proxyKindOptions: Array<{
  label: string;
  value: Exclude<ConnectionProxyKind, "none">;
}> = [
  { label: "HTTP CONNECT", value: "http_connect" },
  { label: "SOCKS5", value: "socks5" },
];

function rdpDisplayOptions(): Array<{ label: string; value: RdpDisplayMode }> {
  return [
    { label: tr("connectionDialog.rdp.fullscreen.embedded"), value: "embedded" },
    { label: tr("connectionDialog.rdp.fullscreen.single"), value: "fullscreen" },
    { label: tr("connectionDialog.rdp.fullscreen.all"), value: "all_monitors" },
  ];
}

function rdpResolutionModeOptions(): Array<{ label: string; value: "adaptive" | "fixed" }> {
  return [
    { label: tr("connectionDialog.rdp.resolution.adaptive"), value: "adaptive" },
    { label: tr("connectionDialog.rdp.resolution.fixed"), value: "fixed" },
  ];
}

function rdpAudioOptions(): Array<{ label: string; value: RdpAudioMode }> {
  return [
    { label: tr("connectionDialog.rdp.audio.local"), value: "local" },
    { label: tr("connectionDialog.rdp.audio.remote"), value: "remote" },
    { label: tr("connectionDialog.option.disabled"), value: "disabled" },
  ];
}

function rdpGatewayOptions(): Array<{ label: string; value: RdpGatewayMode }> {
  return [
    { label: tr("connectionDialog.option.disabled"), value: "disabled" },
    { label: tr("connectionDialog.option.auto"), value: "auto" },
    { label: tr("connectionDialog.rdp.gateway.explicit"), value: "explicit" },
  ];
}

function rdpPerformanceOptions(): Array<{ label: string; value: RdpPerformancePreset }> {
  return [
    { label: tr("connectionDialog.option.auto"), value: "auto" },
    { label: tr("connectionDialog.performance.lan"), value: "lan" },
    { label: tr("connectionDialog.performance.balanced"), value: "balanced" },
    { label: tr("connectionDialog.performance.lowBandwidth"), value: "low_bandwidth" },
  ];
}

function vncRunnerModeOptions(): Array<{ label: string; value: VncRenderMode }> {
  return [
    { label: tr("connectionDialog.vnc.runner.embedded"), value: "embedded" },
    { label: tr("connectionDialog.vnc.runner.windowed"), value: "windowed" },
    { label: tr("connectionDialog.vnc.runner.external"), value: "external" },
    { label: tr("connectionDialog.vnc.runner.custom"), value: "custom" },
  ];
}

function vncScaleModeOptions(): Array<{ label: string; value: VncScaleMode }> {
  return [
    { label: tr("connectionDialog.vnc.scale.fit"), value: "fit" },
    { label: tr("connectionDialog.vnc.scale.stretch"), value: "stretch" },
    { label: tr("connectionDialog.vnc.scale.actual"), value: "actual" },
  ];
}

function vncPerformanceOptions(): Array<{ label: string; value: VncPerformancePreset }> {
  return [
    { label: tr("connectionDialog.option.auto"), value: "auto" },
    { label: tr("connectionDialog.performance.quality"), value: "quality" },
    { label: tr("connectionDialog.performance.balanced"), value: "balanced" },
    { label: tr("connectionDialog.performance.lowBandwidth"), value: "low_bandwidth" },
  ];
}

const telnetEnterModeOptions: Array<{ label: string; value: TelnetEnterMode }> = [
  { label: "CRLF", value: "crlf" },
  { label: "CR", value: "cr" },
  { label: "LF", value: "lf" },
];

const backspaceModeOptions: Array<{ label: string; value: CharacterBackspaceMode }> = [
  { label: "DEL", value: "del" },
  { label: "Ctrl+H", value: "ctrl_h" },
];

const serialDataBitsOptions: Array<{ label: string; value: SerialDataBits }> = [
  { label: "5", value: "five" },
  { label: "6", value: "six" },
  { label: "7", value: "seven" },
  { label: "8", value: "eight" },
];

const serialParityOptions: Array<{ label: string; value: SerialParity }> = [
  { label: "None", value: "none" },
  { label: "Odd", value: "odd" },
  { label: "Even", value: "even" },
];

const serialStopBitsOptions: Array<{ label: string; value: SerialStopBits }> = [
  { label: "1", value: "one" },
  { label: "2", value: "two" },
];

function serialFlowControlOptions(): Array<{ label: string; value: SerialFlowControl }> {
  return [
    { label: tr("connectionDialog.option.none"), value: "none" },
    { label: tr("connectionDialog.option.software"), value: "software" },
    { label: tr("connectionDialog.option.hardware"), value: "hardware" },
  ];
}

function rdpNlaOptions(): Array<{ label: string; value: RdpNetworkLevelAuthentication }> {
  return [
    { label: tr("connectionDialog.option.auto"), value: "auto" },
    { label: tr("connectionDialog.option.enabled"), value: "enabled" },
    { label: tr("connectionDialog.option.disabled"), value: "disabled" },
  ];
}

function rdpCertificateOptions(): Array<{ label: string; value: RdpCertificatePolicy }> {
  return [
    { label: tr("connectionDialog.rdp.nla.prompt"), value: "prompt" },
    { label: tr("connectionDialog.rdp.cert.trust"), value: "trust" },
    { label: tr("connectionDialog.rdp.cert.strict"), value: "strict" },
  ];
}

export function ConnectionDialog({
  connection,
  connections,
  credentials,
  defaultGroup,
  duplicate = false,
  groups,
  initialProtocol,
  allowPasswordReveal,
  open,
  onClose,
  onDelete,
  onManageCredentials,
  onSave,
  onTest,
  onTrustHostKey,
}: ConnectionDialogProps) {
  const [form, setForm] = useState<ConnectionProfileInput>(emptyForm);
  const [activeTab, setActiveTab] = useState<ConnectionDialogTab>("basic");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<DialogFeedback | null>(null);
  const [testState, setTestState] = useState<ConnectionTestState>("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);

  async function choosePrivateKeyPath() {
    if (!hasTauriRuntime()) {
      return;
    }
    // 用户取消选择或对话框失败时保持原值；选择器错误由系统弹窗承担，这里不额外提示。
    const selectedPath = await selectLocalPrivateKeyFile().catch(() => null);
    if (selectedPath) {
      setForm((current) => ({ ...current, inline_private_key_path: selectedPath }));
    }
  }
  const [showProxyPassword, setShowProxyPassword] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [revealBusy, setRevealBusy] = useState(false);
  const busyRef = useRef(false);
  const groupOptions = useMemo(
    () => buildGroupOptions(groups, form.group_id || ""),
    [form.group_id, groups],
  );
  const { t } = useI18n();
  const desktopPlatform = useMemo(() => resolveDesktopPlatform(), []);
  const platformCapabilities = useMemo(
    () => getPlatformCapabilities(desktopPlatform),
    [desktopPlatform],
  );
  const defaultRdpExternalRunner = useMemo(
    () => defaultRdpExternalRunnerForPlatform(desktopPlatform),
    [desktopPlatform],
  );
  const rdpRunnerModeOptions = useMemo<Array<{ label: string; value: RdpRenderMode }>>(
    () => {
      const options: Array<{ label: string; value: RdpRenderMode }> = [];
      if (platformCapabilities.supportsEmbeddedRdp) {
        options.push({ label: t("connectionDialog.rdp.runner.embedded"), value: "embedded" });
      }
      options.push({
        label: rdpExternalModeLabelForPlatform(desktopPlatform),
        value: "external",
      });
      return options;
    },
    [desktopPlatform, platformCapabilities.supportsEmbeddedRdp, t],
  );
  const rdpExternalModeNote = useMemo(
    () => rdpExternalModeNoteForPlatform(desktopPlatform),
    [desktopPlatform],
  );
  const protocol = form.protocol || "ssh";
  const isRdp = protocol === "rdp";
  const isVnc = protocol === "vnc";
  const isTelnet = protocol === "telnet";
  const isSerial = protocol === "serial";
  const isCharacterProtocol = isTelnet || isSerial;
  const submitPolicy = connectionDialogSubmitPolicy(Boolean(connection && !duplicate));
  const currentConnectionId = connection && !duplicate ? connection.id : form.id || "";
  const dialogTabs: Array<[ConnectionDialogTab, string]> = isRdp
    ? [
        ["basic", t("connectionDialog.tab.basic")],
        ["rdp", "RDP"],
        ["advanced", t("connectionDialog.tab.advanced")],
      ]
    : isVnc
      ? [
          ["basic", "基本"],
          ["vnc", "VNC"],
          ["advanced", "高级"],
        ]
      : isCharacterProtocol
        ? [["basic", "基本"]]
    : [
        ["basic", "基本"],
        ["proxy", t("connectionDialog.tab.network")],
        ["advanced", "高级"],
      ];
  const [serialPorts, setSerialPorts] = useState<SerialPortEntry[]>([]);
  const [serialPortsLoading, setSerialPortsLoading] = useState(false);
  const [serialPortsError, setSerialPortsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab("basic");
    busyRef.current = false;
    setBusy(false);
    setFeedback(null);
    setTestState("idle");
    setShowPassword(false);
    setShowPassphrase(false);
    setShowProxyPassword(false);
    setRevealBusy(false);
    setDeleteConfirmOpen(false);
    setForm(
      connection
        ? duplicate
          ? duplicateFormFromConnection(connection, connections, groups)
          : formFromConnection(connection, groups)
        : {
            ...emptyForm,
            group_id: defaultGroup || "",
            port: protocolDefaultPorts[initialProtocol || "ssh"],
            protocol: initialProtocol || "ssh",
          },
    );
  }, [connection, connections, defaultGroup, duplicate, groups, initialProtocol, open]);

  useEffect(() => {
    if (!open || protocol !== "serial") {
      return;
    }
    void refreshSerialPorts();
  }, [open, protocol]);

  if (!open) {
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitWithIntent(submitPolicy.primary.intent);
  }

  async function submitWithIntent(intent: ConnectionSaveIntent) {
    const validation = isRdp || isVnc || isCharacterProtocol ? null : validateConnectionNetworkPath(form) || validateJumpPlanSelection(form, connections, currentConnectionId);
    if (validation) {
      setActiveTab("proxy");
      setTestState("error");
      setFeedback(validation);
      return;
    }
    await runAction(async () => {
      await onSave(normalizeForSubmit(form, credentials), intent);
      onClose();
    });
  }

  function submitSecondary(event: MouseEvent<HTMLButtonElement>) {
    if (event.currentTarget.form?.reportValidity() === false) return;
    void submitWithIntent(submitPolicy.secondary.intent);
  }

  async function testConnection() {
    if (busyRef.current) {
      return;
    }

    if (isRdp) {
      await runRdpRunnerProbe();
      return;
    }

    if (isVnc) {
      await runVncRunnerProbe();
      return;
    }

    if (isCharacterProtocol) {
      setTestState("success");
      setFeedback({
        detail: t("connectionDialog.test.characterDetail"),
        title: t("connectionDialog.test.characterTitle"),
      });
      return;
    }

    const validation = validateConnectionNetworkPath(form) || validateJumpPlanSelection(form, connections, currentConnectionId);
    if (validation) {
      setActiveTab("proxy");
      setTestState("error");
      setFeedback(validation);
      return;
    }

    await runConnectionTest(normalizeForSubmit(form, credentials));
  }

  async function runRdpRunnerProbe() {
    busyRef.current = true;
    setBusy(true);
    setTestState("running");
    setFeedback({
      detail: t("connectionDialog.test.rdpCheckingDetail"),
      title: t("connectionDialog.test.rdpCheckingTitle"),
    });

    try {
      if (!hasTauriRuntime()) {
        setTestState("success");
        setFeedback({
          detail: t("connectionDialog.test.previewDetail"),
          title: t("connectionDialog.test.rdpPreviewTitle"),
        });
        return;
      }
      const result = await rdpTestRunner((form.rdp || defaultRdpConfig).runner);
      if (result.default_runner) {
        const availabilityDetail = t("connectionDialog.test.runnerAvailable", {
          runner: formatRdpRunnerKind(result.default_runner),
          detail: result.supports_embedded
            ? t("connectionDialog.test.rdpEmbedded")
            : t("connectionDialog.test.rdpExternal"),
        });
        setTestState("success");
        setFeedback({
          detail: result.setup_hint
            ? `${availabilityDetail}${result.setup_hint}`
            : availabilityDetail,
          title: t("connectionDialog.test.rdpPass"),
        });
      } else {
        setTestState("error");
        setFeedback({
          detail: result.setup_hint || t("connectionDialog.test.rdpMissing"),
          title: t("connectionDialog.test.rdpMissingTitle"),
        });
      }
    } catch (nextError) {
      setTestState("error");
      setFeedback(describeDialogError(nextError));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function runVncRunnerProbe() {
    busyRef.current = true;
    setBusy(true);
    setTestState("running");
    setFeedback({
      detail: t("connectionDialog.test.vncCheckingDetail"),
      title: t("connectionDialog.test.vncCheckingTitle"),
    });

    try {
      if (!hasTauriRuntime()) {
        setTestState("success");
        setFeedback({
          detail: t("connectionDialog.test.previewDetail"),
          title: t("connectionDialog.test.vncPreviewTitle"),
        });
        return;
      }
      const result = await vncTestRunner((form.vnc || defaultVncConfig).runner);
      if (result.default_runner) {
        setTestState("success");
        setFeedback({
          detail: t("connectionDialog.test.runnerAvailable", {
            runner: formatVncRunnerKind(result.default_runner),
            detail: result.supports_embedded
              ? t("connectionDialog.test.vncEmbedded")
              : t("connectionDialog.test.vncExternal"),
          }),
          title: t("connectionDialog.test.vncPass"),
        });
      } else {
        setTestState("error");
        setFeedback({
          detail: result.setup_hint || t("connectionDialog.test.vncMissing"),
          title: t("connectionDialog.test.vncMissingTitle"),
        });
      }
    } catch (nextError) {
      setTestState("error");
      setFeedback(describeDialogError(nextError));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function trustHostKeyAndContinueTest() {
    if (busyRef.current || !feedback?.hostKey) {
      return;
    }

    const input = normalizeForSubmit(form, credentials);
    busyRef.current = true;
    setBusy(true);
    setFeedback({
      detail:
        feedback.hostKeyDecision === "changed"
          ? t("connectionDialog.hostKey.updating")
          : t("connectionDialog.hostKey.saving"),
      title: t("connectionDialog.hostKey.confirming"),
    });
    setTestState("running");

    try {
      await onTrustHostKey(feedback.hostKey);
    } catch (nextError) {
      setTestState("error");
      setFeedback(describeDialogError(nextError));
      busyRef.current = false;
      setBusy(false);
      return;
    }

    busyRef.current = false;
    setBusy(false);
    await runConnectionTest(input);
  }

  async function runConnectionTest(input: ConnectionProfileInput) {
    busyRef.current = true;
    setBusy(true);
    setFeedback({
      detail: t("connectionDialog.test.detail"),
      title: t("connectionDialog.test.checking", { address: formatAddress(input) }),
    });
    setTestState("running");

    try {
      await onTest(input);
      setTestState("success");
      setFeedback({
        detail: t("connectionDialog.test.successDetail"),
        title: t("connectionDialog.test.success"),
      });
    } catch (nextError) {
      setActiveTab(tabForError(nextError));
      const hostKeyError = parseHostKeyError(nextError);
      if (hostKeyError) {
        setTestState("host-key");
        setFeedback(describeHostKeyFeedback(hostKeyError));
      } else {
        setTestState("error");
        setFeedback(describeDialogError(nextError));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!connection) {
      return;
    }

    await runAction(async () => {
      await onDelete(connection);
      onClose();
    });
  }

  async function runAction(action: () => Promise<void>) {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setFeedback(null);

    try {
      await action();
    } catch (nextError) {
      setActiveTab(tabForError(nextError));
      setTestState("error");
      setFeedback(describeDialogError(nextError));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function refreshSerialPorts() {
    setSerialPortsLoading(true);
    setSerialPortsError(null);
    try {
      if (!hasTauriRuntime()) {
        const previewPorts = [
          { description: "USB Serial", port_name: "COM3", port_type: "usb" },
          { description: "Bluetooth", port_name: "COM4", port_type: "bluetooth" },
        ];
        setSerialPorts(previewPorts);
        setForm((current) => {
          if ((current.protocol || "ssh") !== "serial" || current.serial?.port_name) {
            return current;
          }
          return {
            ...current,
            host: previewPorts[0]?.port_name || current.host,
            serial: {
              ...withDefaultSerialConfig(current.serial),
              port_name: previewPorts[0]?.port_name || "",
            },
          };
        });
        return;
      }

      const ports = await serialListPorts();
      setSerialPorts(ports);
      setForm((current) => {
        if ((current.protocol || "ssh") !== "serial" || current.serial?.port_name) {
          return current;
        }
        return {
          ...current,
          host: ports[0]?.port_name || current.host,
          serial: {
            ...withDefaultSerialConfig(current.serial),
            port_name: ports[0]?.port_name || "",
          },
        };
      });
    } catch (error) {
      setSerialPortsError(formatError(error));
    } finally {
      setSerialPortsLoading(false);
    }
  }

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onClose();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content
            asChild
            onInteractOutside={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <form className="connection-dialog" onSubmit={submit}>
              <header className="dialog-head">
                <div className="dialog-title-group">
                  <Dialog.Title asChild>
                    <strong>{duplicate ? t("connectionDialog.title.duplicate") : connection ? t("connectionDialog.title.edit") : t("connectionDialog.title.new")}</strong>
                  </Dialog.Title>
                  <Dialog.Description className="dialog-subtitle">
                    {form.host
                      ? formatAddress(form)
                      : isRdp
                        ? t("connectionDialog.description.rdp")
                        : isVnc
                          ? t("connectionDialog.description.vnc")
                          : isTelnet
                            ? t("connectionDialog.description.telnet")
                            : isSerial
                              ? t("connectionDialog.description.serial")
                              : t("connectionDialog.description.ssh")}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button className="icon-button dialog-close-button" type="button" aria-label={t("connectionDialog.close")}>
                    <X className="ui-icon" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </header>

              <div className="protocol-switch" aria-label={t("connectionDialog.protocolAria")}>
                {protocolOptions().map((item) => {
                  const Icon = item.icon;
                  const active = protocol === item.value;
                  return (
                    <button
                      className={`protocol-chip ${active ? "active" : ""}`}
                      key={item.value}
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => changeProtocol(item.value)}
                    >
                      <Icon className="ui-icon" aria-hidden="true" />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <nav className="connection-dialog-tabs" aria-label={t("connectionDialog.tabsAria")}>
                {dialogTabs.map(([id, label]) => (
                  <button
                    className={activeTab === id ? "active" : ""}
                    key={id}
                    type="button"
                    aria-current={activeTab === id ? "page" : undefined}
                    onClick={() => setActiveTab(id as ConnectionDialogTab)}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className="dialog-body connection-dialog-body">
                {activeTab === "basic" ? renderBasicTab() : null}
                {activeTab === "proxy" && !isRdp && !isVnc ? renderProxyTab() : null}
                {activeTab === "rdp" && isRdp ? renderRdpTab() : null}
                {activeTab === "vnc" && isVnc ? renderVncTab() : null}
                {activeTab === "advanced" ? renderAdvancedTab() : null}
              </div>

              {feedback ? (
                <div
                  className={`conn-feedback ${testState}`}
                  role={testState === "error" || testState === "host-key" ? "alert" : "status"}
                >
                  <span className="fb-icon" aria-hidden="true">
                    {testState === "running" ? (
                      <Loader2 className="ui-icon spin" />
                    ) : testState === "success" ? (
                      <CheckCircle2 className="ui-icon" />
                    ) : (
                      <AlertTriangle className="ui-icon" />
                    )}
                  </span>
                  <div className="fb-body">
                    <strong className="fb-title">{feedback.title}</strong>
                    <span className="fb-detail">
                      {feedback.detail}
                      {feedback.rawMessage && testState !== "host-key" ? (
                        <>
                          {" "}
                          {t("connectionDialog.feedback.reason", { reason: feedback.rawMessage })}
                        </>
                      ) : null}
                    </span>
                    {feedback.hostKey ? (
                      <dl className="fb-host-key">
                        <div>
                          <dt>{t("connectionDialog.hostKey.host")}</dt>
                          <dd>{feedback.hostKey.host}:{feedback.hostKey.port.toString()}</dd>
                        </div>
                        <div>
                          <dt>{t("connectionDialog.hostKey.algorithm")}</dt>
                          <dd>{feedback.hostKey.key_algorithm}</dd>
                        </div>
                        {feedback.oldHostKeyFingerprint ? (
                          <div>
                            <dt>{t("connectionDialog.hostKey.savedFingerprint")}</dt>
                            <dd>{feedback.oldHostKeyFingerprint}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt>
                            {feedback.oldHostKeyFingerprint ? t("connectionDialog.hostKey.currentFingerprint") : t("connectionDialog.hostKey.sha256")}
                          </dt>
                          <dd>{feedback.hostKey.fingerprint_sha256}</dd>
                        </div>
                      </dl>
                    ) : null}
                    {testState === "error" ? (
                      <div className="fb-actions">
                        <button
                          className="fb-primary"
                          type="button"
                          disabled={busy}
                          onClick={testConnection}
                        >
                          <RefreshCw className="ui-icon" aria-hidden="true" />
                          <span>{t("connectionDialog.retry")}</span>
                        </button>
                      </div>
                    ) : null}
                    {testState === "host-key" ? (
                      <div className="fb-actions">
                        <button
                          className="fb-primary"
                          type="button"
                          disabled={busy}
                          onClick={trustHostKeyAndContinueTest}
                        >
                          <RefreshCw className="ui-icon" aria-hidden="true" />
                          <span>
                            {feedback.hostKeyDecision === "changed"
                              ? t("connectionDialog.hostKey.updateTrust")
                              : t("connectionDialog.hostKey.trust")}
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <footer className="dialog-actions connection-dialog-actions">
                <div className="dialog-action-left">
                  {connection && !duplicate ? (
                    <button
                      className="danger-button"
                      disabled={busy}
                      type="button"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      {t("connectionDialog.delete")}
                    </button>
                  ) : null}
                  <button
                    className="test-connection-button"
                    disabled={busy}
                    type="button"
                    onClick={testConnection}
                  >
                    {isRdp || isVnc ? t("connectionDialog.checkRunner") : isCharacterProtocol ? t("connectionDialog.checkConfig") : t("connectionDialog.testConnection")}
                  </button>
                </div>
                <div className="dialog-action-right">
                  <Dialog.Close asChild>
                    <button disabled={busy} type="button">
                      {t("connectionDialog.cancel")}
                    </button>
                  </Dialog.Close>
                  <button disabled={busy} type="button" onClick={submitSecondary}>{submitPolicy.secondary.label}</button>
                  <button className="primary-button" disabled={busy} type="submit">
                    {submitPolicy.primary.label}
                  </button>
                </div>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {connection && !duplicate ? (
        <ConfirmDialog
          confirmLabel={t("connectionDialog.delete")}
          description={t("connectionDialog.deleteDescription", { name: connection.name })}
          open={deleteConfirmOpen}
          title={t("connectionDialog.deleteTitle")}
          onConfirm={remove}
          onOpenChange={setDeleteConfirmOpen}
        />
      ) : null}
    </>
  );

  function renderBasicTab() {
    const credentialMode = form.credential_mode || "inline";
    const inlineAuthKind = form.inline_auth_kind || "password";
    const showGroupField = groupOptions.length > 0 || Boolean(form.group_id?.trim());
    const rdp = form.rdp || defaultRdpConfig;
    const passwordCredentials = credentials.filter((credential) => credential.kind === "password");
    const desktopProtocolName = isRdp ? "RDP" : "VNC";
    const desktopDefaultPort = isRdp ? 3389 : 5900;

    if (isTelnet) {
      const telnet = withDefaultTelnetConfig(form.telnet);
      return (
        <div className="connection-dialog-fields">
          <div className={`form-grid ${showGroupField ? "form-grid-wide" : "form-grid-single"}`}>
            <label>
              <span>{t("connectionDialog.field.nameOptional")}</span>
              <input
                value={form.name || ""}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={t("connectionDialog.telnet.namePlaceholder")}
              />
            </label>
            {showGroupField ? (
              <label>
                <span>{t("connectionDialog.field.group")}</span>
                <AppSelect
                  ariaLabel={t("connectionDialog.field.group")}
                  value={form.group_id || ""}
                  options={[
                    { label: t("connectionDialog.group.none"), value: "" },
                    ...groupOptions.map((group) => ({
                      label: group.label,
                      value: group.value,
                    })),
                  ]}
                  onChange={(group) => setForm({ ...form, group: undefined, group_id: group })}
                />
              </label>
            ) : null}
          </div>
          <div className="form-grid">
            <label>
              <span>{t("connectionDialog.field.host")}</span>
              <input
                required
                value={form.host}
                onChange={(event) => setForm({ ...form, host: event.target.value })}
                placeholder={t("connectionDialog.hostPlaceholder")}
              />
            </label>
            <label>
              <span>{t("connectionDialog.field.port")}</span>
              <input
                inputMode="numeric"
                required
                value={form.port.toString()}
                onChange={(event) =>
                  setForm({ ...form, port: Number(event.target.value) || 23 })
                }
              />
            </label>
          </div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>{t("connectionDialog.field.enterMode")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.enterMode")}
                value={telnet.enter_mode}
                options={telnetEnterModeOptions}
                onChange={(enterMode) =>
                  setForm({
                    ...form,
                    telnet: { ...telnet, enter_mode: enterMode },
                  })
                }
              />
            </label>
            <label>
              <span>{t("connectionDialog.field.backspaceMode")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.backspaceMode")}
                value={telnet.backspace_mode}
                options={backspaceModeOptions}
                onChange={(backspaceMode) =>
                  setForm({
                    ...form,
                    telnet: { ...telnet, backspace_mode: backspaceMode },
                  })
                }
              />
            </label>
          </div>
          <label>
            <span>{t("connectionDialog.field.notes")}</span>
            <textarea
              rows={3}
              value={form.notes || ""}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder={t("connectionDialog.notes.characterPlaceholder")}
            />
          </label>
        </div>
      );
    }

    if (isSerial) {
      const serial = withDefaultSerialConfig(form.serial);
      const serialAvailability = serialPortAvailability({
        error: serialPortsError,
        loading: serialPortsLoading,
        ports: serialPorts,
      });
      const serialAvailabilityMessage =
        serialAvailability.status === "loading"
          ? t("connectionDialog.serial.loading")
          : serialAvailability.status === "list_failed"
            ? t("connectionDialog.serial.error", { message: serialAvailability.error || t("connectionDialog.serial.unknownError") })
            : serialAvailability.status === "no_ports"
              ? t("connectionDialog.serial.none")
              : t("connectionDialog.serial.count", { count: serialAvailability.count });
      const serialPortOptions =
        serialPorts.length > 0
          ? serialPorts.map((port) => ({
              label: port.description ? `${port.port_name} · ${port.description}` : port.port_name,
              value: port.port_name,
            }))
          : [
              {
                disabled: true,
                label:
                  serialAvailability.status === "loading"
                    ? t("connectionDialog.serial.loadingShort")
                    : serialAvailability.status === "list_failed"
                      ? t("connectionDialog.serial.errorShort")
                      : t("connectionDialog.serial.noneShort"),
                value: "",
              },
            ];
      return (
        <div className="connection-dialog-fields">
          <div className={`form-grid ${showGroupField ? "form-grid-wide" : "form-grid-single"}`}>
            <label>
              <span>{t("connectionDialog.field.nameOptional")}</span>
              <input
                value={form.name || ""}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={t("connectionDialog.serial.namePlaceholder")}
              />
            </label>
            {showGroupField ? (
              <label>
                <span>{t("connectionDialog.field.group")}</span>
                <AppSelect
                  ariaLabel={t("connectionDialog.field.group")}
                  value={form.group_id || ""}
                  options={[
                    { label: t("connectionDialog.group.none"), value: "" },
                    ...groupOptions.map((group) => ({
                      label: group.label,
                      value: group.value,
                    })),
                  ]}
                  onChange={(group) => setForm({ ...form, group: undefined, group_id: group })}
                />
              </label>
            ) : null}
          </div>
          <div className="credential-select-row">
            <label>
              <span>{t("connectionDialog.field.serial")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.serial")}
                disabled={serialAvailability.status !== "available"}
                value={serial.port_name}
                options={serialPortOptions}
                menuMinWidth={220}
                onChange={(portName) =>
                  setForm({
                    ...form,
                    host: portName,
                    serial: { ...serial, port_name: portName },
                  })
                }
              />
            </label>
            <button
              className="settings-action-button credential-manage-button"
              type="button"
              disabled={serialPortsLoading}
              onClick={() => void refreshSerialPorts()}
            >
              <RefreshCw className={`ui-icon ${serialPortsLoading ? "spin" : ""}`} aria-hidden="true" />
              刷新
            </button>
          </div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>{t("connectionDialog.field.baudRate")}</span>
              <input
                inputMode="numeric"
                required
                value={serial.baud_rate.toString()}
                onChange={(event) =>
                  setForm({
                    ...form,
                    serial: {
                      ...serial,
                      baud_rate: Number(event.target.value) || defaultSerialConfig.baud_rate,
                    },
                  })
                }
              />
            </label>
            <label>
              <span>{t("connectionDialog.field.backspaceMode")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.backspaceMode")}
                value={serial.backspace_mode}
                options={backspaceModeOptions}
                onChange={(backspaceMode) =>
                  setForm({
                    ...form,
                    serial: { ...serial, backspace_mode: backspaceMode },
                  })
                }
              />
            </label>
          </div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>{t("connectionDialog.field.dataBits")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.dataBits")}
                value={serial.data_bits}
                options={serialDataBitsOptions}
                onChange={(dataBits) =>
                  setForm({ ...form, serial: { ...serial, data_bits: dataBits } })
                }
              />
            </label>
            <label>
              <span>{t("connectionDialog.field.parity")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.parity")}
                value={serial.parity}
                options={serialParityOptions}
                onChange={(parity) =>
                  setForm({ ...form, serial: { ...serial, parity } })
                }
              />
            </label>
          </div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>{t("connectionDialog.field.stopBits")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.stopBits")}
                value={serial.stop_bits}
                options={serialStopBitsOptions}
                onChange={(stopBits) =>
                  setForm({ ...form, serial: { ...serial, stop_bits: stopBits } })
                }
              />
            </label>
            <label>
              <span>{t("connectionDialog.field.flowControl")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.flowControl")}
                value={serial.flow_control}
                options={serialFlowControlOptions()}
                onChange={(flowControl) =>
                  setForm({ ...form, serial: { ...serial, flow_control: flowControl } })
                }
              />
            </label>
          </div>
          <p
            className="connection-dialog-note"
            data-serial-availability={serialAvailability.status}
          >
            {serialAvailabilityMessage}
          </p>
          <label>
            <span>{t("connectionDialog.field.notes")}</span>
            <textarea
              rows={3}
              value={form.notes || ""}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder={t("connectionDialog.serial.notesPlaceholder")}
            />
          </label>
        </div>
      );
    }

    if (isRdp || isVnc) {
      return (
        <div className="connection-dialog-fields">
          <div className={`form-grid ${showGroupField ? "form-grid-wide" : "form-grid-single"}`}>
            <label>
              <span>{t("connectionDialog.field.nameOptional")}</span>
              <input
              value={form.name || ""}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={isRdp ? t("connectionDialog.desktop.rdpNamePlaceholder") : t("connectionDialog.desktop.vncNamePlaceholder")}
            />
            </label>
            {showGroupField ? (
              <label>
                <span>{t("connectionDialog.field.group")}</span>
                <AppSelect
                  ariaLabel={t("connectionDialog.field.group")}
                  value={form.group_id || ""}
                  options={[
                    { label: t("connectionDialog.group.none"), value: "" },
                    ...groupOptions.map((group) => ({
                      label: group.label,
                      value: group.value,
                    })),
                  ]}
                  onChange={(group) => setForm({ ...form, group: undefined, group_id: group })}
                />
              </label>
            ) : null}
          </div>

          <div className="form-grid">
            <label>
              <span>{t("connectionDialog.field.host")}</span>
              <input
                required
                value={form.host}
                onChange={(event) => setForm({ ...form, host: event.target.value })}
                placeholder={t("connectionDialog.hostPlaceholder")}
              />
            </label>
            <label>
              <span>{t("connectionDialog.field.port")}</span>
              <input
                inputMode="numeric"
                required
                value={form.port.toString()}
                onChange={(event) =>
                  setForm({ ...form, port: Number(event.target.value) || desktopDefaultPort })
                }
              />
            </label>
          </div>

          <div className="form-grid form-grid-wide">
            <label>
              <span>{t("connectionDialog.field.credentialSource")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.credentialSource")}
                value={credentialMode}
                options={credentialModeOptions()}
                onChange={(credentialMode) =>
                  setForm({
                    ...form,
                    credential_mode: credentialMode,
                    credential_id: credentialMode === "saved" ? form.credential_id : "",
                    inline_auth_kind: "password",
                    inline_password:
                      credentialMode === "inline" ? form.inline_password || "" : "",
                    inline_password_touched:
                      credentialMode === "inline" ? form.inline_password_touched || false : false,
                    inline_private_key_path: "",
                    inline_private_key_passphrase: "",
                    inline_private_key_passphrase_touched: false,
                    prompt_auth_kind: undefined,
                  })
                }
              />
            </label>
            <label>
              <span>{isRdp ? t("connectionDialog.field.domain") : t("connectionDialog.field.username")}</span>
              {isRdp ? (
                <input
                  value={rdp.domain || ""}
                  onChange={(event) => updateRdp({ domain: event.target.value })}
                  placeholder={t("connectionDialog.optional")}
                />
              ) : (
                <input
                  required
                  {...usernameInputAttributes}
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  placeholder="vncuser"
                />
              )}
            </label>
          </div>

          {credentialMode === "saved" ? (
            <div className="credential-select-row">
              <label>
                <span>{t("connectionDialog.field.savedAccount")}</span>
                <AppSelect
                  ariaLabel={t("connectionDialog.field.savedAccount")}
                  value={form.credential_id || ""}
                  options={[
                    { label: t("connectionDialog.savedPasswordAccount"), value: "" },
                    ...passwordCredentials.map((credential) => ({
                      label: `${credential.name}${credential.username ? ` (${credential.username})` : ""}${t("connectionDialog.account.passwordSuffix")}`,
                      value: credential.id,
                    })),
                  ]}
                  onChange={(credentialId) =>
                    setForm({
                      ...form,
                      credential_id: credentialId,
                      inline_auth_kind: "password",
                      inline_password: "",
                      inline_password_touched: false,
                    })
                  }
                />
              </label>
              <button
                className="settings-action-button credential-manage-button"
                type="button"
                onClick={onManageCredentials}
              >
                {t("connectionDialog.manage")}
              </button>
            </div>
          ) : null}

          {credentialMode !== "saved" && (isRdp || credentialMode === "inline") ? (
            <div className="form-grid form-grid-wide">
              {isRdp ? (
                <label>
                  <span>{t("connectionDialog.field.username")}</span>
                  <input
                    required
                    {...usernameInputAttributes}
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                    placeholder={t("connectionDialog.usernamePlaceholder")}
                  />
                </label>
              ) : null}
              {credentialMode === "inline" ? (
                <label>
                  <span>{t("connectionDialog.field.password")}</span>
                  <div className="input-with-toggle">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.inline_password || ""}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          inline_auth_kind: "password",
                          inline_password: event.target.value,
                          inline_password_touched: true,
                        })
                      }
                      placeholder={
                        connection?.id && !form.inline_password
                          ? t("connectionDialog.password.savedKeep")
                          : t("connectionDialog.password.input", { protocol: desktopProtocolName })
                      }
                    />
                    {allowPasswordReveal ? (
                      <button
                        className="field-toggle"
                        type="button"
                        disabled={revealBusy}
                        aria-label={showPassword ? t("connectionDialog.password.hide") : t("connectionDialog.password.show")}
                        onClick={() => void toggleInlinePasswordVisibility()}
                      >
                        {showPassword ? (
                          <EyeOff className="ui-icon" aria-hidden="true" />
                        ) : (
                          <Eye className="ui-icon" aria-hidden="true" />
                        )}
                      </button>
                    ) : null}
                  </div>
                </label>
              ) : null}
            </div>
          ) : null}

          {credentialMode === "prompt" ? (
            <p className="connection-dialog-note">
              {isRdp
                ? t("connectionDialog.rdp.promptNote")
                : t("connectionDialog.vnc.promptNote")}
            </p>
          ) : (
            <p className="connection-dialog-note">
              {isRdp
                ? t("connectionDialog.rdp.savedPasswordNote")
                : t("connectionDialog.vnc.savedPasswordNote")}
            </p>
          )}

          <label>
            <span>{t("connectionDialog.field.notes")}</span>
            <textarea
              rows={3}
              value={form.notes || ""}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder={t("connectionDialog.notes.desktopPlaceholder")}
            />
          </label>
        </div>
      );
    }

    return (
      <div className="connection-dialog-fields">
        {/* 目标：名称/分组、主机/端口 平铺，无分组标题 */}
        <div className={`form-grid ${showGroupField ? "form-grid-wide" : "form-grid-single"}`}>
          <label>
            <span>{t("connectionDialog.field.nameOptional")}</span>
            <input
              value={form.name || ""}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t("connectionDialog.ssh.namePlaceholder")}
            />
          </label>
          {showGroupField ? (
            <label>
              <span>{t("connectionDialog.field.group")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.group")}
                value={form.group_id || ""}
                options={[
                  { label: t("connectionDialog.group.none"), value: "" },
                  ...groupOptions.map((group) => ({
                    label: group.label,
                    value: group.value,
                  })),
                ]}
                onChange={(group) => setForm({ ...form, group: undefined, group_id: group })}
              />
            </label>
          ) : null}
        </div>

        <div className="form-grid">
          <label>
            <span>{t("connectionDialog.field.host")}</span>
            <input
              required
              value={form.host}
              onChange={(event) => setForm({ ...form, host: event.target.value })}
              placeholder={t("connectionDialog.hostPlaceholder")}
            />
          </label>
          <label>
            <span>{t("connectionDialog.field.port")}</span>
            <input
              inputMode="numeric"
              required
              value={form.port.toString()}
              onChange={(event) =>
                setForm({ ...form, port: Number(event.target.value) || 22 })
              }
            />
          </label>
        </div>

        {/* 登录账号 */}
        {credentialMode === "inline" ? (
          <>
            {/* 账号来源 + 认证方式 并排 */}
            <div className="form-grid form-grid-wide">
              <label>
                <span>{t("connectionDialog.field.credentialSource")}</span>
                <AppSelect
                  ariaLabel={t("connectionDialog.field.credentialSource")}
                  value={credentialMode}
                  options={credentialModeOptions()}
                  onChange={(credentialMode) =>
                    setForm({
                      ...form,
                      credential_mode: credentialMode,
                    })
                  }
                />
              </label>
              <label>
                <span>{t("connectionDialog.field.authMethod")}</span>
                <AppSelect
                  ariaLabel={t("connectionDialog.field.authMethod")}
                  value={inlineAuthKind}
                  options={authKindOptions()}
                  onChange={changeInlineAuthKind}
                />
              </label>
            </div>

            {/* 用户名 + 密码 并排（密码模式）；用户名单行（私钥模式） */}
            {inlineAuthKind === "password" ? (
              <div className="form-grid form-grid-wide">
                <label>
                  <span>{t("connectionDialog.field.username")}</span>
                  <input
                    required
                    {...usernameInputAttributes}
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                    placeholder={t("connectionDialog.usernamePlaceholder")}
                  />
                </label>
                <label>
                  <span>{t("connectionDialog.field.password")}</span>
                  <div className="input-with-toggle">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.inline_password || ""}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          inline_password: event.target.value,
                          inline_password_touched: true,
                        })
                      }
                      placeholder={
                        connection?.id && !form.inline_password
                          ? t("connectionDialog.password.savedKeep")
                          : t("connectionDialog.password.input", { protocol: "SSH" })
                      }
                    />
                    {allowPasswordReveal ? (
                      <button
                        className="field-toggle"
                        type="button"
                        disabled={revealBusy}
                        aria-label={showPassword ? t("connectionDialog.password.hide") : t("connectionDialog.password.show")}
                        onClick={() => void toggleInlinePasswordVisibility()}
                      >
                        {showPassword ? (
                          <EyeOff className="ui-icon" aria-hidden="true" />
                        ) : (
                          <Eye className="ui-icon" aria-hidden="true" />
                        )}
                      </button>
                    ) : null}
                  </div>
                </label>
              </div>
            ) : (
              <label>
                <span>{t("connectionDialog.field.username")}</span>
                <input
                  required
                  {...usernameInputAttributes}
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  placeholder={t("connectionDialog.usernamePlaceholder")}
                />
              </label>
            )}

            {/* 私钥字段（仅私钥模式） */}
            {inlineAuthKind === "private_key" ? (
              <>
                <label>
                  <span>{t("connectionDialog.privateKey.path")}</span>
                  <div className="settings-path-picker credential-private-key-picker">
                    <input
                      className="settings-path-input"
                      value={form.inline_private_key_path || ""}
                      onChange={(event) =>
                        setForm({ ...form, inline_private_key_path: event.target.value })
                      }
                      placeholder={t("connectionDialog.privateKey.placeholder")}
                    />
                    <button
                      className="settings-action-button settings-path-button"
                      type="button"
                      aria-label={t("connectionDialog.privateKey.choose")}
                      onClick={choosePrivateKeyPath}
                    >
                      <FolderOpen className="ui-icon" aria-hidden="true" />
                      <span>{t("connectionDialog.choose")}</span>
                    </button>
                  </div>
                </label>
                <label>
                  <span>{t("connectionDialog.privateKey.passphrase")}</span>
                  <div className="input-with-toggle">
                    <input
                      type={showPassphrase ? "text" : "password"}
                      value={form.inline_private_key_passphrase || ""}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          inline_private_key_passphrase: event.target.value,
                          inline_private_key_passphrase_touched: true,
                        })
                      }
                      placeholder={
                        connection?.id && !form.inline_private_key_passphrase
                          ? t("connectionDialog.password.savedKeep")
                          : t("connectionDialog.privateKey.passphrasePlaceholder")
                      }
                    />
                    {allowPasswordReveal ? (
                      <button
                        className="field-toggle"
                        type="button"
                        disabled={revealBusy}
                        aria-label={showPassphrase ? t("connectionDialog.privateKey.hidePassphrase") : t("connectionDialog.privateKey.showPassphrase")}
                        onClick={() => void toggleInlinePassphraseVisibility()}
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
            ) : null}
          </>
        ) : null}

        {credentialMode === "saved" ? (
          <>
            <label>
              <span>{t("connectionDialog.field.credentialSource")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.credentialSource")}
                value={credentialMode}
                options={credentialModeOptions()}
                onChange={(credentialMode) =>
                  setForm({
                    ...form,
                    credential_mode: credentialMode,
                  })
                }
              />
            </label>
            <div className="credential-select-row">
              <label>
                <span>{t("connectionDialog.field.savedAccount")}</span>
                <AppSelect
                  ariaLabel={t("connectionDialog.field.savedAccount")}
                  value={form.credential_id || ""}
                  options={[
                    { label: t("connectionDialog.account.choose"), value: "" },
                    ...credentials.map((credential) => ({
                      label: `${credential.name}${credential.username ? `（${credential.username}）` : ""} · ${
                        credential.kind === "password" ? t("connectionDialog.account.passwordSuffix").trim().replace("· ", "") : t("connectionDialog.account.privateKeySuffix").trim().replace("· ", "")
                      }`,
                      value: credential.id,
                    })),
                  ]}
                  onChange={(credentialId) => setForm({ ...form, credential_id: credentialId })}
                />
              </label>
              <button
                className="settings-action-button credential-manage-button"
                type="button"
                onClick={onManageCredentials}
              >
                {t("connectionDialog.manage")}
              </button>
            </div>
          </>
        ) : null}

        {credentialMode === "prompt" ? (
          <>
            <label>
              <span>{t("connectionDialog.field.credentialSource")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.credentialSource")}
                value={credentialMode}
                options={credentialModeOptions()}
                onChange={(credentialMode) =>
                  setForm({
                    ...form,
                    credential_mode: credentialMode,
                  })
                }
              />
            </label>
            <p className="connection-dialog-note">
              {t("connectionDialog.promptAuthNote")}
            </p>
          </>
        ) : null}

        {/* 备注 */}
        <label>
          <span>{t("connectionDialog.field.notes")}</span>
          <textarea
            rows={3}
            value={form.notes || ""}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder={t("connectionDialog.notes.desktopPlaceholder")}
          />
        </label>
      </div>
    );
  }

  function renderProxyTab() {
    const proxy = form.proxy || defaultProxyConfig;
    const jump = form.jump || defaultJumpConfig;
    const networkPathMode: ConnectionNetworkPathMode =
      jump.kind === "ssh_jump" ? "ssh_jump" : proxy.kind === "none" ? "direct" : "proxy";
    const jumpCandidates = connections.filter((item) => item.id !== currentConnectionId && !jumpCandidateWouldCycle(item.id, currentConnectionId, connections));
    const jumpPlan = buildJumpPlanPreview(form, connections, currentConnectionId);

    return (
      <section className="dialog-section dialog-section-last">
        <div className="dialog-section-title">{t("connectionDialog.tab.network")}</div>

        <label>
          <span>{t("connectionDialog.field.connectionMethod")}</span>
          <AppSelect
            ariaLabel={t("connectionDialog.field.connectionMethod")}
            value={networkPathMode}
            options={networkPathOptions()}
            onChange={(mode) => {
              setForm({
                ...form,
                proxy:
                  mode === "proxy"
                    ? {
                        ...defaultProxyConfig,
                        kind: "http_connect",
                      }
                    : defaultProxyConfig,
                jump:
                  mode === "ssh_jump"
                    ? {
                        kind: "ssh_jump",
                        jump_connection_id: jumpCandidates[0]?.id || "",
                  }
                    : defaultJumpConfig,
              });
            }}
          />
        </label>

        {networkPathMode === "proxy" ? (
          <>
            <label>
              <span>{t("connectionDialog.field.proxyType")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.proxyType")}
                value={proxy.kind === "none" ? "http_connect" : proxy.kind}
                options={proxyKindOptions}
                onChange={(proxyKind) =>
                  setForm({
                    ...form,
                    proxy: {
                      ...defaultProxyConfig,
                      kind: proxyKind,
                    },
                    jump: defaultJumpConfig,
                  })
                }
              />
            </label>

            <div className="form-grid">
              <label>
                <span>{t("connectionDialog.field.proxyHost")}</span>
                <input
                  value={proxy.host || ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      proxy: { ...proxy, host: event.target.value },
                      jump: defaultJumpConfig,
                    })
                  }
                  placeholder="proxy.local"
                />
              </label>
              <label>
                <span>{t("connectionDialog.field.proxyPort")}</span>
                <input
                  inputMode="numeric"
                  value={(proxy.port || "").toString()}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      proxy: { ...proxy, port: Number(event.target.value) || undefined },
                      jump: defaultJumpConfig,
                    })
                  }
                  placeholder="1080"
                />
              </label>
            </div>

            <div className="form-grid form-grid-wide">
              <label>
                <span>{t("connectionDialog.field.proxyUsername")}</span>
                <input
                  {...usernameInputAttributes}
                  value={proxy.username || ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      proxy: { ...proxy, username: event.target.value },
                      jump: defaultJumpConfig,
                    })
                  }
                />
              </label>
              <label>
                <span>{t("connectionDialog.field.proxyPassword")}</span>
                <div className="input-with-toggle">
                  <input
                    type={showProxyPassword ? "text" : "password"}
                    value={proxy.password || ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        proxy: { ...proxy, password: event.target.value },
                        jump: defaultJumpConfig,
                      })
                    }
                  />
                  <button
                    className="field-toggle"
                    type="button"
                    aria-label={showProxyPassword ? t("connectionDialog.proxy.hidePassword") : t("connectionDialog.proxy.showPassword")}
                    onClick={() => setShowProxyPassword((value) => !value)}
                  >
                    {showProxyPassword ? (
                      <EyeOff className="ui-icon" aria-hidden="true" />
                    ) : (
                      <Eye className="ui-icon" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </label>
            </div>
          </>
        ) : null}

        {networkPathMode === "ssh_jump" ? (
          <>
            <label>
              <span>{t("connectionDialog.field.jumpConnection")}</span>
              <AppSelect
                ariaLabel={t("connectionDialog.field.jumpConnection")}
                value={jump.jump_connection_id || ""}
                options={[
                  { label: t("connectionDialog.jump.choose"), value: "" },
                  ...jumpCandidates.map((item) => ({
                    label: `${item.name} · ${item.username}@${item.host}:${item.port.toString()}`,
                    value: item.id,
                  })),
                ]}
                disabled={jumpCandidates.length === 0}
                onChange={(jumpConnectionId) =>
                  setForm({
                    ...form,
                    proxy: defaultProxyConfig,
                    jump: {
                      kind: "ssh_jump",
                      jump_connection_id: jumpConnectionId,
                    },
                  })
                }
              />
            </label>
            <p className={`connection-dialog-note ${jumpPlan.issue ? "form-error" : ""}`}>
              {jumpPlan.issue ? jumpPlan.issue.detail : t("connectionDialog.jump.path", { path: jumpPlan.labels.join(" → ") })}
            </p>
          </>
        ) : null}

        {networkPathMode === "direct" ? (
          <p className="connection-dialog-note">{t("connectionDialog.directNote")}</p>
        ) : null}
      </section>
    );
  }

  function renderRdpTab() {
    const rdp = withDefaultRdpConfig(form.rdp);
    const gatewayMode = rdp.gateway?.mode || "disabled";
    const runnerRenderMode: Exclude<RdpRenderMode, "custom"> =
      rdp.runner.render_mode === "external" || !platformCapabilities.supportsEmbeddedRdp
        ? "external"
        : "embedded";
    const fullScreenMode: RdpDisplayMode =
      rdp.display.mode === "windowed" ? "embedded" : rdp.display.mode;
    const resolutionMode = rdp.display.dynamic_resize ? "adaptive" : "fixed";
    const fixedResolution = resolutionMode === "fixed";

    return (
      <div className="connection-dialog-fields">
        <section className="dialog-section">
          <div className="dialog-section-title">显示</div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>打开方式</span>
              <AppSelect
                ariaLabel="RDP 打开方式"
                value={runnerRenderMode}
                options={rdpRunnerModeOptions}
                onChange={(renderMode) =>
                  updateRdp({
                    runner: {
                      ...rdp.runner,
                      render_mode: renderMode,
                      preferred_runner:
                        renderMode === "external" ? defaultRdpExternalRunner : undefined,
                      custom_executable: undefined,
                      custom_args_template: undefined,
                    },
                  })
                }
              />
            </label>
            <label>
              <span>全屏模式</span>
              <AppSelect
                ariaLabel="RDP 全屏模式"
                value={fullScreenMode}
                options={rdpDisplayOptions()}
                onChange={(mode) =>
                  updateRdp({
                    display: {
                      ...rdp.display,
                      mode,
                      use_multimon: mode === "all_monitors",
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>分辨率</span>
              <AppSelect
                ariaLabel="RDP 分辨率"
                value={resolutionMode}
                options={rdpResolutionModeOptions()}
                onChange={(mode) =>
                  updateRdp({
                    display: {
                      ...rdp.display,
                      dynamic_resize: mode === "adaptive",
                    },
                  })
                }
              />
            </label>
            {fixedResolution ? (
              <>
                <label>
                  <span>宽度</span>
                  <input
                    inputMode="numeric"
                    value={(rdp.display.width || "").toString()}
                    onChange={(event) =>
                      updateRdp({
                        display: {
                          ...rdp.display,
                          width: Number(event.target.value) || undefined,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <span>高度</span>
                  <input
                    inputMode="numeric"
                    value={(rdp.display.height || "").toString()}
                    onChange={(event) =>
                      updateRdp({
                        display: {
                          ...rdp.display,
                          height: Number(event.target.value) || undefined,
                        },
                      })
                    }
                  />
                </label>
              </>
            ) : null}
            <label>
              <span>缩放</span>
              <span className="connection-dialog-scale-check">
                <input type="checkbox" checked readOnly />
                <span>跟随系统</span>
              </span>
            </label>
          </div>
          {runnerRenderMode === "external" ? (
            <p className="connection-dialog-note connection-dialog-note-inline">
              {rdpExternalModeNote}
            </p>
          ) : null}
        </section>

        <section className="dialog-section">
          <div className="dialog-section-title">资源重定向</div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>音频</span>
              <AppSelect
                ariaLabel="RDP 音频"
                value={rdp.resources.audio}
                options={rdpAudioOptions()}
                onChange={(audio) =>
                  updateRdp({
                    resources: {
                      ...rdp.resources,
                      audio,
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="connection-dialog-checks">
            {[
              ["clipboard", "剪贴板"],
              ["drives", "磁盘"],
              ["printers", "打印机"],
              ["smart_cards", "智能卡"],
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(rdp.resources[key as keyof typeof rdp.resources])}
                  onChange={(event) =>
                    updateRdp({
                      resources: {
                        ...rdp.resources,
                        [key]: event.target.checked,
                      },
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="dialog-section">
          <div className="dialog-section-title">网关与 RemoteApp</div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>网关</span>
              <AppSelect
                ariaLabel="RDP 网关"
                value={gatewayMode}
                options={rdpGatewayOptions()}
                onChange={(mode) =>
                  updateRdp({
                    gateway:
                      mode === "disabled"
                        ? { ...defaultRdpConfig.gateway!, mode: "disabled" }
                        : {
                            ...(rdp.gateway || defaultRdpConfig.gateway!),
                            mode,
                          },
                  })
                }
              />
            </label>
            <label>
              <span>网关主机</span>
              <input
                disabled={gatewayMode === "disabled"}
                value={rdp.gateway?.host || ""}
                onChange={(event) =>
                  updateRdp({
                    gateway: {
                      ...(rdp.gateway || defaultRdpConfig.gateway!),
                      mode: gatewayMode === "disabled" ? "explicit" : gatewayMode,
                      host: event.target.value,
                    },
                  })
                }
                placeholder="gateway.example.com"
              />
            </label>
          </div>

          <div className="connection-dialog-checks">
            <label>
              <input
                type="checkbox"
                checked={rdp.remote_app.enabled}
                onChange={(event) =>
                  updateRdp({
                    remote_app: {
                      ...rdp.remote_app,
                      enabled: event.target.checked,
                    },
                  })
                }
              />
              <span>RemoteApp</span>
            </label>
          </div>
          {rdp.remote_app.enabled ? (
            <div className="form-grid form-grid-wide">
              <label>
                <span>程序</span>
                <input
                  value={rdp.remote_app.program || ""}
                  onChange={(event) =>
                    updateRdp({
                      remote_app: {
                        ...rdp.remote_app,
                        program: event.target.value,
                      },
                    })
                  }
                  placeholder="RemoteApp 名称或程序路径"
                />
              </label>
              <label>
                <span>参数</span>
                <input
                  value={rdp.remote_app.args || ""}
                  onChange={(event) =>
                    updateRdp({
                      remote_app: {
                        ...rdp.remote_app,
                        args: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
          ) : null}
        </section>

      </div>
    );
  }

  function renderVncTab() {
    const vnc = withDefaultVncConfig(form.vnc);
    const renderMode = vnc.runner.render_mode;

    return (
      <div className="connection-dialog-fields">
        <section className="dialog-section">
          <div className="dialog-section-title">显示</div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>打开方式</span>
              <AppSelect
                ariaLabel="VNC 打开方式"
                value={renderMode}
                options={vncRunnerModeOptions()}
                onChange={(nextRenderMode) =>
                  updateVnc({
                    runner: {
                      ...vnc.runner,
                      render_mode: nextRenderMode,
                      preferred_runner:
                        nextRenderMode === "embedded" || nextRenderMode === "windowed"
                          ? "novnc"
                          : "vncviewer",
                      custom_executable:
                        nextRenderMode === "custom" ? vnc.runner.custom_executable || "" : "",
                      custom_args_template:
                        nextRenderMode === "custom" ? vnc.runner.custom_args_template || "" : "",
                    },
                  })
                }
              />
            </label>
            <label>
              <span>缩放模式</span>
              <AppSelect
                ariaLabel="VNC 缩放模式"
                value={vnc.display.scale_mode}
                options={vncScaleModeOptions()}
                onChange={(scaleMode) =>
                  updateVnc({
                    display: {
                      ...vnc.display,
                      scale_mode: scaleMode,
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="connection-dialog-checks">
            <label>
              <input
                type="checkbox"
                checked={vnc.display.resize_session}
                onChange={(event) =>
                  updateVnc({
                    display: {
                      ...vnc.display,
                      resize_session: event.target.checked,
                    },
                  })
                }
              />
              <span>请求远端分辨率跟随窗口</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={vnc.display.clip_viewport}
                onChange={(event) =>
                  updateVnc({
                    display: {
                      ...vnc.display,
                      clip_viewport: event.target.checked,
                    },
                  })
                }
              />
              <span>裁剪视口</span>
            </label>
          </div>
        </section>

        <section className="dialog-section">
          <div className="dialog-section-title">输入</div>
          <div className="connection-dialog-checks">
            <label>
              <input
                type="checkbox"
                checked={vnc.input.shared}
                onChange={(event) =>
                  updateVnc({
                    input: {
                      ...vnc.input,
                      shared: event.target.checked,
                    },
                  })
                }
              />
              <span>共享会话</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={vnc.input.clipboard}
                onChange={(event) =>
                  updateVnc({
                    input: {
                      ...vnc.input,
                      clipboard: event.target.checked,
                    },
                  })
                }
              />
              <span>剪贴板</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={vnc.input.view_only}
                onChange={(event) =>
                  updateVnc({
                    input: {
                      ...vnc.input,
                      view_only: event.target.checked,
                    },
                  })
                }
              />
              <span>只看不控</span>
            </label>
          </div>
        </section>

        <section className="dialog-section">
          <div className="dialog-section-title">性能</div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>预设</span>
              <AppSelect
                ariaLabel="VNC 性能预设"
                value={vnc.performance.preset}
                options={vncPerformanceOptions()}
                onChange={(preset) => {
                  const presetDefaults = vncPerformancePresetDefaults[preset];
                  updateVnc({
                    performance: {
                      ...vnc.performance,
                      preset,
                      quality_level: presetDefaults.quality_level,
                      compression_level: presetDefaults.compression_level,
                    },
                  });
                }}
              />
            </label>
            <label>
              <span>质量等级</span>
              <input
                inputMode="numeric"
                min={0}
                max={9}
                value={(
                  vnc.performance.quality_level ??
                  vncPerformancePresetDefaults[vnc.performance.preset].quality_level
                ).toString()}
                onChange={(event) =>
                  updateVnc({
                    performance: {
                      ...vnc.performance,
                      quality_level: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </label>
            <label>
              <span>压缩等级</span>
              <input
                inputMode="numeric"
                min={0}
                max={9}
                value={(
                  vnc.performance.compression_level ??
                  vncPerformancePresetDefaults[vnc.performance.preset].compression_level
                ).toString()}
                onChange={(event) =>
                  updateVnc({
                    performance: {
                      ...vnc.performance,
                      compression_level: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </label>
          </div>
        </section>

        <section className="dialog-section dialog-section-last">
          <div className="dialog-section-title">Runner</div>
          {renderMode === "custom" ? (
            <div className="form-grid form-grid-wide">
              <label>
                <span>客户端路径</span>
                <input
                  value={vnc.runner.custom_executable || ""}
                  onChange={(event) =>
                    updateVnc({
                      runner: {
                        ...vnc.runner,
                        custom_executable: event.target.value,
                      },
                    })
                  }
                  placeholder="vncviewer.exe"
                />
              </label>
              <label>
                <span>参数模板</span>
                <input
                  value={vnc.runner.custom_args_template || ""}
                  onChange={(event) =>
                    updateVnc({
                      runner: {
                        ...vnc.runner,
                        custom_args_template: event.target.value,
                      },
                    })
                  }
                  placeholder="{target}"
                />
              </label>
            </div>
          ) : null}
          <label>
            <span>附加 runner 参数</span>
            <textarea
              rows={3}
              value={vnc.raw_runner_args || ""}
              onChange={(event) => updateVnc({ raw_runner_args: event.target.value })}
              placeholder="仅用于外部 viewer，不要写入 password/passwd 参数"
            />
          </label>
          <p className="connection-dialog-note">
            内嵌和 RDP 窗口模式使用 noVNC 与 MXterm 本地桥接；外部 viewer 不会接收保存的密码。
          </p>
        </section>
      </div>
    );
  }

  function renderAdvancedTab() {
    if (isVnc) {
      return (
        <section className="dialog-section dialog-section-last">
          <div className="dialog-section-title">高级</div>
          <p className="connection-dialog-note">
            VNC v1 不使用 SSH 代理、跳板机或终端编码；显示、输入、性能和 runner 设置请在 VNC 页调整。
          </p>
        </section>
      );
    }

    if (isRdp) {
      const rdp = withDefaultRdpConfig(form.rdp);
      return (
        <section className="dialog-section dialog-section-last">
          <div className="dialog-section-title">性能与安全</div>
          <div className="form-grid form-grid-wide">
            <label>
              <span>性能预设</span>
              <AppSelect
                ariaLabel="RDP 性能预设"
                value={rdp.performance.preset}
                options={rdpPerformanceOptions()}
                onChange={(preset) =>
                  updateRdp({
                    performance: {
                      ...rdp.performance,
                      preset,
                    },
                  })
                }
              />
            </label>
          </div>
          <p className="connection-dialog-note">
            RDP 登录账号与密码在基础页配置；高级安全项只控制 NLA 与证书策略。
          </p>
          <div className="form-grid form-grid-wide">
            <label>
              <span>NLA</span>
              <AppSelect
                ariaLabel="RDP NLA"
                value={rdp.security.nla}
                options={rdpNlaOptions()}
                onChange={(nla) =>
                  updateRdp({
                    security: {
                      ...rdp.security,
                      nla,
                    },
                  })
                }
              />
            </label>
            <label>
              <span>证书策略</span>
              <AppSelect
                ariaLabel="RDP 证书策略"
                value={rdp.security.certificate_policy}
                options={rdpCertificateOptions()}
                onChange={(certificatePolicy) =>
                  updateRdp({
                    security: {
                      ...rdp.security,
                      certificate_policy: certificatePolicy,
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="connection-dialog-checks">
            {[
              ["desktop_background", "桌面背景"],
              ["font_smoothing", "字体平滑"],
              ["visual_styles", "视觉样式"],
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(rdp.performance[key as keyof typeof rdp.performance])}
                  onChange={(event) =>
                    updateRdp({
                      performance: {
                        ...rdp.performance,
                        [key]: event.target.checked,
                      },
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <label>
            <span>原始 .rdp 设置</span>
            <textarea
              rows={4}
              value={rdp.raw_rdp_settings || ""}
              onChange={(event) => updateRdp({ raw_rdp_settings: event.target.value })}
              placeholder="每行形如 key:type:value，不要写入 password 字段"
            />
          </label>
        </section>
      );
    }

    const advanced = form.advanced || defaultAdvancedConfig;
    return (
      <section className="dialog-section dialog-section-last">
        <div className="dialog-section-title">高级</div>
        <div className="form-grid form-grid-wide">
          <label>
            <span>连接超时（毫秒）</span>
            <input
              inputMode="numeric"
              value={advanced.connect_timeout_ms.toString()}
              onChange={(event) =>
                setForm({
                  ...form,
                  advanced: {
                    ...advanced,
                    connect_timeout_ms: Number(event.target.value) || 30_000,
                  },
                })
              }
            />
          </label>
          <label>
            <span>认证超时（毫秒）</span>
            <input
              inputMode="numeric"
              value={advanced.auth_timeout_ms.toString()}
              onChange={(event) =>
                setForm({
                  ...form,
                  advanced: {
                    ...advanced,
                    auth_timeout_ms: Number(event.target.value) || 45_000,
                  },
                })
              }
            />
          </label>
        </div>
        <div className="form-grid form-grid-wide">
          <label>
            <span>心跳间隔（毫秒）</span>
            <input
              inputMode="numeric"
              value={advanced.keepalive_interval_ms.toString()}
              onChange={(event) =>
                setForm({
                  ...form,
                  advanced: {
                    ...advanced,
                    keepalive_interval_ms: Number(event.target.value) || 20_000,
                  },
                })
              }
            />
          </label>
          <label>
            <span>终端显示编码</span>
            <AppSelect
              ariaLabel="终端显示编码"
              value={normalizeTerminalEncoding(advanced.terminal_encoding)}
              options={terminalEncodingOptions}
              onChange={(terminalEncoding) =>
                setForm({
                  ...form,
                  advanced: {
                    ...advanced,
                    terminal_encoding: terminalEncoding as ConnectionTerminalEncoding,
                  },
                })
              }
            />
          </label>
        </div>
        <div className="connection-dialog-checks">
          <label>
            <input
              type="checkbox"
              checked={advanced.x11_forwarding}
              onChange={(event) =>
                setForm({ ...form, advanced: { ...advanced, x11_forwarding: event.target.checked } })
              }
            />
            <span>{t("connection.x11.enable")}</span>
          </label>
        </div>
        {advanced.x11_forwarding ? (
          <>
            <label>
              <span>{t("connection.x11.display")}</span>
              <input
                value={advanced.x11_display || ""}
                onChange={(event) =>
                  setForm({ ...form, advanced: { ...advanced, x11_display: event.target.value } })
                }
                placeholder={t("connection.x11.displayPlaceholder")}
              />
            </label>
            <p className="connection-dialog-note">
              {t(desktopPlatform === "windows" ? "connection.x11.windows" : desktopPlatform === "macos" ? "connection.x11.macos" : desktopPlatform === "linux" ? "connection.x11.linux" : "connection.x11.unknown")}
            </p>
          </>
        ) : null}
      </section>
    );
  }

  function changeProtocol(nextProtocol: ConnectionProtocol) {
    if (nextProtocol === protocol) {
      return;
    }
    setFeedback(null);
    setTestState("idle");
    setActiveTab("basic");
    setForm((current) => {
      const serialEndpoint = usesSerialEndpoint(current);
      if (nextProtocol === "rdp") {
        return {
          ...current,
          protocol: "rdp",
          host: serialEndpoint ? "" : current.host,
          port: serialEndpoint
            ? protocolDefaultPorts.rdp
            : current.port === protocolDefaultPorts.ssh
              ? protocolDefaultPorts.rdp
              : current.port,
          credential_mode: current.credential_mode || "inline",
          credential_id: current.credential_mode === "saved" ? current.credential_id || "" : "",
          inline_auth_kind: "password",
          inline_password: current.credential_mode === "inline" ? current.inline_password || "" : "",
          inline_password_touched:
            current.credential_mode === "inline" ? current.inline_password_touched || false : false,
          inline_private_key_path: "",
          inline_private_key_passphrase: "",
          inline_private_key_passphrase_touched: false,
          prompt_auth_kind: undefined,
          proxy: defaultProxyConfig,
          jump: defaultJumpConfig,
          advanced: defaultAdvancedConfig,
          rdp: withDefaultRdpConfig(current.rdp),
          vnc: withDefaultVncConfig(current.vnc),
        };
      }

      if (nextProtocol === "vnc") {
        return {
          ...current,
          protocol: "vnc",
          host: serialEndpoint ? "" : current.host,
          port: serialEndpoint
            ? protocolDefaultPorts.vnc
            : current.port === protocolDefaultPorts.ssh || current.port === protocolDefaultPorts.rdp
              ? protocolDefaultPorts.vnc
              : current.port,
          credential_mode: current.credential_mode || "inline",
          credential_id: current.credential_mode === "saved" ? current.credential_id || "" : "",
          inline_auth_kind: "password",
          inline_password: current.credential_mode === "inline" ? current.inline_password || "" : "",
          inline_password_touched:
            current.credential_mode === "inline" ? current.inline_password_touched || false : false,
          inline_private_key_path: "",
          inline_private_key_passphrase: "",
          inline_private_key_passphrase_touched: false,
          prompt_auth_kind: undefined,
          proxy: defaultProxyConfig,
          jump: defaultJumpConfig,
          advanced: defaultAdvancedConfig,
          rdp: withDefaultRdpConfig(current.rdp),
          vnc: withDefaultVncConfig(current.vnc),
        };
      }

      if (nextProtocol === "telnet") {
        return {
          ...current,
          protocol: "telnet",
          host: serialEndpoint ? "" : current.host,
          port: serialEndpoint
            ? protocolDefaultPorts.telnet
            : current.port === protocolDefaultPorts.ssh ||
                current.port === protocolDefaultPorts.rdp ||
                current.port === protocolDefaultPorts.vnc
              ? protocolDefaultPorts.telnet
              : current.port,
          username: "",
          credential_mode: "prompt",
          credential_id: "",
          inline_auth_kind: undefined,
          inline_password: "",
          inline_password_touched: false,
          inline_private_key_path: "",
          inline_private_key_passphrase: "",
          inline_private_key_passphrase_touched: false,
          prompt_auth_kind: undefined,
          proxy: defaultProxyConfig,
          jump: defaultJumpConfig,
          advanced: defaultAdvancedConfig,
          rdp: withDefaultRdpConfig(current.rdp),
          vnc: withDefaultVncConfig(current.vnc),
          telnet: withDefaultTelnetConfig(current.telnet),
          serial: withDefaultSerialConfig(current.serial),
        };
      }

      if (nextProtocol === "serial") {
        const serial = withDefaultSerialConfig(current.serial);
        return {
          ...current,
          protocol: "serial",
          host: serial.port_name || current.host,
          port: 1,
          username: "",
          credential_mode: "prompt",
          credential_id: "",
          inline_auth_kind: undefined,
          inline_password: "",
          inline_password_touched: false,
          inline_private_key_path: "",
          inline_private_key_passphrase: "",
          inline_private_key_passphrase_touched: false,
          prompt_auth_kind: undefined,
          proxy: defaultProxyConfig,
          jump: defaultJumpConfig,
          advanced: defaultAdvancedConfig,
          rdp: withDefaultRdpConfig(current.rdp),
          vnc: withDefaultVncConfig(current.vnc),
          telnet: withDefaultTelnetConfig(current.telnet),
          serial,
        };
      }

      return {
        ...current,
        protocol: "ssh",
        host: serialEndpoint ? "" : current.host,
        port: serialEndpoint
          ? protocolDefaultPorts.ssh
          : current.port === protocolDefaultPorts.rdp ||
              current.port === protocolDefaultPorts.vnc ||
              current.port === protocolDefaultPorts.telnet ||
              current.port === protocolDefaultPorts.serial
            ? protocolDefaultPorts.ssh
            : current.port,
        credential_mode:
          current.credential_mode === "prompt" ? "inline" : current.credential_mode,
        inline_auth_kind: current.inline_auth_kind || "password",
        proxy: current.proxy || defaultProxyConfig,
        jump: current.jump || defaultJumpConfig,
        advanced: current.advanced || defaultAdvancedConfig,
      };
    });
  }

  function updateRdp(patch: Partial<RdpConnectionConfig>) {
    setForm((current) => ({
      ...current,
      rdp: withDefaultRdpConfig({
        ...withDefaultRdpConfig(current.rdp),
        ...patch,
      }),
    }));
  }

  function updateVnc(patch: Partial<VncConnectionConfig>) {
    setForm((current) => ({
      ...current,
      vnc: withDefaultVncConfig({
        ...withDefaultVncConfig(current.vnc),
        ...patch,
      }),
    }));
  }

  function changeInlineAuthKind(authKind: ConnectionAuthKind) {
    setForm(
      authKind === "password"
        ? {
            ...form,
            inline_auth_kind: "password",
            inline_password_touched: true,
            inline_private_key_path: "",
            inline_private_key_passphrase: "",
            inline_private_key_passphrase_touched: false,
          }
        : {
            ...form,
            inline_auth_kind: "private_key",
            inline_password: "",
            inline_password_touched: false,
            inline_private_key_passphrase_touched: false,
          },
    );
  }

  async function toggleInlinePasswordVisibility() {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    if (!form.inline_password && connection?.id) {
      await revealInlineSecret("password");
      return;
    }
    setShowPassword(true);
  }

  async function toggleInlinePassphraseVisibility() {
    if (showPassphrase) {
      setShowPassphrase(false);
      return;
    }
    if (!form.inline_private_key_passphrase && connection?.id) {
      await revealInlineSecret("private_key");
      return;
    }
    setShowPassphrase(true);
  }

  async function revealInlineSecret(authKind: ConnectionAuthKind) {
    if (!connection?.id) {
      return;
    }
    setRevealBusy(true);
    setFeedback(null);
    try {
      const secret = await connectionRevealInlineSecret(connection.id);
      if (secret.auth_kind !== authKind) {
        return;
      }
      if (authKind === "password") {
        setForm((current) => ({
          ...current,
          inline_password: secret.password || "",
          inline_password_touched: false,
        }));
        setShowPassword(true);
      } else {
        setForm((current) => ({
          ...current,
          inline_private_key_passphrase: secret.private_key_passphrase || "",
          inline_private_key_passphrase_touched: false,
        }));
        setShowPassphrase(true);
      }
    } catch (nextError) {
      setTestState("error");
      setFeedback(describeDialogError(nextError));
    } finally {
      setRevealBusy(false);
    }
  }
}

function formFromConnection(
  connection: ConnectionProfile,
  _groups: ConnectionDialogGroup[] = [],
): ConnectionProfileInput {
  const credentialMode = connection.credential_mode || "inline";
  const legacyAuthKind =
    connection.auth_kind ||
    (connection.private_key_path ? "private_key" : "password");
  const inlineAuthKind = connection.inline_auth_kind || legacyAuthKind;

  return {
    id: connection.id,
    protocol: connection.protocol || "ssh",
    name: connection.name,
    group_id: connection.group_id || "",
    host: connection.host,
    port: connection.port,
    username: connection.username,
    credential_mode: credentialMode,
    credential_id: connection.credential_id || "",
    inline_auth_kind: inlineAuthKind,
    inline_password: "",
    inline_password_touched: false,
    inline_private_key_path:
      connection.inline_private_key_path || connection.private_key_path || "",
    inline_private_key_passphrase: "",
    inline_private_key_passphrase_touched: false,
    prompt_auth_kind: connection.prompt_auth_kind || inlineAuthKind || "password",
    jump: connection.jump || defaultJumpConfig,
    proxy: {
      ...defaultProxyConfig,
      ...connection.proxy,
    },
    advanced: {
      ...defaultAdvancedConfig,
      ...connection.advanced,
    },
    rdp: withDefaultRdpConfig(connection.rdp),
    vnc: withDefaultVncConfig(connection.vnc),
    telnet: withDefaultTelnetConfig(connection.telnet),
    serial: withDefaultSerialConfig(connection.serial),
    notes: connection.notes || "",
    is_favorite: connection.is_favorite,
    last_connected_at: connection.last_connected_at || "",
    remote_os_id: connection.remote_os_id || "",
    remote_os_name: connection.remote_os_name || "",
    remote_os_version: connection.remote_os_version || "",
  };
}

function duplicateFormFromConnection(
  connection: ConnectionProfile,
  connections: ConnectionProfile[],
  _groups: ConnectionDialogGroup[] = [],
): ConnectionProfileInput {
  return {
    ...formFromConnection(connection, _groups),
    id: undefined,
    source_connection_id: connection.id,
    name: nextDuplicateConnectionName(connection.name, connections),
    is_favorite: false,
    last_connected_at: undefined,
    remote_os_id: undefined,
    remote_os_name: undefined,
    remote_os_version: undefined,
  };
}

function nextDuplicateConnectionName(name: string, connections: ConnectionProfile[]) {
  const names = new Set(connections.map((connection) => connection.name.trim().toLocaleLowerCase()));
  const baseName = `${name.trim()} - 副本`;
  if (!names.has(baseName.toLocaleLowerCase())) {
    return baseName;
  }
  let suffix = 2;
  while (names.has(`${baseName} (${suffix.toString()})`.toLocaleLowerCase())) {
    suffix += 1;
  }
  return `${baseName} (${suffix.toString()})`;
}

function normalizeForSubmit(
  form: ConnectionProfileInput,
  credentials: CredentialProfile[],
): ConnectionProfileInput {
  if ((form.protocol || "ssh") === "rdp") {
    const savedCredential =
      form.credential_mode === "saved" && form.credential_id
        ? credentials.find((credential) => credential.id === form.credential_id)
        : null;
    const credentialMode = form.credential_mode || "prompt";

    return {
      ...form,
      protocol: "rdp",
      username:
        credentialMode === "saved" ? savedCredential?.username || form.username : form.username,
      port: Number(form.port) || 3389,
      credential_mode: credentialMode,
      credential_id: credentialMode === "saved" ? form.credential_id?.trim() || "" : undefined,
      inline_auth_kind: credentialMode === "inline" ? "password" : undefined,
      inline_password: credentialMode === "inline" ? form.inline_password : undefined,
      inline_password_touched:
        credentialMode === "inline" ? form.inline_password_touched || false : false,
      inline_private_key_path: undefined,
      inline_private_key_passphrase: undefined,
      inline_private_key_passphrase_touched: false,
      prompt_auth_kind: undefined,
      proxy: { kind: "none" },
      jump: { kind: "none" },
      advanced: defaultAdvancedConfig,
      rdp: withDefaultRdpConfig(form.rdp),
      vnc: undefined,
      telnet: undefined,
      serial: undefined,
    };
  }

  if ((form.protocol || "ssh") === "vnc") {
    const savedCredential =
      form.credential_mode === "saved" && form.credential_id
        ? credentials.find((credential) => credential.id === form.credential_id)
        : null;
    const credentialMode = form.credential_mode || "prompt";

    return {
      ...form,
      protocol: "vnc",
      username:
        credentialMode === "saved" ? savedCredential?.username || form.username : form.username,
      port: Number(form.port) || 5900,
      credential_mode: credentialMode,
      credential_id: credentialMode === "saved" ? form.credential_id?.trim() || "" : undefined,
      inline_auth_kind: credentialMode === "inline" ? "password" : undefined,
      inline_password: credentialMode === "inline" ? form.inline_password : undefined,
      inline_password_touched:
        credentialMode === "inline" ? form.inline_password_touched || false : false,
      inline_private_key_path: undefined,
      inline_private_key_passphrase: undefined,
      inline_private_key_passphrase_touched: false,
      prompt_auth_kind: undefined,
      proxy: { kind: "none" },
      jump: { kind: "none" },
      advanced: defaultAdvancedConfig,
      rdp: undefined,
      vnc: withDefaultVncConfig(form.vnc),
      telnet: undefined,
      serial: undefined,
    };
  }

  if ((form.protocol || "ssh") === "telnet") {
    return {
      ...form,
      protocol: "telnet",
      username: "",
      port: Number(form.port) || 23,
      credential_mode: "prompt",
      credential_id: undefined,
      inline_auth_kind: undefined,
      inline_password: undefined,
      inline_password_touched: false,
      inline_private_key_path: undefined,
      inline_private_key_passphrase: undefined,
      inline_private_key_passphrase_touched: false,
      prompt_auth_kind: undefined,
      proxy: { kind: "none" },
      jump: { kind: "none" },
      advanced: defaultAdvancedConfig,
      rdp: undefined,
      vnc: undefined,
      telnet: withDefaultTelnetConfig(form.telnet),
      serial: undefined,
    };
  }

  if ((form.protocol || "ssh") === "serial") {
    const serial = withDefaultSerialConfig(form.serial);
    const portName = serial.port_name || form.host;
    return {
      ...form,
      protocol: "serial",
      host: portName,
      port: 1,
      username: "",
      credential_mode: "prompt",
      credential_id: undefined,
      inline_auth_kind: undefined,
      inline_password: undefined,
      inline_password_touched: false,
      inline_private_key_path: undefined,
      inline_private_key_passphrase: undefined,
      inline_private_key_passphrase_touched: false,
      prompt_auth_kind: undefined,
      proxy: { kind: "none" },
      jump: { kind: "none" },
      advanced: defaultAdvancedConfig,
      rdp: undefined,
      vnc: undefined,
      telnet: undefined,
      serial: {
        ...serial,
        port_name: portName,
      },
    };
  }

  const jump = form.jump || defaultJumpConfig;
  const proxy = form.proxy || defaultProxyConfig;
  const savedUsername =
    form.credential_mode === "saved" && form.credential_id
      ? credentials.find((credential) => credential.id === form.credential_id)?.username || ""
      : "";

  return {
    ...form,
    protocol: "ssh",
    // saved 模式：用户名从所选账号回填，保证连接快照完整且后端校验通过
    username: form.credential_mode === "saved" ? savedUsername : form.username,
    port: Number(form.port) || 22,
    proxy:
      jump.kind === "ssh_jump" || proxy.kind === "none"
        ? { kind: "none" }
        : {
            ...proxy,
            port: Number(proxy.port) || undefined,
          },
    jump:
      jump.kind === "ssh_jump"
        ? {
            kind: "ssh_jump",
            jump_connection_id: jump.jump_connection_id?.trim() || "",
          }
        : { kind: "none" },
    advanced: {
      auth_timeout_ms:
        Number(form.advanced.auth_timeout_ms) || defaultAdvancedConfig.auth_timeout_ms,
      connect_timeout_ms:
        Number(form.advanced.connect_timeout_ms) ||
        defaultAdvancedConfig.connect_timeout_ms,
      keepalive_interval_ms:
        Number(form.advanced.keepalive_interval_ms) ||
        defaultAdvancedConfig.keepalive_interval_ms,
      terminal_encoding: normalizeTerminalEncoding(form.advanced.terminal_encoding),
      x11_forwarding: Boolean(form.advanced.x11_forwarding),
      x11_display: form.advanced.x11_display?.trim() || undefined,
    },
    rdp: undefined,
    vnc: undefined,
    telnet: undefined,
    serial: undefined,
  };
}

function buildGroupOptions(groups: ConnectionDialogGroup[], _currentGroup: string): GroupOption[] {
  return canonicalGroupOptions(groups.map((group) => ({ ...group, parentId: group.parentId || null })));
}

function withDefaultRdpConfig(value?: RdpConnectionConfig | null): RdpConnectionConfig {
  return {
    ...defaultRdpConfig,
    ...value,
    display: {
      ...defaultRdpConfig.display,
      ...value?.display,
    },
    resources: {
      ...defaultRdpConfig.resources,
      ...value?.resources,
    },
    gateway: {
      ...defaultRdpConfig.gateway!,
      ...value?.gateway,
    },
    remote_app: {
      ...defaultRdpConfig.remote_app,
      ...value?.remote_app,
    },
    performance: {
      ...defaultRdpConfig.performance,
      ...value?.performance,
    },
    security: {
      ...defaultRdpConfig.security,
      ...value?.security,
    },
    runner: {
      ...defaultRdpConfig.runner,
      ...value?.runner,
    },
  };
}

function withDefaultVncConfig(value?: VncConnectionConfig | null): VncConnectionConfig {
  return {
    ...defaultVncConfig,
    ...value,
    display: {
      ...defaultVncConfig.display,
      ...value?.display,
    },
    input: {
      ...defaultVncConfig.input,
      ...value?.input,
    },
    performance: {
      ...defaultVncConfig.performance,
      ...value?.performance,
    },
    security: {
      ...defaultVncConfig.security,
      ...value?.security,
    },
    runner: {
      ...defaultVncConfig.runner,
      ...value?.runner,
    },
  };
}

function withDefaultTelnetConfig(value?: ConnectionProfileInput["telnet"]): NonNullable<ConnectionProfileInput["telnet"]> {
  return {
    ...defaultTelnetConfig,
    ...value,
  };
}

function withDefaultSerialConfig(value?: SerialConnectionConfig | null): SerialConnectionConfig {
  return {
    ...defaultSerialConfig,
    ...value,
    baud_rate: Number(value?.baud_rate) || defaultSerialConfig.baud_rate,
    port_name: value?.port_name || "",
  };
}

function usesSerialEndpoint(form: ConnectionProfileInput): boolean {
  const serial = withDefaultSerialConfig(form.serial);
  return (
    (form.protocol || "ssh") === "serial" ||
    (form.port === protocolDefaultPorts.serial && Boolean(serial.port_name) && form.host === serial.port_name)
  );
}

function tabForError(error: unknown): ConnectionDialogTab {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  if (code.startsWith("connection_proxy_") || code.startsWith("connection_jump_")) {
    return "proxy";
  }
  if (code.startsWith("rdp_raw_") || code.startsWith("rdp_runner_")) {
    return "advanced";
  }
  if (code.startsWith("rdp_")) {
    return "rdp";
  }
  if (code.startsWith("vnc_")) {
    return "vnc";
  }
  if (
    code === "connection_connect_timeout_invalid" ||
    code === "connection_auth_timeout_invalid" ||
    code === "connection_keepalive_invalid" ||
    code === "connection_terminal_encoding_invalid"
  ) {
    return "advanced";
  }
  return "basic";
}

function describeHostKeyFeedback(error: ParsedHostKeyError): DialogFeedback {
  if (error.decision === "changed") {
    return {
      detail: "检测到主机 SSH 指纹已变化。若非预期的重装或换密钥，请谨慎处理。",
      hostKey: error.hostKey,
      hostKeyDecision: error.decision,
      oldHostKeyFingerprint: error.oldFingerprint,
      title: "主机密钥已变化，连接已阻断",
    };
  }

  return {
    detail: "首次连接该主机，需要确认主机密钥。核对指纹无误后再信任并继续测试。",
    hostKey: error.hostKey,
    hostKeyDecision: error.decision,
    oldHostKeyFingerprint: null,
    title: "首次连接该主机，需要确认主机密钥",
  };
}

function describeDialogError(error: unknown): DialogFeedback {
  const code = errorCode(error);
  // raw_message 仅作展示用的底层原因，不参与判定；缺失时退回诊断 ID。
  const rawMessage = errorRawMessage(error) || diagnosticHint(error);
  const networkKind = connectionNetworkKind(code);

  if (networkKind === "timeout") {
    return {
      title: "连接超时",
      detail: "在限定时间内无法连接到目标主机，请检查 IP、端口、防火墙、代理或网络连通性。",
      rawMessage,
    };
  }

  if (networkKind === "refused") {
    return {
      title: "端口无法连接",
      detail: "目标主机拒绝了连接，请确认 SSH 服务已启动、端口正确，或安全组允许访问。",
      rawMessage,
    };
  }

  if (networkKind === "unreachable") {
    return {
      title: "主机不可达",
      detail: "本机到目标主机没有可用路由，请检查 VPN、网段、网关或代理配置。",
      rawMessage,
    };
  }

  if (networkKind === "reset") {
    return {
      title: "连接被重置",
      detail: "连接被对端重置，请检查 SSH 服务策略、代理链路或中间防火墙。",
      rawMessage,
    };
  }

  if (code.includes("auth")) {
    return {
      title: "认证失败",
      detail: "请检查账号的用户名、密码或私钥是否匹配服务器配置。",
      rawMessage,
    };
  }

  if (code.startsWith("proxy_") || code.includes("proxy")) {
    return {
      title: "代理连接失败",
      detail: "请检查代理类型、代理地址端口以及代理用户名密码。",
      rawMessage,
    };
  }

  return {
    title: formatError(error),
    detail: "请根据提示调整配置后重试。",
    rawMessage,
  };
}

function formatAddress(connection: ConnectionProfileInput) {
  const username = connection.username || "user";
  const host = connection.host || "host";
  const protocol = connection.protocol || "ssh";
  if (protocol === "rdp") {
    return `RDP ${username}@${host}:${connection.port.toString()}`;
  }
  if (protocol === "vnc") {
    return `VNC ${username}@${host}:${connection.port.toString()}`;
  }
  if (protocol === "telnet") {
    return `Telnet ${host}:${connection.port.toString()}`;
  }
  if (protocol === "serial") {
    return `串口 ${connection.serial?.port_name || host}`;
  }
  return `${username}@${host}:${connection.port.toString()}`;
}

function formatError(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return String(error);
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

function errorRawMessage(error: unknown) {
  return typeof error === "object" && error !== null && "raw_message" in error
    ? normalizeErrorText((error as { raw_message: unknown }).raw_message)
    : "";
}

/** raw_message 缺失时的兜底线索：诊断 ID 能对上内部日志，比丢掉全部上下文好。 */
function diagnosticHint(error: unknown) {
  const diagnosticId = errorDiagnosticId(error);
  return diagnosticId ? `诊断 ID：${diagnosticId}` : "";
}

function normalizeErrorText(value: unknown) {
  return String(value ?? "")
    .replace(/^Error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
