use std::env;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use russh::{client, Channel};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;
#[cfg(unix)]
use tokio::net::UnixStream;
use tokio::sync::RwLock;
use tokio::time::{timeout, Duration};

const X11_TCP_BASE_PORT: u16 = 6000;
const X11_SETUP_HEADER_BYTES: usize = 12;
const X11_AUTH_PROTOCOL: &[u8] = b"MIT-MAGIC-COOKIE-1";
const X11_SETUP_MAX_BYTES: usize = 64 * 1024;
const X11_COOKIE_BYTES: usize = 16;
const XAUTH_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub(crate) enum X11LocalTarget {
    Tcp { host: String, port: u16 },
    #[cfg(unix)]
    Unix { path: PathBuf },
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub(crate) struct X11DisplaySpec {
    pub display_number: u16,
    pub screen_number: u32,
    pub target: X11LocalTarget,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct X11SpikeError(String);

impl fmt::Display for X11SpikeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Clone, Debug)]
pub(crate) struct X11ForwardConfig {
    pub display: X11DisplaySpec,
    pub fake_cookie: Vec<u8>,
    pub real_cookie: Vec<u8>,
}

#[derive(Clone, Debug)]
pub(crate) struct PreparedX11Forwarding {
    pub config: X11ForwardConfig,
    pub fake_cookie_hex: String,
}

#[derive(Clone, Default)]
pub(crate) struct X11ForwardState {
    config: Arc<RwLock<Option<X11ForwardConfig>>>,
}

trait AsyncX11Stream: AsyncRead + AsyncWrite {}
impl<T: AsyncRead + AsyncWrite + ?Sized> AsyncX11Stream for T {}
type BoxedX11Stream = Box<dyn AsyncX11Stream + Unpin + Send>;

impl X11ForwardState {
    pub(crate) async fn configure(&self, config: X11ForwardConfig) -> Result<(), X11SpikeError> {
        if config.fake_cookie.len() != X11_COOKIE_BYTES
            || config.fake_cookie.len() != config.real_cookie.len()
        {
            return Err(X11SpikeError(
                "X11 MIT-MAGIC-COOKIE-1 fake/real cookies must both be 16 bytes".to_string(),
            ));
        }
        *self.config.write().await = Some(config);
        Ok(())
    }

    pub(crate) async fn clear(&self) {
        *self.config.write().await = None;
    }

    pub(crate) async fn handle_server_channel(&self, channel: Channel<client::Msg>) {
        let mut remote = channel.into_stream();
        let Some(config) = self.config.read().await.clone() else {
            let _ = remote.shutdown().await;
            return;
        };
        let result = async {
            let setup = read_and_rewrite_setup(
                &mut remote,
                &config.fake_cookie,
                &config.real_cookie,
            )
            .await?;
            let mut local = connect_local_target(&config.display.target).await?;
            local
                .write_all(&setup)
                .await
                .map_err(|error| X11SpikeError(format!("X11 local setup write failed: {error}")))?;
            local
                .flush()
                .await
                .map_err(|error| X11SpikeError(format!("X11 local setup flush failed: {error}")))?;
            tokio::io::copy_bidirectional(&mut remote, &mut local)
                .await
                .map_err(|error| X11SpikeError(format!("X11 stream forwarding failed: {error}")))?;
            let _ = local.shutdown().await;
            Ok::<(), X11SpikeError>(())
        }
        .await;
        let _ = remote.shutdown().await;
        if let Err(error) = result {
            eprintln!("NexaTerm X11 forwarding channel closed: {error}");
        }
    }
}

pub(crate) async fn prepare_x11_forwarding(
    configured_display: Option<&str>,
) -> Result<PreparedX11Forwarding, X11SpikeError> {
    let display_text = effective_display(configured_display)?;
    let display = parse_display(&display_text)?;
    let real_cookie =
        read_local_x11_auth_cookie(&display_text, display.display_number).await?;
    if real_cookie.len() != X11_COOKIE_BYTES {
        return Err(X11SpikeError(format!(
            "X11 MIT-MAGIC-COOKIE-1 cookie must be {X11_COOKIE_BYTES} bytes, got {}",
            real_cookie.len()
        )));
    }
    let fake_cookie = generate_fake_cookie()?;
    let fake_cookie_hex = encode_cookie_hex(&fake_cookie);
    Ok(PreparedX11Forwarding {
        config: X11ForwardConfig {
            display,
            fake_cookie,
            real_cookie,
        },
        fake_cookie_hex,
    })
}

