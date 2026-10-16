//! Small fixed-route HTTP/1.1 transport. No proxy, filesystem paths or request logs.
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use tokio::task::JoinSet;
use crate::file_service::{cancelled, AuditKind, FileServiceManager};
const MAX_HEADER: usize = 8192;
const MAX_CLIENTS: usize = 4;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

pub(crate) async fn serve(listener: TcpListener, bytes: Arc<Vec<u8>>, token: String,
    mut cancellation: watch::Receiver<bool>, manager: FileServiceManager, lifetime: Duration) -> AuditKind {
    let host = format!("127.0.0.1:{}", match listener.local_addr() { Ok(a) => a.port(), Err(_) => return AuditKind::ServiceFailed });
    let host = Arc::new(host); let token = Arc::new(token);
    let expiry = tokio::time::sleep(lifetime); tokio::pin!(expiry);
    let mut tasks = JoinSet::new();
    let outcome = loop {
        tokio::select! {
            biased;
            _ = cancelled(&mut cancellation) => break AuditKind::Stopped,
            _ = &mut expiry => break AuditKind::Expired,
            _ = tasks.join_next(), if !tasks.is_empty() => {},
            accepted = listener.accept(), if tasks.len() < MAX_CLIENTS => {
                let (stream, peer) = match accepted { Ok(value) => value, Err(_) => break AuditKind::ServiceFailed };
                if !peer.ip().is_loopback() { drop(stream); continue; }
                let (bytes, token, host, audit) = (bytes.clone(), token.clone(), host.clone(), manager.clone());
                tasks.spawn(async move {
                    let event = match tokio::time::timeout(REQUEST_TIMEOUT, respond(stream, &bytes, &token, &host)).await {
                        Ok(Ok(event)) => event, Ok(Err(_)) => AuditKind::RequestFailed, Err(_) => AuditKind::RequestTimeout,
                    };
                    audit.record(event);
                });
            }
        }
    };
    drop(listener);
    tasks.shutdown().await;
    outcome
}

async fn respond(mut stream: TcpStream, bytes: &[u8], token: &str, host: &str) -> std::io::Result<AuditKind> {
    let mut header = Vec::new(); let mut chunk = [0_u8; 1024];
    let decision = loop {
        let read = stream.read(&mut chunk).await?;
        if read == 0 { return Ok(AuditKind::RequestRejected); }
        header.extend_from_slice(&chunk[..read]);
        if header.len() > MAX_HEADER { break Err(431); }
        if let Some(end) = header.windows(4).position(|w| w == b"\r\n\r\n") {
            if end + 4 != header.len() { break Err(400); }
            break authorize(&header, token, host);
        }
    };
    let (code, reason, size, send_body, audit) = match decision {
        Ok(head) => (200, "OK", bytes.len(), !head, AuditKind::RequestOk),
        Err(code) => (code, match code { 401 => "Unauthorized", 403 => "Forbidden", 404 => "Not Found", 405 => "Method Not Allowed", 431 => "Request Header Fields Too Large", _ => "Bad Request" }, 0, false,
            if code == 401 || code == 403 { AuditKind::RequestDenied } else { AuditKind::RequestRejected }),
    };
    let response = format!("HTTP/1.1 {code} {reason}\r\nContent-Length: {size}\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=\"download.bin\"\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n");
    stream.write_all(response.as_bytes()).await?;
    if send_body { stream.write_all(bytes).await?; }
    stream.shutdown().await?;
    Ok(audit)
}

fn authorize(header: &[u8], token: &str, expected_host: &str) -> Result<bool, u16> {
    let text = std::str::from_utf8(header).map_err(|_| 400_u16)?;
    if !text.is_ascii() || !text.ends_with("\r\n\r\n") { return Err(400); }
    let mut lines = text[..text.len()-4].split("\r\n");
    let request: Vec<_> = lines.next().unwrap_or_default().split(' ').collect();
    if request.len() != 3 || request[2] != "HTTP/1.1" { return Err(400); }
    let (mut host, mut auth, mut length) = (None, None, None);
    for line in lines {
        let (name, value) = line.split_once(':').ok_or(400_u16)?;
        if name.is_empty() || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') || value.bytes().any(|b| b < 32 && b != b'\t' || b == 127) { return Err(400); }
        let value = value.trim();
        match name.to_ascii_lowercase().as_str() {
            "host" => { if host.replace(value).is_some() { return Err(400); } },
            "authorization" => { if auth.replace(value).is_some() { return Err(400); } },
            "origin" => return Err(403),
            "transfer-encoding" => return Err(400),
            "content-length" => { if length.replace(value).is_some() || value != "0" { return Err(400); } },
            _ => {},
        }
    }
    if host != Some(expected_host) { return Err(403); }
    let candidate = auth.and_then(|v| v.strip_prefix("Bearer ")).ok_or(401_u16)?;
    if !same_token(candidate.as_bytes(), token.as_bytes()) { return Err(401); }
    if request[1] != "/file" { return Err(404); }
    match request[0] { "GET" => Ok(false), "HEAD" => Ok(true), _ => Err(405) }
}
fn same_token(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() { return false; }
    left.iter().zip(right).fold(0_u8, |difference, (a, b)| difference | (a ^ b)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_exact_route_host_and_single_header_token_are_accepted() {
        let valid = "GET /file HTTP/1.1\r\nHost: 127.0.0.1:1234\r\nAuthorization: Bearer token\r\n\r\n";
        assert_eq!(authorize(valid.as_bytes(), "token", "127.0.0.1:1234"), Ok(false));
        assert_eq!(authorize(valid.replacen("GET", "HEAD", 1).as_bytes(), "token", "127.0.0.1:1234"), Ok(true));
        for (from, to, status) in [("/file", "/file?token=token", 404), ("/file", "/../file", 404), ("GET", "POST", 405), ("Bearer token", "Bearer wrong", 401), ("127.0.0.1:1234", "evil.invalid", 403), ("HTTP/1.1", "HTTP/1.0", 400)] {
            assert_eq!(authorize(valid.replacen(from, to, 1).as_bytes(), "token", "127.0.0.1:1234"), Err(status));
        }
        for (extra, status) in [("Origin: http://127.0.0.1:1234", 403), ("Host: 127.0.0.1:1234", 400), ("Authorization: Bearer token", 400), ("Transfer-Encoding: chunked", 400), ("Content-Length: 1", 400), (" Folded: header", 400)] {
            let request = valid.replace("\r\n\r\n", &format!("\r\n{extra}\r\n\r\n"));
            assert_eq!(authorize(request.as_bytes(), "token", "127.0.0.1:1234"), Err(status));
        }
        assert!(!same_token(b"token", b"tokeN"));
        assert!(!same_token(b"token", b"token0"));
    }
}
