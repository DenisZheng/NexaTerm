use std::collections::HashMap;
use std::env;
use std::io::{self, BufRead, BufReader, Write};
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use m_xterm_lib::mcp;
use serde_json::{json, Value};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Semaphore};
use tokio::time::timeout;

const MAX_HTTP_HEADER_BYTES: usize = 64 * 1024;
const MAX_HTTP_BODY_BYTES: usize = 2 * 1024 * 1024;

/// 速率限制策略（`design.md` §3.3）：loopback 与非 loopback 使用不同默认值，
/// 非 loopback 更严格并要求认证失败退避。
///
/// loopback 额度必须显著高于应用内 supervisor 的健康检查频率（每 15 秒一次，
/// 即 4 次/分钟），否则会把自身监控打成不健康并触发自动重启。
const RATE_WINDOW: Duration = Duration::from_secs(60);
const RATE_LIMIT_LOOPBACK: u32 = 300;
const RATE_LIMIT_REMOTE: u32 = 60;
/// 连续认证失败达到该次数后进入退避，退避期间直接拒绝，不再走到认证逻辑。
const AUTH_FAILURE_THRESHOLD: u32 = 5;
const AUTH_BACKOFF_INITIAL: Duration = Duration::from_secs(5);
const AUTH_BACKOFF_MAX: Duration = Duration::from_secs(300);
/// 窗口/退避均已结束且长时间无活动的条目会被清理，避免请求来源数量撑大内存。
const RATE_ENTRY_IDLE_TTL: Duration = Duration::from_secs(600);
const RATE_MAX_TRACKED_SOURCES: usize = 1024;

/// 并发连接上限（`design.md` §3.2.1 / §3.3）：非 loopback 更严格，防止单个远端来源
/// 占满全部连接槽。长连接（SSE）也占一个槽位，因此额度需高于正常交互所需。
const MAX_CONNECTIONS_LOOPBACK: usize = 64;
const MAX_CONNECTIONS_REMOTE: usize = 16;

#[derive(Default)]
struct RateEntry {
    window_started: Option<Instant>,
    window_count: u32,
    consecutive_auth_failures: u32,
    blocked_until: Option<Instant>,
    last_seen: Option<Instant>,
}

struct RateDecision {
    allowed: bool,
    retry_after_seconds: u64,
}

/// 进程内按来源地址限流（固定窗口 + 认证失败退避）。
///
/// 时间由调用方传入 `now`，既保证测试可确定复现，也避免每处各取一次时钟。
struct RateLimiter {
    entries: HashMap<IpAddr, RateEntry>,
}

impl RateLimiter {
    fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    fn limit_for(&self, source: IpAddr) -> u32 {
        if mcp::is_loopback_host(&source.to_string()) {
            RATE_LIMIT_LOOPBACK
        } else {
            RATE_LIMIT_REMOTE
        }
    }

    /// 记录一次请求并给出是否放行。此判断在认证**之前**执行：无 token 与错误 token
    /// 的暴力尝试也必须有成本。
    fn check(&mut self, source: IpAddr, now: Instant) -> RateDecision {
        self.prune(now);
        let limit = self.limit_for(source);
        let entry = self.entries.entry(source).or_default();
        entry.last_seen = Some(now);

        if let Some(blocked_until) = entry.blocked_until {
            if blocked_until > now {
                return RateDecision {
                    allowed: false,
                    retry_after_seconds: blocked_until.duration_since(now).as_secs().max(1),
                };
            }
            entry.blocked_until = None;
        }

        let expired = entry
            .window_started
            .is_none_or(|started| now.duration_since(started) >= RATE_WINDOW);
        if expired {
            entry.window_started = Some(now);
            entry.window_count = 0;
        }
        entry.window_count = entry.window_count.saturating_add(1);
        if entry.window_count > limit {
            let started = entry.window_started.unwrap_or(now);
            return RateDecision {
                allowed: false,
                retry_after_seconds: RATE_WINDOW
                    .saturating_sub(now.duration_since(started))
                    .as_secs()
                    .max(1),
            };
        }

        RateDecision {
            allowed: true,
            retry_after_seconds: 0,
        }
    }

    /// 认证失败按来源累计并触发指数退避；退避上限有界，正常客户端不会被动锁死。
    fn record_auth_failure(&mut self, source: IpAddr, now: Instant) {
        let entry = self.entries.entry(source).or_default();
        entry.last_seen = Some(now);
        entry.consecutive_auth_failures = entry.consecutive_auth_failures.saturating_add(1);
        if entry.consecutive_auth_failures < AUTH_FAILURE_THRESHOLD {
            return;
        }
        let step = entry
            .consecutive_auth_failures
            .saturating_sub(AUTH_FAILURE_THRESHOLD);
        let backoff = AUTH_BACKOFF_INITIAL
            .saturating_mul(1_u32 << step.min(16))
            .min(AUTH_BACKOFF_MAX);
        entry.blocked_until = Some(now + backoff);
    }

    /// 认证成功即清零失败计数：合法客户端偶发一次错误 token 不应被逐步推向退避。
    fn record_auth_success(&mut self, source: IpAddr, now: Instant) {
        if let Some(entry) = self.entries.get_mut(&source) {
            entry.consecutive_auth_failures = 0;
            entry.blocked_until = None;
            entry.last_seen = Some(now);
        }
    }

    fn prune(&mut self, now: Instant) {
        if self.entries.len() <= RATE_MAX_TRACKED_SOURCES {
            return;
        }
        self.entries.retain(|_, entry| {
            let idle_expired = entry
                .last_seen
                .is_none_or(|seen| now.duration_since(seen) >= RATE_ENTRY_IDLE_TTL);
            let blocked = entry.blocked_until.is_some_and(|until| until > now);
            !(idle_expired && !blocked)
        });
    }
}

fn main() {
    let config = parse_cli_config().unwrap_or_else(|error| {
        eprintln!("mxterm-mcp: {}", error.message);
        std::process::exit(1);
    });

    let result = match config.transport {
        Transport::Stdio => serve_stdio(&config.data_dir),
        Transport::Http(http) => serve_http(&config.data_dir, http),
    };
    if let Err(error) = result {
        eprintln!("mxterm-mcp: {error}");
        std::process::exit(1);
    }
}