fn effective_display(configured_display: Option<&str>) -> Result<String, X11SpikeError> {
    if let Some(display) = configured_display.map(str::trim).filter(|value| !value.is_empty()) {
        return Ok(display.to_string());
    }
    if let Ok(display) = env::var("DISPLAY") {
        let display = display.trim();
        if !display.is_empty() {
            return Ok(display.to_string());
        }
    }
    if cfg!(windows) {
        return Ok("localhost:0".to_string());
    }
    Err(X11SpikeError(
        "DISPLAY is not set; configure an X11 display or start a local X server".to_string(),
    ))
}

fn generate_fake_cookie() -> Result<Vec<u8>, X11SpikeError> {
    let mut cookie = vec![0_u8; X11_COOKIE_BYTES];
    getrandom::fill(&mut cookie)
        .map_err(|error| X11SpikeError(format!("generate X11 fake cookie failed: {error}")))?;
    Ok(cookie)
}

async fn read_local_x11_auth_cookie(
    display: &str,
    display_number: u16,
) -> Result<Vec<u8>, X11SpikeError> {
    let executable = if cfg!(target_os = "macos") && Path::new("/opt/X11/bin/xauth").exists() {
        "/opt/X11/bin/xauth"
    } else {
        "xauth"
    };
    let executable = executable.to_string();
    let display_arg = display.to_string();
    let output = timeout(
        XAUTH_TIMEOUT,
        tokio::task::spawn_blocking(move || {
            Command::new(executable)
                .arg("list")
                .env("DISPLAY", &display_arg)
                .output()
        }),
    )
    .await
    .map_err(|_| X11SpikeError(format!("xauth timed out after {XAUTH_TIMEOUT:?}")))?
    .map_err(|error| X11SpikeError(format!("xauth worker failed: {error}")))?
    .map_err(|error| X11SpikeError(format!("run xauth failed: {error}")))?;
    if !output.status.success() {
        return Err(X11SpikeError(format!(
            "xauth list failed with status {}",
            output.status
        )));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_xauth_cookie(&stdout, display_number).ok_or_else(|| {
        X11SpikeError(format!(
            "xauth returned no MIT-MAGIC-COOKIE-1 entry for DISPLAY {display}"
        ))
    })
}

fn parse_xauth_cookie(output: &str, display_number: u16) -> Option<Vec<u8>> {
    output.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let display_name = parts.next()?;
        let protocol = parts.next()?;
        let cookie = parts.next()?;
        if protocol != "MIT-MAGIC-COOKIE-1"
            || xauth_display_number(display_name) != Some(display_number)
        {
            return None;
        }
        decode_cookie_hex(cookie).ok()
    })
}

fn xauth_display_number(display_name: &str) -> Option<u16> {
    display_name
        .rsplit_once(':')
        .and_then(|(_, suffix)| suffix.split('.').next())
        .and_then(|value| value.parse::<u16>().ok())
}

async fn connect_local_target(target: &X11LocalTarget) -> Result<BoxedX11Stream, X11SpikeError> {
    match target {
        X11LocalTarget::Tcp { host, port } => TcpStream::connect((host.as_str(), *port))
            .await
            .map(|stream| Box::new(stream) as BoxedX11Stream)
            .map_err(|error| {
                X11SpikeError(format!("local X11 TCP connect to {host}:{port} failed: {error}"))
            }),
        #[cfg(unix)]
        X11LocalTarget::Unix { path } => UnixStream::connect(path)
            .await
            .map(|stream| Box::new(stream) as BoxedX11Stream)
            .map_err(|error| {
                X11SpikeError(format!("local X11 Unix socket {} failed: {error}", path.display()))
            }),
    }
}

