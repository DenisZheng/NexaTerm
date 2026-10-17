use super::*;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RloginConnectionConfig {
    pub local_address: String,
    pub local_user: String,
    #[serde(default="rlogin_terminal")]
    pub terminal: String,
    #[serde(default="rlogin_speed")]
    pub speed: u32,
}
fn rlogin_terminal()->String { "xterm-256color".into() }
fn rlogin_speed()->u32 { 38400 }
impl Default for RloginConnectionConfig {
    fn default()->Self { Self {local_address:String::new(),local_user:String::new(),terminal:rlogin_terminal(),speed:rlogin_speed()} }
}

pub(super) fn validate_rlogin_profile_input(input:&ConnectionProfileInput,host:String)->Result<ValidatedConnectionProfileInput,AppError> {
    let mut config=input.rlogin.clone().ok_or_else(||rlogin_config_error("rlogin_config_missing"))?;
    let nonempty=|value:&Option<String>|value.as_ref().is_some_and(|s|!s.is_empty());
    if input.credential_mode!=ConnectionCredentialMode::Prompt || nonempty(&input.credential_id)
        || input.inline_auth_kind.is_some() || input.prompt_auth_kind.is_some() || input.auth_kind.is_some()
        || nonempty(&input.inline_password) || input.inline_password_touched || nonempty(&input.password)
        || nonempty(&input.inline_private_key_path) || nonempty(&input.private_key_path)
        || nonempty(&input.inline_private_key_passphrase) || input.inline_private_key_passphrase_touched || nonempty(&input.private_key_passphrase)
        || input.proxy.kind!=ConnectionProxyKind::None || nonempty(&input.proxy.host) || input.proxy.port.is_some()
        || nonempty(&input.proxy.username) || nonempty(&input.proxy.password)
        || input.jump.kind!=ConnectionJumpKind::None || nonempty(&input.jump.jump_connection_id)
        || input.advanced.x11_forwarding || nonempty(&input.advanced.x11_display)
        || input.rdp.is_some() || input.vnc.is_some() || input.telnet.is_some() || input.serial.is_some() {
        return Err(rlogin_config_error("rlogin_config_unsupported"));
    }
    config.local_address=config.local_address.trim().to_owned(); config.local_user=config.local_user.trim().to_owned();
    config.terminal=config.terminal.trim().to_owned(); let username=input.username.trim().to_owned();
    let address=|value:&str|value.parse::<std::net::Ipv4Addr>().map_err(|_|rlogin_config_error("legacy_socket_invalid_address"));
    crate::rlogin_connect::validate(&crate::rlogin_connect::ConnectOptions {
        local:address(&config.local_address)?, target:std::net::SocketAddrV4::new(address(&host)?,input.port),
        local_user:&config.local_user,remote_user:&username,terminal:&config.terminal,speed:config.speed,
        window:crate::rlogin_connect::WindowSize {rows:24,columns:80,x_pixels:0,y_pixels:0},
    }).map_err(|error|rlogin_config_error(error.code()))?;
    let name=trim_optional(input.name.as_ref()).unwrap_or_else(||format!("Rlogin {username}@{host}:{}",input.port));
    Ok(ValidatedConnectionProfileInput {
        id:trim_optional(input.id.as_ref()),protocol:ConnectionProtocol::Rlogin,name,group:trim_optional(input.group.as_ref()),
        host,port:input.port,username,credential_mode:ConnectionCredentialMode::Prompt,credential_id:None,
        inline_auth_kind:None,inline_password:None,inline_password_touched:false,inline_private_key_path:None,
        inline_private_key_passphrase:None,inline_private_key_passphrase_touched:false,prompt_auth_kind:None,
        proxy:ConnectionProxyConfig::default(),jump:ConnectionJumpConfig::default(),
        advanced:ConnectionAdvancedConfig {terminal_encoding:normalize_terminal_encoding(&input.advanced.terminal_encoding)?,..Default::default()},
        rdp:None,vnc:None,rlogin:Some(config),telnet:None,serial:None,notes:trim_optional(input.notes.as_ref()),
    })
}
fn rlogin_config_error(code:&str)->AppError {
    AppError::new(code,"Rlogin 配置无效，请检查独立协议字段；此协议不使用 SSH 凭据、代理、跳板或 X11 设置。",code,true)
}