struct CliConfig {
    data_dir: PathBuf,
    transport: Transport,
}

enum Transport {
    Stdio,
    Http(HttpConfig),
}

struct HttpConfig {
    host: String,
    port: u16,
    token_hash: String,
}

fn parse_cli_config() -> Result<CliConfig, m_xterm_lib::app_error::AppError> {
    let mut args = env::args().skip(1);
    let mut data_dir: Option<PathBuf> = None;
    let mut http_config: Option<HttpConfig> = None;
    let mut serve_http = false;
    let mut host = mcp::DEFAULT_REMOTE_HOST.to_string();
    let mut port = mcp::DEFAULT_REMOTE_PORT;
    let mut token_hash: Option<String> = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "serve" => {
                serve_http = true;
            }
            "--data-dir" => {
                let value = required_arg("--data-dir", args.next())?;
                data_dir = Some(PathBuf::from(value));
            }
            "--host" => {
                host = required_arg("--host", args.next())?;
            }
            "--port" => {
                let value = required_arg("--port", args.next())?;
                port = value.parse::<u16>().map_err(|error| {
                    m_xterm_lib::app_error::AppError::new(
                        "mcp_remote_port_invalid",
                        "remote MCP port is invalid",
                        error,
                        true,
                    )
                })?;
                if port == 0 {
                    return Err(m_xterm_lib::app_error::AppError::new(
                        "mcp_remote_port_invalid",
                        "remote MCP port is invalid",
                        "port is 0",
                        true,
                    ));
                }
            }
            "--token-sha256" => {
                token_hash = Some(required_arg("--token-sha256", args.next())?);
            }
            _ => {}
        }
    }

    if serve_http {
        let token_hash = token_hash
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                m_xterm_lib::app_error::AppError::new(
                    "mcp_remote_token_missing",
                    "remote MCP token hash is required",
                    "--token-sha256 missing",
                    true,
                )
            })?;
        http_config = Some(HttpConfig {
            host: host.trim().to_string(),
            port,
            token_hash,
        });
    }

    let data_dir = data_dir
        .or_else(|| mcp::default_app_data_dir().ok())
        .ok_or_else(|| {
            m_xterm_lib::app_error::AppError::new(
                "mcp_data_dir_missing",
                "data dir not provided",
                "--data-dir absent",
                true,
            )
        })?;

    Ok(CliConfig {
        data_dir,
        transport: http_config.map_or(Transport::Stdio, Transport::Http),
    })
}

fn required_arg(
    flag: &str,
    value: Option<String>,
) -> Result<String, m_xterm_lib::app_error::AppError> {
    value.ok_or_else(|| {
        let code = if flag == "--data-dir" {
            "mcp_data_dir_missing"
        } else {
            "mcp_argument_missing"
        };
        let message = format!("{flag} requires a value");
        m_xterm_lib::app_error::AppError::new(code, &message, flag, true)
    })
}

fn serve_stdio(data_dir: &Path) -> io::Result<()> {
    let stdin = io::stdin();
    let mut reader = BufReader::new(stdin.lock());
    let stdout = io::stdout();
    let mut writer = stdout.lock();

    serve_stream(data_dir, &mut reader, &mut writer)
}