async fn read_and_rewrite_setup<R: AsyncRead + Unpin>(
    remote: &mut R,
    fake_cookie: &[u8],
    real_cookie: &[u8],
) -> Result<Vec<u8>, X11SpikeError> {
    let mut header = [0u8; X11_SETUP_HEADER_BYTES];
    remote
        .read_exact(&mut header)
        .await
        .map_err(|error| X11SpikeError(format!("X11 setup header read failed: {error}")))?;
    let total = setup_packet_len(&header)?;
    if total > X11_SETUP_MAX_BYTES {
        return Err(X11SpikeError(format!(
            "X11 setup packet exceeds {X11_SETUP_MAX_BYTES} bytes"
        )));
    }
    let mut packet = vec![0u8; total];
    packet[..X11_SETUP_HEADER_BYTES].copy_from_slice(&header);
    remote
        .read_exact(&mut packet[X11_SETUP_HEADER_BYTES..])
        .await
        .map_err(|error| X11SpikeError(format!("X11 setup body read failed: {error}")))?;
    replace_fake_cookie_in_setup(&mut packet, fake_cookie, real_cookie)?;
    Ok(packet)
}

#[allow(dead_code)]
pub(crate) fn parse_display(value: &str) -> Result<X11DisplaySpec, X11SpikeError> {
    let value = value.trim();
    let (host, display_and_screen) = value
        .rsplit_once(':')
        .ok_or_else(|| X11SpikeError("DISPLAY must contain ':'".to_string()))?;
    let (display_text, screen_text) = match display_and_screen.split_once('.') {
        Some((display, screen)) => (display, Some(screen)),
        None => (display_and_screen, None),
    };
    let display_number = display_text
        .parse::<u16>()
        .map_err(|_| X11SpikeError("DISPLAY number is invalid".to_string()))?;
    let screen_number = screen_text
        .unwrap_or("0")
        .parse::<u32>()
        .map_err(|_| X11SpikeError("DISPLAY screen is invalid".to_string()))?;
    let port = X11_TCP_BASE_PORT
        .checked_add(display_number)
        .ok_or_else(|| X11SpikeError("DISPLAY number exceeds TCP port range".to_string()))?;

    #[cfg(unix)]
    let target = {
        if host.is_empty() || host.eq_ignore_ascii_case("unix") {
            X11LocalTarget::Unix {
                path: PathBuf::from(format!("/tmp/.X11-unix/X{display_number}")),
            }
        } else if host.starts_with('/') {
            // XQuartz launchd DISPLAY values look like:
            // /private/tmp/com.apple.launchd.<id>/org.xquartz:0
            X11LocalTarget::Unix {
                path: PathBuf::from(format!("{host}:{display_number}")),
            }
        } else {
            X11LocalTarget::Tcp {
                host: normalize_tcp_host(host),
                port,
            }
        }
    };

    #[cfg(not(unix))]
    let target = X11LocalTarget::Tcp {
        host: if host.is_empty() || host.eq_ignore_ascii_case("unix") {
            "127.0.0.1".to_string()
        } else {
            normalize_tcp_host(host)
        },
        port,
    };

    Ok(X11DisplaySpec {
        display_number,
        screen_number,
        target,
    })
}

fn normalize_tcp_host(host: &str) -> String {
    host.strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host)
        .to_string()
}

#[allow(dead_code)]
pub(crate) fn replace_fake_cookie_in_setup(
    packet: &mut [u8],
    fake_cookie: &[u8],
    real_cookie: &[u8],
) -> Result<usize, X11SpikeError> {
    if fake_cookie.len() != real_cookie.len() {
        return Err(X11SpikeError(
            "fake and real X11 cookies must have the same length".to_string(),
        ));
    }
    let (auth_name_start, auth_name_end, auth_data_start, auth_data_end, _) =
        setup_auth_layout(packet)?;
    if auth_data_end > packet.len() {
        return Err(X11SpikeError("X11 setup auth fields are truncated".to_string()));
    }
    if &packet[auth_name_start..auth_name_end] != X11_AUTH_PROTOCOL {
        return Err(X11SpikeError(
            "X11 setup does not use MIT-MAGIC-COOKIE-1".to_string(),
        ));
    }
    if auth_data_end - auth_data_start != fake_cookie.len()
        || &packet[auth_data_start..auth_data_end] != fake_cookie
    {
        return Err(X11SpikeError(
            "X11 setup cookie does not match the forwarding cookie".to_string(),
        ));
    }
    packet[auth_data_start..auth_data_end].copy_from_slice(real_cookie);
    Ok(auth_data_end)
}