pub(crate) fn validate_stored_rlogin(record:&crate::sync_snapshot::SyncConnectionRecord,old_format:bool)->Result<(),AppError> {
    if record.protocol!=ConnectionProtocol::Rlogin {
        return if record.rlogin.is_none() {Ok(())} else {Err(rlogin_config_error("rlogin_config_unsupported"))};
    }
    if old_format || record.inline_secret_slot_id.is_some() {return Err(rlogin_config_error("rlogin_config_unsupported"));}
    // 复用同一协议/安全验证，不访问凭据或创建transport。slot引用在转换前单独拒绝。
    let canonical=canonical_rlogin(record)?;
    if canonical.host!=record.host || canonical.username!=record.username || canonical.rlogin!=record.rlogin || canonical.advanced!=record.advanced {
        return Err(rlogin_config_error("rlogin_config_invalid"));
    }
    Ok(())
}
pub(crate) fn validate_loaded_rlogin(profile:&ConnectionProfile)->Result<(),AppError> {
    if profile.protocol!=ConnectionProtocol::Rlogin {
        return if profile.rlogin.is_none() {Ok(())} else {Err(rlogin_config_error("rlogin_config_unsupported"))};
    }
    let canonical=canonical_rlogin(profile)?;
    if canonical.host!=profile.host || canonical.username!=profile.username || canonical.rlogin!=profile.rlogin || canonical.advanced!=profile.advanced {
        return Err(rlogin_config_error("rlogin_config_invalid"));
    }
    Ok(())
}
fn canonical_rlogin(value:&impl Serialize)->Result<ValidatedConnectionProfileInput,AppError> {
    let input:ConnectionProfileInput=serde_json::from_value(serde_json::to_value(value)
        .map_err(|_|rlogin_config_error("rlogin_config_invalid"))?)
        .map_err(|_|rlogin_config_error("rlogin_config_invalid"))?;
    validate_rlogin_profile_input(&input,input.host.trim().to_owned())
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct TelnetConnectionConfig {
    pub enter_mode: TelnetEnterMode,
    pub backspace_mode: TelnetBackspaceMode,
}

impl Default for TelnetConnectionConfig {
    fn default() -> Self {
        Self {
            enter_mode: TelnetEnterMode::CrLf,
            backspace_mode: TelnetBackspaceMode::Del,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct SerialConnectionConfig {
    pub port_name: String,
    pub baud_rate: u32,
    pub data_bits: SerialDataBits,
    pub parity: SerialParity,
    pub stop_bits: SerialStopBits,
    pub flow_control: SerialFlowControl,
    pub backspace_mode: SerialBackspaceMode,
}

impl Default for SerialConnectionConfig {
    fn default() -> Self {
        Self {
            port_name: String::new(),
            baud_rate: 9_600,
            data_bits: SerialDataBits::Eight,
            parity: SerialParity::None,
            stop_bits: SerialStopBits::One,
            flow_control: SerialFlowControl::None,
            backspace_mode: SerialBackspaceMode::Del,
        }
    }
}

pub(super) fn validate_telnet_profile_input(
    input: &ConnectionProfileInput,
    host: String,
) -> Result<ValidatedConnectionProfileInput, AppError> {
    let telnet = input.telnet.clone().unwrap_or_default();
    let name = input
        .name
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("Telnet {host}:{}", input.port));

    Ok(ValidatedConnectionProfileInput {
        id: trim_optional(input.id.as_ref()),
        protocol: ConnectionProtocol::Telnet,
        name,
        group: trim_optional(input.group.as_ref()),
        host,
        port: input.port,
        username: String::new(),
        credential_mode: ConnectionCredentialMode::Prompt,
        credential_id: None,
        inline_auth_kind: None,
        inline_password: None,
        inline_password_touched: false,
        inline_private_key_path: None,
        inline_private_key_passphrase: None,
        inline_private_key_passphrase_touched: false,
        prompt_auth_kind: None,
        proxy: ConnectionProxyConfig::default(),
        jump: ConnectionJumpConfig::default(),
        advanced: ConnectionAdvancedConfig::default(),
        rdp: None,
        vnc: None,
        rlogin: None,
        telnet: Some(telnet),
        serial: None,
        notes: trim_optional(input.notes.as_ref()),
    })
}

pub(super) fn validate_serial_profile_input(
    input: &ConnectionProfileInput,
    host: String,
) -> Result<ValidatedConnectionProfileInput, AppError> {
    let mut serial = input.serial.clone().unwrap_or_default();
    serial.port_name = trim_optional(Some(&serial.port_name)).unwrap_or(host);
    if serial.port_name.trim().is_empty() {
        return Err(AppError::new(
            "serial_port_missing",
            "请选择串口。",
            "serial port_name is empty",
            true,
        ));
    }
    if serial.baud_rate == 0 {
        return Err(AppError::new(
            "serial_baud_rate_invalid",
            "串口波特率无效。",
            "serial baud_rate is 0",
            true,
        ));
    }

    let name = input
        .name
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("串口 {}", serial.port_name));

    Ok(ValidatedConnectionProfileInput {
        id: trim_optional(input.id.as_ref()),
        protocol: ConnectionProtocol::Serial,
        name,
        group: trim_optional(input.group.as_ref()),
        host: serial.port_name.clone(),
        port: 1,
        username: String::new(),
        credential_mode: ConnectionCredentialMode::Prompt,
        credential_id: None,
        inline_auth_kind: None,
        inline_password: None,
        inline_password_touched: false,
        inline_private_key_path: None,
        inline_private_key_passphrase: None,
        inline_private_key_passphrase_touched: false,
        prompt_auth_kind: None,
        proxy: ConnectionProxyConfig::default(),
        jump: ConnectionJumpConfig::default(),
        advanced: ConnectionAdvancedConfig::default(),
        rdp: None,
        vnc: None,
        rlogin: None,
        telnet: None,
        serial: Some(serial),
        notes: trim_optional(input.notes.as_ref()),
    })
}