fn serve_stream(
    data_dir: &Path,
    reader: &mut impl BufRead,
    writer: &mut impl Write,
) -> io::Result<()> {
    loop {
        let mut line = String::new();
        let read = reader.read_line(&mut line)?;
        if read == 0 {
            break;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let message = match serde_json::from_str(trimmed) {
            Ok(value) => value,
            Err(error) => {
                write_message(
                    writer,
                    &json!({
                        "jsonrpc": "2.0",
                        "id": null,
                        "error": {
                            "code": -32700,
                            "message": format!("parse error: {error}")
                        }
                    }),
                )?;
                continue;
            }
        };
        let response = handle_message(data_dir, message);
        if response.is_null() {
            continue;
        }
        write_message(writer, &response)?;
    }
    Ok(())
}

fn write_message(writer: &mut impl Write, value: &Value) -> io::Result<()> {
    serde_json::to_writer(&mut *writer, value)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

fn handle_message(data_dir: &Path, message: Value) -> Value {
    tauri::async_runtime::block_on(handle_message_async(data_dir, message))
}

async fn handle_message_async(data_dir: &Path, message: Value) -> Value {
    let id = message.get("id").cloned().unwrap_or(Value::Null);
    let Some(method) = message.get("method").and_then(Value::as_str) else {
        return error(id, -32600, "invalid request", None);
    };

    match method {
        "initialize" => ok(
            id,
            json!({
                "protocolVersion": "2024-11-05",
                "serverInfo": { "name": "mxterm-mcp", "version": "0.1.0" },
                "capabilities": { "tools": {} }
            }),
        ),
        "notifications/initialized" => Value::Null,
        "tools/list" => ok(id, json!({ "tools": tool_schemas(data_dir) })),
        "tools/call" => {
            let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let arguments = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            match call_tool(data_dir, name, arguments).await {
                Ok(value) => ok(
                    id,
                    json!({ "content": [{ "type": "text", "text": value.to_string() }] }),
                ),
                Err(err) => ok(
                    id,
                    json!({
                        "isError": true,
                        "content": [{ "type": "text", "text": serde_json::to_string(&err).unwrap_or_else(|_| err.message) }]
                    }),
                ),
            }
        }
        _ => error(
            id,
            -32601,
            "method not found",
            Some(json!({ "method": method })),
        ),
    }
}

#[derive(Clone)]
struct HttpState {
    data_dir: PathBuf,
    token_hash: String,
    sse_sessions: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<String>>>>,
    rate_limiter: Arc<Mutex<RateLimiter>>,
    /// 并发槽位按来源分池：loopback 与远端各自独立，互不挤占。
    loopback_slots: Arc<Semaphore>,
    remote_slots: Arc<Semaphore>,
}

impl HttpState {
    fn slot_for(&self, source: IpAddr) -> &Arc<Semaphore> {
        if mcp::is_loopback_host(&source.to_string()) {
            &self.loopback_slots
        } else {
            &self.remote_slots
        }
    }

    fn connection_limit_for(source: IpAddr) -> usize {
        if mcp::is_loopback_host(&source.to_string()) {
            MAX_CONNECTIONS_LOOPBACK
        } else {
            MAX_CONNECTIONS_REMOTE
        }
    }
}

struct HttpRequest {
    method: String,
    path: String,
    query: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn serve_http(data_dir: &Path, config: HttpConfig) -> io::Result<()> {
    let state = HttpState {
        data_dir: data_dir.to_path_buf(),
        token_hash: config.token_hash,
        sse_sessions: Arc::new(Mutex::new(HashMap::new())),
        rate_limiter: Arc::new(Mutex::new(RateLimiter::new())),
        loopback_slots: Arc::new(Semaphore::new(MAX_CONNECTIONS_LOOPBACK)),
        remote_slots: Arc::new(Semaphore::new(MAX_CONNECTIONS_REMOTE)),
    };
    tauri::async_runtime::block_on(serve_http_async(config.host, config.port, state))
}

async fn serve_http_async(host: String, port: u16, state: HttpState) -> io::Result<()> {
    let listener = TcpListener::bind((host.as_str(), port)).await?;
    eprintln!("remote MCP HTTP service listening on {host}:{port}");
    loop {
        let (mut stream, peer) = match listener.accept().await {
            Ok(connection) => connection,
            Err(error) => {
                eprintln!("remote MCP HTTP accept error: {error}");
                tokio::time::sleep(Duration::from_millis(250)).await;
                continue;
            }
        };
        // 限流维度取真实来源地址，不能用监听地址：监听在 0.0.0.0 时所有远端请求
        // 都必须按各自来源分别计量。
        let source = peer.ip();
        // 并发槽位在 spawn 之前取得，超限直接拒绝而不是排队：排队会让远端慢连接
        // 堆积，最终把内存耗尽的代价转嫁给自己。permit 随任务存活，连接结束即释放。
        let Ok(permit) = state.slot_for(source).clone().try_acquire_owned() else {
            let _ = write_http_response(
                &mut stream,
                503,
                "Service Unavailable",
                "application/json",
                json!({ "error": "too many connections" })
                    .to_string()
                    .into_bytes(),
                vec![("Retry-After".to_string(), "1".to_string())],
            )
            .await;
            continue;
        };
        let connection_state = state.clone();
        tauri::async_runtime::spawn(async move {
            // permit 由任务持有，任务结束（含 panic）时自动归还槽位。
            let _permit = permit;
            if let Err(error) = handle_http_connection(stream, connection_state, source).await {
                eprintln!("remote MCP HTTP connection error from {peer}: {error}");
            }
        });
    }
}

async fn handle_http_connection(
    mut stream: TcpStream,
    state: HttpState,
    source: IpAddr,
) -> io::Result<()> {
    let Some(request) = read_http_request(&mut stream).await? else {
        return Ok(());
    };

    // 限流放在来源与认证判断之前，且对 OPTIONS 预检同样生效：无 token / 错误 token
    // 的暴力尝试也必须有成本，预检请求同样要计入来源额度。
    let decision = state
        .rate_limiter
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .check(source, Instant::now());
    if !decision.allowed {
        return write_http_response(
            &mut stream,
            429,
            "Too Many Requests",
            "application/json",
            json!({ "error": "rate limited" }).to_string().into_bytes(),
            rate_limit_headers(&request, decision.retry_after_seconds),
        )
        .await;
    }

    if request.method == "OPTIONS" {
        return write_http_response(
            &mut stream,
            204,
            "No Content",
            "text/plain",
            Vec::new(),
            cors_headers(&request),
        )
        .await;
    }

    if !origin_allowed(&request) {
        return write_http_response(
            &mut stream,
            403,
            "Forbidden",
            "application/json",
            json!({ "error": "origin forbidden" })
                .to_string()
                .into_bytes(),
            cors_headers(&request),
        )
        .await;
    }

    if !request_authorized(&request, &state.token_hash) {
        state
            .rate_limiter
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .record_auth_failure(source, Instant::now());
        return write_http_response(
            &mut stream,
            401,
            "Unauthorized",
            "application/json",
            json!({ "error": "unauthorized" }).to_string().into_bytes(),
            cors_headers(&request),
        )
        .await;
    }
    state
        .rate_limiter
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .record_auth_success(source, Instant::now());

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/health") => {
            write_http_response(
                &mut stream,
                200,
                "OK",
                "application/json",
                json!({ "ok": true, "transport": "mcp-http" })
                    .to_string()
                    .into_bytes(),
                cors_headers(&request),
            )
            .await
        }
        ("POST", "/mcp") => handle_streamable_http_post(&mut stream, request, state).await,
        ("GET", "/mcp") => handle_streamable_http_sse(&mut stream, &request).await,
        ("GET", "/sse") => handle_legacy_sse(&mut stream, &request, state).await,
        ("POST", "/messages") => handle_legacy_message(&mut stream, request, state).await,
        _ => {
            write_http_response(
                &mut stream,
                404,
                "Not Found",
                "application/json",
                json!({ "error": "not found" }).to_string().into_bytes(),
                cors_headers(&request),
            )
            .await
        }
    }
}

async fn handle_streamable_http_post(
    stream: &mut TcpStream,
    request: HttpRequest,
    state: HttpState,
) -> io::Result<()> {
    let message = match serde_json::from_slice::<Value>(&request.body) {
        Ok(value) => value,
        Err(parse_error) => {
            return write_http_response(
                stream,
                400,
                "Bad Request",
                "application/json",
                error(
                    Value::Null,
                    -32700,
                    &format!("parse error: {parse_error}"),
                    None,
                )
                .to_string()
                .into_bytes(),
                cors_headers(&request),
            )
            .await;
        }
    };
    let initialize = message
        .get("method")
        .and_then(Value::as_str)
        .is_some_and(|method| method == "initialize");
    let response = handle_message_async(&state.data_dir, message).await;
    if response.is_null() {
        return write_http_response(
            stream,
            202,
            "Accepted",
            "text/plain",
            Vec::new(),
            cors_headers(&request),
        )
        .await;
    }
    let mut headers = cors_headers(&request);
    if initialize {
        headers.push((
            "MCP-Session-Id".to_string(),
            uuid::Uuid::new_v4().to_string(),
        ));
    }
    write_http_response(
        stream,
        200,
        "OK",
        "application/json",
        response.to_string().into_bytes(),
        headers,
    )
    .await
}

async fn handle_streamable_http_sse(
    stream: &mut TcpStream,
    request: &HttpRequest,
) -> io::Result<()> {
    write_sse_headers(stream, cors_headers(request)).await?;
    stream.write_all(b"event: ready\ndata: {}\n\n").await?;
    loop {
        tokio::time::sleep(Duration::from_secs(15)).await;
        if stream.write_all(b": ping\n\n").await.is_err() {
            break;
        }
        let _ = stream.flush().await;
    }
    Ok(())
}

async fn handle_legacy_sse(
    stream: &mut TcpStream,
    request: &HttpRequest,
    state: HttpState,
) -> io::Result<()> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    {
        let mut sessions = state
            .sse_sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        sessions.insert(session_id.clone(), tx);
    }

    write_sse_headers(stream, cors_headers(request)).await?;
    let endpoint = format!("/messages?session_id={session_id}");
    write_sse_event(stream, "endpoint", &endpoint).await?;

    loop {
        match timeout(Duration::from_secs(15), rx.recv()).await {
            Ok(Some(message)) => {
                if write_sse_event(stream, "message", &message).await.is_err() {
                    break;
                }
            }
            Ok(None) => break,
            Err(_) => {
                if stream.write_all(b": ping\n\n").await.is_err() {
                    break;
                }
                let _ = stream.flush().await;
            }
        }
    }

    let mut sessions = state
        .sse_sessions
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    sessions.remove(&session_id);
    Ok(())
}