fn setup_packet_len(packet: &[u8]) -> Result<usize, X11SpikeError> {
    let (_, _, _, _, total) = setup_auth_layout(packet)?;
    Ok(total)
}

fn setup_auth_layout(
    packet: &[u8],
) -> Result<(usize, usize, usize, usize, usize), X11SpikeError> {
    if packet.len() < X11_SETUP_HEADER_BYTES {
        return Err(X11SpikeError("X11 setup packet is truncated".to_string()));
    }
    let little_endian = match packet[0] {
        b'l' => true,
        b'B' => false,
        other => {
            return Err(X11SpikeError(format!(
                "unsupported X11 byte-order marker {other:#x}"
            )));
        }
    };
    let read_u16 = |bytes: &[u8]| -> u16 {
        let pair = [bytes[0], bytes[1]];
        if little_endian {
            u16::from_le_bytes(pair)
        } else {
            u16::from_be_bytes(pair)
        }
    };
    let auth_name_len = read_u16(&packet[6..8]) as usize;
    let auth_data_len = read_u16(&packet[8..10]) as usize;
    let auth_name_start = X11_SETUP_HEADER_BYTES;
    let auth_name_end = auth_name_start
        .checked_add(auth_name_len)
        .ok_or_else(|| X11SpikeError("X11 auth protocol length overflow".to_string()))?;
    let auth_data_start = align4(auth_name_end)
        .ok_or_else(|| X11SpikeError("X11 auth protocol padding overflow".to_string()))?;
    let auth_data_end = auth_data_start
        .checked_add(auth_data_len)
        .ok_or_else(|| X11SpikeError("X11 auth cookie length overflow".to_string()))?;
    let total = align4(auth_data_end)
        .ok_or_else(|| X11SpikeError("X11 auth cookie padding overflow".to_string()))?;
    Ok((
        auth_name_start,
        auth_name_end,
        auth_data_start,
        auth_data_end,
        total,
    ))
}

fn align4(value: usize) -> Option<usize> {
    value.checked_add(3).map(|value| value & !3)
}

pub(crate) fn decode_cookie_hex(value: &str) -> Result<Vec<u8>, X11SpikeError> {
    let value = value.trim();
    if value.is_empty() || value.len() % 2 != 0 {
        return Err(X11SpikeError("X11 cookie hex length is invalid".to_string()));
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let text = std::str::from_utf8(pair)
                .map_err(|error| X11SpikeError(format!("X11 cookie hex is invalid: {error}")))?;
            u8::from_str_radix(text, 16)
                .map_err(|error| X11SpikeError(format!("X11 cookie hex is invalid: {error}")))
        })
        .collect()
}

