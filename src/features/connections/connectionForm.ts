import { normalizeRloginInput } from "./rloginProfile";
import { t as tr } from "../../shared/i18n";
import type { ConnectionProfile, ConnectionProfileInput, CredentialProfile, RdpConnectionConfig, SerialConnectionConfig, VncConnectionConfig } from "./connectionTypes";
import { defaultAdvancedConfig, defaultJumpConfig, defaultProxyConfig, defaultRdpConfig, defaultVncConfig, defaultTelnetConfig, defaultSerialConfig, normalizeTerminalEncoding } from "./connectionTypes";
export interface ConnectionDialogGroup { id: string; name: string; parentId?: string | null; }

export function formFromConnection(
  connection: ConnectionProfile,
  _groups: ConnectionDialogGroup[] = [],
): ConnectionProfileInput {
  if (connection.protocol === "rlogin") return normalizeRloginInput(connection);
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
export function duplicateFormFromConnection(
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
  const baseName = tr("connectionDialog.duplicateSuffix", { name: name.trim() });
  if (!names.has(baseName.toLocaleLowerCase())) {
    return baseName;
  }
  let suffix = 2;
  while (names.has(`${baseName} (${suffix.toString()})`.toLocaleLowerCase())) {
    suffix += 1;
  }
  return `${baseName} (${suffix.toString()})`;
}
export function normalizeForSubmit(
  form: ConnectionProfileInput,
  credentials: CredentialProfile[],
): ConnectionProfileInput {
  if (form.protocol === "rlogin") return normalizeRloginInput(form);
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
      rlogin: undefined,
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
      rlogin: undefined,
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
      rlogin: undefined,
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
      rlogin: undefined,
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
    rlogin: undefined,
    telnet: undefined,
    serial: undefined,
  };
}
export function withDefaultRdpConfig(value?: RdpConnectionConfig | null): RdpConnectionConfig {
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
export function withDefaultVncConfig(value?: VncConnectionConfig | null): VncConnectionConfig {
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
export function withDefaultTelnetConfig(value?: ConnectionProfileInput["telnet"]): NonNullable<ConnectionProfileInput["telnet"]> {
  return {
    ...defaultTelnetConfig,
    ...value,
  };
}
export function withDefaultSerialConfig(value?: SerialConnectionConfig | null): SerialConnectionConfig {
  return {
    ...defaultSerialConfig,
    ...value,
    baud_rate: Number(value?.baud_rate) || defaultSerialConfig.baud_rate,
    port_name: value?.port_name || "",
  };
}