async fn handle_legacy_message(
    stream: &mut TcpStream,
    request: HttpRequest,
    state: HttpState,
) -> io::Result<()> {
    let Some(session_id) = query_param(&request.query, "session_id") else {
        return write_http_response(
            stream,
            400,
            "Bad Request",
            "application/json",
            json!({ "error": "session_id missing" })
                .to_string()
                .into_bytes(),
            cors_headers(&request),
        )
        .await;
    };
    let sender = {
        let sessions = state
            .sse_sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        sessions.get(&session_id).cloned()
    };
    let Some(sender) = sender else {
        return write_http_response(
            stream,
            404,
            "Not Found",
            "application/json",
            json!({ "error": "session not found" })
                .to_string()
                .into_bytes(),
            cors_headers(&request),
        )
        .await;
    };

    let message = match serde_json::from_slice::<Value>(&request.body) {
        Ok(value) => value,
        Err(parse_error) => {
            return write_http_response(
                stream,
                400,
                "Bad Request",
                "application/json",
                error(
                    Value::Null,
                    -32700,
                    &format!("parse error: {parse_error}"),
                    None,
                )
                .to_string()
                .into_bytes(),
                cors_headers(&request),
            )
            .await;
        }
    };
    let response = handle_message_async(&state.data_dir, message).await;
    if !response.is_null() {
        let _ = sender.send(response.to_string());
    }
    write_http_response(
        stream,
        202,
        "Accepted",
        "text/plain",
        Vec::new(),
        cors_headers(&request),
    )
    .await
}

/// 读取并解析一条 HTTP 请求。
///
/// 参数对 `AsyncRead` 泛化（而不是写死 `TcpStream`）是为了让头部/请求体上限这类边界
/// 能用内存管道直接构造验证——超限拒绝是安全边界，必须可回归。
async fn read_http_request<S>(stream: &mut S) -> io::Result<Option<HttpRequest>>
where
    S: AsyncRead + Unpin,
{
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 1024];
    let header_end = loop {
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            return if buffer.is_empty() {
                Ok(None)
            } else {
                invalid_data("incomplete http request")
            };
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > MAX_HTTP_HEADER_BYTES {
            return invalid_data("http header too large");
        }
        if let Some(index) = find_header_end(&buffer) {
            break index;
        }
    };

    let header_text = String::from_utf8(buffer[..header_end].to_vec())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid http header"))?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing request line"))?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing method"))?
        .to_string();
    let target = request_parts
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing target"))?;
    let (path, query) = split_target(target);
    let mut headers = HashMap::new();
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_lowercase(), value.trim().to_string());
        }
    }

    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > MAX_HTTP_BODY_BYTES {
        return invalid_data("http body too large");
    }
    let body_start = header_end + 4;
    let mut body = buffer[body_start..].to_vec();
    while body.len() < content_length {
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            return invalid_data("incomplete http body");
        }
        body.extend_from_slice(&chunk[..read]);
        if body.len() > MAX_HTTP_BODY_BYTES {
            return invalid_data("http body too large");
        }
    }
    body.truncate(content_length);

    Ok(Some(HttpRequest {
        method,
        path,
        query,
        headers,
        body,
    }))
}

fn invalid_data<T>(message: &'static str) -> io::Result<T> {
    Err(io::Error::new(io::ErrorKind::InvalidData, message))
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn split_target(target: &str) -> (String, String) {
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    (path.to_string(), query.to_string())
}

fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|part| {
        let (name, value) = part.split_once('=')?;
        (name == key).then(|| value.to_string())
    })
}

fn request_authorized(request: &HttpRequest, token_hash: &str) -> bool {
    request_token(request)
        .as_deref()
        .is_some_and(|token| mcp::verify_remote_token(token, token_hash))
}