pub(crate) fn encode_cookie_hex(value: &[u8]) -> String {
    value.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::{
        decode_cookie_hex, encode_cookie_hex, generate_fake_cookie, parse_display,
        parse_xauth_cookie, replace_fake_cookie_in_setup, X11DisplaySpec, X11LocalTarget,
        X11_AUTH_PROTOCOL,
    };

    #[test]
    #[cfg(unix)]
    fn parses_local_unix_and_xquartz_launchd_displays() {
        assert_eq!(
            parse_display(":0").unwrap(),
            X11DisplaySpec {
                display_number: 0,
                screen_number: 0,
                target: X11LocalTarget::Unix {
                    path: "/tmp/.X11-unix/X0".into(),
                },
            }
        );
        assert_eq!(
            parse_display("/private/tmp/com.apple.launchd.demo/org.xquartz:0").unwrap(),
            X11DisplaySpec {
                display_number: 0,
                screen_number: 0,
                target: X11LocalTarget::Unix {
                    path: "/private/tmp/com.apple.launchd.demo/org.xquartz:0".into(),
                },
            }
        );
    }

    #[test]
    fn parses_tcp_display_and_screen() {
        assert_eq!(
            parse_display("localhost:10.2").unwrap(),
            X11DisplaySpec {
                display_number: 10,
                screen_number: 2,
                target: X11LocalTarget::Tcp {
                    host: "localhost".to_string(),
                    port: 6010,
                },
            }
        );
    }

    #[test]
    fn x11_cookie_hex_round_trips() {
        let cookie = [0x01, 0x23, 0xab, 0xcd, 0xef];
        let encoded = encode_cookie_hex(&cookie);
        assert_eq!(encoded, "0123abcdef");
        assert_eq!(decode_cookie_hex(&encoded).unwrap(), cookie);
        assert!(decode_cookie_hex("abc").is_err());
    }

    #[test]
    fn parses_xauth_cookie_and_generates_128_bit_fake_cookie() {
        let output = "host/unix:0  MIT-MAGIC-COOKIE-1  00112233445566778899aabbccddeeff\n";
        assert_eq!(
            parse_xauth_cookie(output, 0).unwrap(),
            decode_cookie_hex("00112233445566778899aabbccddeeff").unwrap()
        );
        assert!(parse_xauth_cookie(output, 1).is_none());
        let fake = generate_fake_cookie().unwrap();
        assert_eq!(fake.len(), 16);
        assert_eq!(encode_cookie_hex(&fake).len(), 32);
    }

    #[test]
    fn swaps_fake_cookie_in_little_endian_setup_packet() {
        let fake = [0x11; 16];
        let real = [0x22; 16];
        let mut packet = setup_packet(true, &fake);

        let consumed = replace_fake_cookie_in_setup(&mut packet, &fake, &real).unwrap();

        assert_eq!(consumed, 48);
        assert_eq!(&packet[32..48], &real);
    }

    #[test]
    fn swaps_fake_cookie_in_big_endian_setup_packet() {
        let fake = [0x33; 16];
        let real = [0x44; 16];
        let mut packet = setup_packet(false, &fake);

        replace_fake_cookie_in_setup(&mut packet, &fake, &real).unwrap();

        assert_eq!(&packet[32..48], &real);
    }

    #[test]
    fn rejects_wrong_cookie_protocol_and_truncated_setup() {
        let fake = [0x55; 16];
        let real = [0x66; 16];
        let mut wrong_cookie = setup_packet(true, &[0x77; 16]);
        assert!(replace_fake_cookie_in_setup(&mut wrong_cookie, &fake, &real).is_err());

        let mut wrong_protocol = setup_packet(true, &fake);
        wrong_protocol[12] = b'X';
        assert!(replace_fake_cookie_in_setup(&mut wrong_protocol, &fake, &real).is_err());

        let mut truncated = vec![b'l'; 11];
        assert!(replace_fake_cookie_in_setup(&mut truncated, &fake, &real).is_err());
    }

    fn setup_packet(little_endian: bool, cookie: &[u8; 16]) -> Vec<u8> {
        let mut packet = vec![0u8; 48];
        packet[0] = if little_endian { b'l' } else { b'B' };
        write_u16(&mut packet[2..4], 11, little_endian);
        write_u16(&mut packet[4..6], 0, little_endian);
        write_u16(
            &mut packet[6..8],
            X11_AUTH_PROTOCOL.len() as u16,
            little_endian,
        );
        write_u16(&mut packet[8..10], cookie.len() as u16, little_endian);
        packet[12..30].copy_from_slice(X11_AUTH_PROTOCOL);
        packet[32..48].copy_from_slice(cookie);
        packet
    }

    fn write_u16(target: &mut [u8], value: u16, little_endian: bool) {
        let bytes = if little_endian {
            value.to_le_bytes()
        } else {
            value.to_be_bytes()
        };
        target.copy_from_slice(&bytes);
    }
}