fn request_token(request: &HttpRequest) -> Option<String> {
    if let Some(header) = request.headers.get("authorization") {
        let trimmed = header.trim();
        if let Some(token) = trimmed.strip_prefix("Bearer ") {
            return Some(token.trim().to_string());
        }
        if let Some(token) = trimmed.strip_prefix("bearer ") {
            return Some(token.trim().to_string());
        }
    }
    request
        .headers
        .get("x-mxterm-mcp-token")
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

fn origin_allowed(request: &HttpRequest) -> bool {
    let Some(origin) = request.headers.get("origin") else {
        return true;
    };
    let Some(origin_host) = authority_host(origin_authority(origin)) else {
        return false;
    };
    if mcp::is_loopback_host(origin_host) {
        return true;
    }
    let Some(host) = request.headers.get("host") else {
        return false;
    };
    authority_host(host).is_some_and(|host| host.eq_ignore_ascii_case(origin_host))
}

fn origin_authority(origin: &str) -> &str {
    let without_scheme = origin
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(origin);
    without_scheme.split('/').next().unwrap_or(without_scheme)
}

fn authority_host(authority: &str) -> Option<&str> {
    let value = authority.trim().trim_start_matches('[');
    let value = value.trim_end_matches(']');
    value.split(':').next().filter(|host| !host.is_empty())
}

fn cors_headers(request: &HttpRequest) -> Vec<(String, String)> {
    let allow_origin = request
        .headers
        .get("origin")
        .filter(|_| origin_allowed(request))
        .cloned()
        .unwrap_or_else(|| "*".to_string());
    vec![
        ("Access-Control-Allow-Origin".to_string(), allow_origin),
        (
            "Access-Control-Allow-Headers".to_string(),
            "Authorization, Content-Type, X-MXterm-MCP-Token, MCP-Session-Id".to_string(),
        ),
        (
            "Access-Control-Allow-Methods".to_string(),
            "GET, POST, OPTIONS".to_string(),
        ),
    ]
}

/// 429 响应同时给出 `Retry-After` 与限流暴露头，让调用方知道何时重试，
/// 而不是盲目重试把退避越推越长。
fn rate_limit_headers(request: &HttpRequest, retry_after_seconds: u64) -> Vec<(String, String)> {
    let mut headers = cors_headers(request);
    headers.push(("Retry-After".to_string(), retry_after_seconds.to_string()));
    headers
}

async fn write_http_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    content_type: &str,
    body: Vec<u8>,
    extra_headers: Vec<(String, String)>,
) -> io::Result<()> {
    let mut response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (name, value) in extra_headers {
        response.push_str(&format!("{name}: {value}\r\n"));
    }
    response.push_str("\r\n");
    stream.write_all(response.as_bytes()).await?;
    stream.write_all(&body).await?;
    stream.flush().await
}

async fn write_sse_headers(
    stream: &mut TcpStream,
    extra_headers: Vec<(String, String)>,
) -> io::Result<()> {
    let mut response = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n".to_string();
    for (name, value) in extra_headers {
        response.push_str(&format!("{name}: {value}\r\n"));
    }
    response.push_str("\r\n");
    stream.write_all(response.as_bytes()).await?;
    stream.flush().await
}

async fn write_sse_event(stream: &mut TcpStream, event: &str, data: &str) -> io::Result<()> {
    stream
        .write_all(format!("event: {event}\ndata: {data}\n\n").as_bytes())
        .await?;
    stream.flush().await
}

fn tool_schemas(data_dir: &Path) -> Vec<Value> {
    mcp::repository_for_metadata(data_dir)
        .and_then(|repository| mcp::load_settings(&repository))
        .map(|settings| mcp::tool_schemas_for_settings(&settings))
        .unwrap_or_else(|_| mcp::tool_schemas_for_settings(&mcp::McpSettings::default()))
}

async fn call_tool(
    data_dir: &Path,
    name: &str,
    arguments: Value,
) -> Result<Value, m_xterm_lib::app_error::AppError> {
    mcp::reject_plaintext_credential_args(&arguments)?;
    let metadata_repository = mcp::repository_for_metadata(data_dir)?;
    let settings = mcp::load_settings(&metadata_repository)?;

    match name {
        "get_mxterm_mcp_status" => {
            let summary = if settings.enabled && settings.expose_connections {
                mcp::connection_summary(&metadata_repository, &settings).ok()
            } else {
                None
            };
            Ok(json!({
                "status": mcp::status(&settings),
                "settings": mcp::settings_as_map(&settings),
                "summary": summary,
            }))
        }
        "list_connections" => {
            mcp::ensure_connections_enabled(&settings)?;
            let connections =
                mcp::exposed_connections(&settings, metadata_repository.connection_list()?)
                    .into_iter()
                    .map(mcp::redacted_connection)
                    .collect::<Vec<_>>();
            Ok(json!({ "connections": connections }))
        }
        "search_connections" => {
            mcp::ensure_connections_enabled(&settings)?;
            let query = mcp::value_get_str(&arguments, "query")?;
            let connections =
                mcp::exposed_connections(&settings, metadata_repository.connection_list()?)
                    .into_iter()
                    .map(mcp::redacted_connection)
                    .filter(|connection| mcp::search_matches(connection, query))
                    .collect::<Vec<_>>();
            Ok(json!({ "connections": connections }))
        }
        "get_connection" => {
            mcp::ensure_connections_enabled(&settings)?;
            let connection_id = mcp::value_get_str(&arguments, "connection_id")?;
            let connection = metadata_repository
                .connection_get(connection_id)?
                .filter(|connection| mcp::connection_is_exposed(&settings, &connection.id))
                .filter(mcp::connection_is_supported)
                .map(mcp::redacted_connection)
                .ok_or_else(|| {
                    m_xterm_lib::app_error::AppError::new(
                        "connection_missing",
                        "连接不存在。",
                        format!("connection_id={connection_id}"),
                        false,
                    )
                })?;
            Ok(json!({ "connection": connection }))
        }
        "test_connection" => {
            mcp::test_connection(
                data_dir,
                mcp::value_get_str(&arguments, "connection_id")?,
                &settings,
            )
            .await
        }
        "execute_command" => Ok(json!(
            mcp::execute_command(
                data_dir,
                mcp::value_get_str(&arguments, "connection_id")?,
                mcp::value_get_str(&arguments, "command")?,
                mcp::value_get_u64(&arguments, "timeout_seconds"),
                mcp::value_get_usize(&arguments, "max_output_bytes"),
                mcp::value_get_bool(&arguments, "confirm_dangerous"),
                &settings,
            )
            .await?
        )),
        "server_monitor" => Ok(json!(
            mcp::server_monitor(
                data_dir,
                mcp::value_get_str(&arguments, "connection_id")?,
                &settings,
            )
            .await?
        )),
        "upload_file" => Ok(json!(
            mcp::upload_file(
                data_dir,
                mcp::value_get_str(&arguments, "connection_id")?,
                Path::new(mcp::value_get_str(&arguments, "local_path")?),
                mcp::value_get_str(&arguments, "remote_path")?,
                &settings,
            )
            .await?
        )),
        "download_file" => Ok(json!(
            mcp::download_file(
                data_dir,
                mcp::value_get_str(&arguments, "connection_id")?,
                mcp::value_get_str(&arguments, "remote_path")?,
                Path::new(mcp::value_get_str(&arguments, "local_path")?),
                &settings,
            )
            .await?
        )),
        "upload_directory" => Ok(json!(
            mcp::upload_directory(
                data_dir,
                mcp::value_get_str(&arguments, "connection_id")?,
                Path::new(mcp::value_get_str(&arguments, "local_path")?),
                mcp::value_get_str(&arguments, "remote_path")?,
                &settings,
            )
            .await?
        )),
        "download_directory" => Ok(json!(
            mcp::download_directory(
                data_dir,
                mcp::value_get_str(&arguments, "connection_id")?,
                mcp::value_get_str(&arguments, "remote_path")?,
                Path::new(mcp::value_get_str(&arguments, "local_path")?),
                &settings,
            )
            .await?
        )),
        "execute_script" => Ok(json!(
            mcp::execute_script(
                data_dir,
                mcp::value_get_str(&arguments, "connection_id")?,
                Path::new(mcp::value_get_str(&arguments, "script_path")?),
                mcp::value_get_optional_str(&arguments, "interpreter")?,
                mcp::value_get_optional_str(&arguments, "args")?,
                mcp::value_get_u64(&arguments, "timeout_seconds"),
                mcp::value_get_usize(&arguments, "max_output_bytes"),
                &settings,
            )
            .await?
        )),
        _ => Err(m_xterm_lib::app_error::AppError::new(
            "mcp_tool_unknown",
            "未知 MCP 工具。",
            name,
            false,
        )),
    }
}

fn ok(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error(id: Value, code: i64, message: &str, data: Option<Value>) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message,
            "data": data,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn initialize_message(id: u64) -> String {
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "probe", "version": "1" }
            }
        })
        .to_string()
    }

    #[test]
    fn stdio_initialize_uses_ndjson() {
        let input = format!("{}\n", initialize_message(1));
        let mut reader = BufReader::new(input.as_bytes());
        let mut output = Vec::new();

        serve_stream(Path::new("."), &mut reader, &mut output).unwrap();

        let text = String::from_utf8(output).unwrap();
        assert!(text.ends_with('\n'));
        assert!(!text.contains("Content-Length"));

        let response = serde_json::from_str::<Value>(text.trim()).unwrap();
        assert_eq!(response["id"], json!(1));
        assert_eq!(response["result"]["serverInfo"]["name"], "mxterm-mcp");
    }

    #[test]
    fn malformed_json_returns_parse_error_and_keeps_reading() {
        let input = format!("not-json\n{}\n", initialize_message(2));
        let mut reader = BufReader::new(input.as_bytes());
        let mut output = Vec::new();

        serve_stream(Path::new("."), &mut reader, &mut output).unwrap();

        let lines = String::from_utf8(output).unwrap();
        let responses = lines.lines().collect::<Vec<_>>();
        assert_eq!(responses.len(), 2);

        let parse_error = serde_json::from_str::<Value>(responses[0]).unwrap();
        assert_eq!(parse_error["error"]["code"], json!(-32700));

        let initialize = serde_json::from_str::<Value>(responses[1]).unwrap();
        assert_eq!(initialize["id"], json!(2));
        assert_eq!(initialize["result"]["serverInfo"]["name"], "mxterm-mcp");
    }

    #[test]
    fn http_auth_accepts_bearer_and_custom_token_header() {
        let token = "mx_remote_token";
        let token_hash = mcp::hash_remote_token(token);
        let mut bearer_headers = HashMap::new();
        bearer_headers.insert("authorization".to_string(), format!("Bearer {token}"));
        let bearer_request = HttpRequest {
            method: "POST".to_string(),
            path: "/mcp".to_string(),
            query: String::new(),
            headers: bearer_headers,
            body: Vec::new(),
        };
        assert!(request_authorized(&bearer_request, &token_hash));

        let mut custom_headers = HashMap::new();
        custom_headers.insert("x-mxterm-mcp-token".to_string(), token.to_string());
        let custom_request = HttpRequest {
            method: "POST".to_string(),
            path: "/mcp".to_string(),
            query: String::new(),
            headers: custom_headers,
            body: Vec::new(),
        };
        assert!(request_authorized(&custom_request, &token_hash));
    }

    #[test]
    fn http_auth_rejects_missing_or_wrong_token() {
        let token_hash = mcp::hash_remote_token("mx_remote_token");
        let missing_request = HttpRequest {
            method: "POST".to_string(),
            path: "/mcp".to_string(),
            query: String::new(),
            headers: HashMap::new(),
            body: Vec::new(),
        };
        assert!(!request_authorized(&missing_request, &token_hash));

        let mut headers = HashMap::new();
        headers.insert("authorization".to_string(), "Bearer wrong".to_string());
        let wrong_request = HttpRequest {
            method: "POST".to_string(),
            path: "/mcp".to_string(),
            query: String::new(),
            headers,
            body: Vec::new(),
        };
        assert!(!request_authorized(&wrong_request, &token_hash));
    }

    fn http_request(method: &str, path: &str, headers: &[(&str, &str)]) -> HttpRequest {
        HttpRequest {
            method: method.to_string(),
            path: path.to_string(),
            query: String::new(),
            headers: headers
                .iter()
                .map(|(name, value)| (name.to_string(), value.to_string()))
                .collect(),
            body: Vec::new(),
        }
    }

    /// 用内存管道驱动 `read_http_request`：边界用例不必占用真实端口。
    fn parse_request(payload: &[u8]) -> io::Result<Option<HttpRequest>> {
        let (mut client, mut server) = tokio::io::duplex(payload.len() + 4096);
        let payload = payload.to_vec();
        tauri::async_runtime::block_on(async move {
            client.write_all(&payload).await.unwrap();
            client.shutdown().await.unwrap();
            read_http_request(&mut server).await
        })
    }

    /// Bearer 头大小写、token 前后空白都要容错，但空 token 不能被当成有效凭据。
    #[test]
    fn request_token_trims_supported_header_forms() {
        let lowercase = http_request("POST", "/mcp", &[("authorization", "bearer mx_token")]);
        assert_eq!(request_token(&lowercase).as_deref(), Some("mx_token"));

        let spaced = http_request("POST", "/mcp", &[("x-mxterm-mcp-token", "  mx_token  ")]);
        assert_eq!(request_token(&spaced).as_deref(), Some("mx_token"));

        let empty = http_request("POST", "/mcp", &[("x-mxterm-mcp-token", "   ")]);
        assert_eq!(request_token(&empty), None);

        // `Bearer` 与 token 之间没有空格时不构成凭据头，不能误判为已携带 token。
        let malformed = http_request("POST", "/mcp", &[("authorization", "Bearermx_token")]);
        assert_eq!(request_token(&malformed), None);
    }

    /// 浏览器侧 Origin 门：loopback 来源放行；非 loopback 来源必须与 Host 同源。
    #[test]
    fn http_origin_gate_allows_loopback_and_same_origin_only() {
        // 无 Origin（CLI、原生客户端）必须放行，否则会误伤正常调用方。
        assert!(origin_allowed(&http_request("POST", "/mcp", &[])));

        // loopback 来源（本地工具、桌面 WebView）放行。
        assert!(origin_allowed(&http_request(
            "POST",
            "/mcp",
            &[("origin", "http://127.0.0.1:5173")]
        )));
        assert!(origin_allowed(&http_request(
            "POST",
            "/mcp",
            &[("origin", "http://localhost")]
        )));
        assert!(origin_allowed(&http_request(
            "POST",
            "/mcp",
            &[("origin", "tauri://localhost")]
        )));

        // 非 loopback 来源必须与 Host 同源才放行。
        let same_origin = http_request(
            "POST",
            "/mcp",
            &[
                ("origin", "http://192.168.1.20:8765"),
                ("host", "192.168.1.20:8765"),
            ],
        );
        assert!(origin_allowed(&same_origin));

        let cross_origin = http_request(
            "POST",
            "/mcp",
            &[
                ("origin", "https://evil.example"),
                ("host", "192.168.1.20:8765"),
            ],
        );
        assert!(!origin_allowed(&cross_origin));

        // 缺少 Host 时无法证明同源，必须拒绝而不是放行。
        let no_host = http_request("POST", "/mcp", &[("origin", "https://evil.example")]);
        assert!(!origin_allowed(&no_host));

        // 解析不出 host 的 Origin（`null`）同样拒绝。
        let opaque = http_request(
            "POST",
            "/mcp",
            &[("origin", "null"), ("host", "192.168.1.20:8765")],
        );
        assert!(!origin_allowed(&opaque));
    }

    /// CORS 放行头可以回显来源，但被拒绝的来源绝不能出现在 ACAO 里。
    #[test]
    fn cors_headers_never_echo_denied_origin() {
        let allowed = cors_headers(&http_request(
            "POST",
            "/mcp",
            &[("origin", "http://127.0.0.1:5173")],
        ));
        assert!(allowed
            .iter()
            .any(|(name, value)| name == "Access-Control-Allow-Origin"
                && value == "http://127.0.0.1:5173"));

        let denied = cors_headers(&http_request(
            "POST",
            "/mcp",
            &[
                ("origin", "https://evil.example"),
                ("host", "192.168.1.20:8765"),
            ],
        ));
        assert!(!denied
            .iter()
            .any(|(_, value)| value.contains("evil.example")));
    }

    #[test]
    fn http_request_parses_method_target_headers_and_body() {
        let payload =
            b"POST /mcp?session_id=abc HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 2\r\n\r\n{}";
        let Some(request) = parse_request(payload).unwrap() else {
            panic!("完整请求必须能解析出来");
        };
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/mcp");
        assert_eq!(request.query, "session_id=abc");
        // 头部名统一小写存储，鉴权与来源判断只需查一种写法。
        assert_eq!(
            request.headers.get("host").map(String::as_str),
            Some("127.0.0.1")
        );
        assert_eq!(request.body, b"{}".to_vec());
    }

    /// 请求头超限必须在解析阶段失败，不能无上限地堆积缓冲。
    #[test]
    fn http_header_over_limit_is_rejected() {
        let mut payload = b"POST /mcp HTTP/1.1\r\nX-Pad: ".to_vec();
        payload.extend(std::iter::repeat(b'a').take(MAX_HTTP_HEADER_BYTES + 1));

        match parse_request(&payload) {
            Err(error) => assert_eq!(error.kind(), io::ErrorKind::InvalidData),
            Ok(_) => panic!("超限请求头必须被拒绝"),
        }
    }

    /// 声明的 Content-Length 超限时要立即拒绝：不能因为对方声称 4GB 就分配缓冲。
    #[test]
    fn http_declared_body_over_limit_is_rejected() {
        let payload = format!(
            "POST /mcp HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            MAX_HTTP_BODY_BYTES + 1
        );

        match parse_request(payload.as_bytes()) {
            Err(error) => assert_eq!(error.kind(), io::ErrorKind::InvalidData),
            Ok(_) => panic!("超限请求体必须被拒绝"),
        }
    }

    /// 声明了长度但数据不足时必须报错，不能把半截请求当成完整请求处理。
    #[test]
    fn http_incomplete_body_is_rejected() {
        let payload = b"POST /mcp HTTP/1.1\r\nContent-Length: 10\r\n\r\nabc";

        match parse_request(payload) {
            Err(error) => assert_eq!(error.kind(), io::ErrorKind::InvalidData),
            Ok(_) => panic!("不完整请求体必须被拒绝"),
        }
    }

    fn loopback() -> IpAddr {
        IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)
    }

    fn lan() -> IpAddr {
        IpAddr::V4(std::net::Ipv4Addr::new(192, 168, 1, 20))
    }

    /// 固定窗口额度按来源地址独立计量：同源用完即拒，换源不受影响。
    #[test]
    fn rate_limiter_enforces_per_source_window() {
        let mut limiter = RateLimiter::new();
        let start = Instant::now();
        let limit = limiter.limit_for(loopback());

        for _ in 0..limit {
            assert!(limiter.check(loopback(), start).allowed);
        }
        let blocked = limiter.check(loopback(), start);
        assert!(!blocked.allowed);
        assert!(blocked.retry_after_seconds >= 1);

        // 同一 IP 换一个端口仍是同一来源，不能靠新连接绕过。
        assert!(!limiter.check(loopback(), start).allowed);

        // 其他来源各自计量，不受该 IP 的额度影响。
        assert!(limiter.check(lan(), start).allowed);

        // 窗口滚动后恢复。
        assert!(limiter.check(loopback(), start + RATE_WINDOW).allowed);
    }

    /// 非 loopback 来源必须比 loopback 更严格，且两者都高于自身健康检查频率。
    #[test]
    fn rate_limiter_is_stricter_for_non_loopback_sources() {
        let limiter = RateLimiter::new();
        assert!(limiter.limit_for(lan()) < limiter.limit_for(loopback()));

        // supervisor 每 15 秒探测一次（4 次/分钟），额度必须留出足够余量。
        let health_checks_per_minute = 60 / 15;
        assert!(limiter.limit_for(loopback()) > health_checks_per_minute * 10);
    }

    /// 连续认证失败进入退避：退避内即使带正确 token 也被拒（请求根本走不到认证）。
    #[test]
    fn auth_failures_trigger_bounded_backoff() {
        let mut limiter = RateLimiter::new();
        let start = Instant::now();

        for _ in 0..AUTH_FAILURE_THRESHOLD {
            limiter.record_auth_failure(lan(), start);
        }
        let blocked = limiter.check(lan(), start);
        assert!(!blocked.allowed);
        assert!(blocked.retry_after_seconds <= AUTH_BACKOFF_INITIAL.as_secs());

        // 退避结束后恢复放行。
        assert!(limiter.check(lan(), start + AUTH_BACKOFF_INITIAL).allowed);
    }

    /// 退避上限有界：持续失败不会把等待时间推到上限之外，也不会整型溢出。
    #[test]
    fn auth_backoff_is_capped() {
        let mut limiter = RateLimiter::new();
        let start = Instant::now();

        for _ in 0..64 {
            limiter.record_auth_failure(lan(), start);
        }
        let decision = limiter.check(lan(), start);
        assert!(!decision.allowed);
        assert!(decision.retry_after_seconds <= AUTH_BACKOFF_MAX.as_secs());
    }

    /// 认证成功清零失败计数：合法客户端偶发输错 token 不应被推向退避。
    #[test]
    fn auth_success_resets_failure_counter() {
        let mut limiter = RateLimiter::new();
        let start = Instant::now();

        for _ in 0..AUTH_FAILURE_THRESHOLD - 1 {
            limiter.record_auth_failure(lan(), start);
        }
        limiter.record_auth_success(lan(), start);

        // 再失败一次不应立刻触发退避——计数已清零。
        limiter.record_auth_failure(lan(), start);
        assert!(limiter.check(lan(), start).allowed);
    }

    /// 来源数量超过跟踪上限时，只有长期空闲且未在退避中的条目会被清理。
    #[test]
    fn rate_limiter_prunes_only_idle_entries() {
        let mut limiter = RateLimiter::new();
        let start = Instant::now();
        for index in 0..RATE_MAX_TRACKED_SOURCES + 16 {
            let source = IpAddr::V4(std::net::Ipv4Addr::new(
                10,
                0,
                (index / 256) as u8,
                (index % 256) as u8,
            ));
            limiter.check(source, start);
        }

        // 全部条目都在窗口内，清理不得把它们误删（否则限流形同虚设）。
        limiter.prune(start);
        assert!(limiter.entries.len() > RATE_MAX_TRACKED_SOURCES);

        // 超过空闲期后应被清理。
        limiter.prune(start + RATE_ENTRY_IDLE_TTL + RATE_WINDOW);
        assert!(limiter.entries.is_empty());
    }

    /// 并发槽位按来源分池，远端比 loopback 更受限，且两池互不挤占。
    #[test]
    fn connection_slots_are_separate_and_remote_is_stricter() {
        assert!(
            HttpState::connection_limit_for(lan()) < HttpState::connection_limit_for(loopback())
        );

        let loopback_slots = Arc::new(Semaphore::new(MAX_CONNECTIONS_LOOPBACK));
        let remote_slots = Arc::new(Semaphore::new(MAX_CONNECTIONS_REMOTE));
        let state = HttpState {
            data_dir: PathBuf::from("."),
            token_hash: String::new(),
            sse_sessions: Arc::new(Mutex::new(HashMap::new())),
            rate_limiter: Arc::new(Mutex::new(RateLimiter::new())),
            loopback_slots,
            remote_slots,
        };

        // 远端池占满不影响 loopback 池：本机健康检查不会因远端洪泛而失败。
        let mut remote_permits = Vec::new();
        for _ in 0..MAX_CONNECTIONS_REMOTE {
            remote_permits.push(
                state
                    .slot_for(lan())
                    .clone()
                    .try_acquire_owned()
                    .expect("远端池内的槽位必须可获取"),
            );
        }
        assert!(state.slot_for(lan()).clone().try_acquire_owned().is_err());
        assert!(state
            .slot_for(loopback())
            .clone()
            .try_acquire_owned()
            .is_ok());
        // permit 持有到断言之后，确保上面的「占满」状态成立而不是被提前释放。
        drop(remote_permits);
        assert!(state.slot_for(lan()).clone().try_acquire_owned().is_ok());
    }
}
