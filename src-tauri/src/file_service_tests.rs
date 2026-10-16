use super::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
fn runtime() -> tokio::runtime::Runtime { tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap() }
struct Fixture(std::path::PathBuf);
impl Fixture {
    fn new(content: &[u8]) -> Self {
        let path = std::env::temp_dir().join(format!("nexaterm-file-service-{}", uuid::Uuid::new_v4()));
        std::fs::write(&path, content).unwrap(); Self(path)
    }
    fn path(&self) -> String { self.0.to_str().unwrap().to_owned() }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); } }
async fn request(port: u16, method: &str, token: &str, extra: &str) -> Vec<u8> {
    let mut stream = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port)).await.unwrap();
    stream.write_all(format!("{method} /file HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\n{extra}\r\n").as_bytes()).await.unwrap();
    let mut bytes = Vec::new();
    tokio::time::timeout(Duration::from_secs(2), stream.read_to_end(&mut bytes)).await.unwrap().unwrap(); bytes
}
#[test]
fn actual_loopback_get_head_auth_and_stop_release() {
    runtime().block_on(async {
        let file = Fixture::new(b"private file body"); let manager = FileServiceManager::default();
        let id = manager.reserve("main").unwrap(); let result = manager.start("main", &id, file.path(), 0).await.unwrap();
        let port = result.status.port.unwrap();
        assert!(result.token.len() >= 40);
        assert!(!serde_json::to_string(&manager.status("main").unwrap()).unwrap().contains(&result.token));
        let get = request(port, "GET", &result.token, "").await;
        assert!(get.starts_with(b"HTTP/1.1 200")); assert!(get.ends_with(b"private file body"));
        assert!(String::from_utf8_lossy(&get).contains("Cache-Control: no-store"));
        let head = request(port, "HEAD", &result.token, "").await;
        assert!(head.starts_with(b"HTTP/1.1 200")); assert!(head.ends_with(b"\r\n\r\n"));
        for (token, extra, expected) in [("wrong", "", "401"), (result.token.as_str(), "Origin: https://example.invalid\r\n", "403")] {
            let denied = request(port, "GET", token, extra).await;
            assert!(String::from_utf8_lossy(&denied).starts_with(&format!("HTTP/1.1 {expected}")));
            assert!(!String::from_utf8_lossy(&denied).contains("private file body"));
        }
        manager.stop("other", &id).await.unwrap(); assert!(manager.status("main").unwrap().is_some());
        manager.stop("main", &id).await.unwrap(); assert!(manager.status("main").unwrap().is_none());
        let _rebound = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await.unwrap();
        let audit = serde_json::to_string(&manager.audit().unwrap()).unwrap();
        assert!(audit.contains("started") && audit.contains("stopped") && audit.contains("request_denied"));
        for secret in [result.token.as_str(), file.path().as_str(), "private file body"] { assert!(!audit.contains(secret)); }
    });
}
#[test]
fn snapshot_is_fixed_and_each_start_rotates_token() {
    runtime().block_on(async {
        let file = Fixture::new(b"first"); let manager = FileServiceManager::default();
        let id = manager.reserve("main").unwrap(); let first = manager.start("main", &id, file.path(), 0).await.unwrap();
        std::fs::write(&file.0, b"second").unwrap();
        assert!(request(first.status.port.unwrap(), "GET", &first.token, "").await.ends_with(b"first"));
        manager.stop("main", &id).await.unwrap(); let next = manager.reserve("main").unwrap();
        let second = manager.start("main", &next, file.path(), first.status.port.unwrap()).await.unwrap();
        assert_ne!(first.token, second.token);
        manager.stop("main", &id).await.unwrap(); // stale stop cannot stop the replacement.
        assert!(request(second.status.port.unwrap(), "GET", &second.token, "").await.ends_with(b"second"));
        manager.stop("main", &next).await.unwrap();
    });
}
#[test]
fn reservations_are_single_use_bounded_expiring_and_owner_scoped() {
    let manager = FileServiceManager::default(); let id = manager.reserve("main").unwrap();
    assert!(manager.reserve("main").is_err()); assert!(manager.begin("other", &id).is_err());
    let lease = manager.begin("main", &id).unwrap(); assert!(manager.begin("main", &id).is_err()); drop(lease);
    let id = manager.reserve("main").unwrap();
    manager.inner.lock().unwrap().entry.as_mut().unwrap().created = Instant::now() - RESERVATION_TTL;
    assert!(manager.begin("main", &id).is_err()); assert!(manager.reserve("main").is_ok());
}
#[test]
fn cancellation_before_start_and_window_shutdown_prevent_late_io() {
    runtime().block_on(async {
        let manager = FileServiceManager::default(); let id = manager.reserve("main").unwrap();
        manager.stop("main", &id).await.unwrap(); manager.stop("main", &id).await.unwrap();
        assert!(manager.start("main", &id, "not-opened".into(), 0).await.is_err());
        let file = Fixture::new(b"data"); let id = manager.reserve("main").unwrap();
        let active = manager.start("main", &id, file.path(), 0).await.unwrap();
        let mut pending = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, active.status.port.unwrap())).await.unwrap();
        pending.write_all(b"GET /file").await.unwrap();
        manager.shutdown().await; assert!(manager.status("main").unwrap().is_none());
        assert!(manager.reserve("main").is_err());
        let mut byte = [0_u8];
        let closed = tokio::time::timeout(Duration::from_secs(1), pending.read(&mut byte)).await.unwrap();
        assert!(matches!(closed, Ok(0) | Err(_)));
    });
}
#[test]
fn invalid_files_sizes_ports_and_occupied_port_fail_without_listener() {
    runtime().block_on(async {
        let manager = FileServiceManager::default(); let file = Fixture::new(b"data");
        let occupied = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let cases = [(file.path(), 22, "file_service_invalid_port"), (String::new(), 0, "file_service_invalid_file"),
            (std::env::temp_dir().to_str().unwrap().to_owned(), 0, "file_service_invalid_file"),
            (file.path(), occupied.local_addr().unwrap().port(), "file_service_port_in_use")];
        for (path, port, expected) in cases {
            let id = manager.reserve("main").unwrap();
            assert_eq!(manager.start("main", &id, path, port).await.err().unwrap().code, expected);
            assert!(manager.status("main").unwrap().is_none());
        }
        std::fs::OpenOptions::new().write(true).open(&file.0).unwrap().set_len((MAX_BYTES + 1) as u64).unwrap();
        let id = manager.reserve("main").unwrap();
        assert_eq!(manager.start("main", &id, file.path(), 0).await.err().unwrap().code, "file_service_too_large");
    });
}
#[test]
fn cancelled_os_reader_retains_quota_until_real_completion() {
    runtime().block_on(async {
        let manager = FileServiceManager::default(); let worker = manager.clone();
        let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
        let task = tokio::spawn(async move { worker.read_with(move || {
            let _ = ready_tx.send(()); let _ = release_rx.recv(); Ok(Vec::new())
        }).await });
        ready_rx.await.unwrap(); task.abort(); let _ = task.await;
        assert_eq!(manager.readers.available_permits(), 0);
        assert!(manager.read_with(|| panic!("must not enqueue another file read")).await.is_err());
        drop(release_tx);
        let permit = tokio::time::timeout(Duration::from_secs(1), manager.readers.acquire()).await.unwrap().unwrap(); drop(permit);
    });
}
#[test]
fn audit_is_bounded_and_service_expiry_closes_socket() {
    runtime().block_on(async {
        let manager = FileServiceManager::default();
        for _ in 0..100 { manager.record(AuditKind::RequestDenied); }
        let records = manager.audit().unwrap(); assert_eq!(records.len(), MAX_AUDIT); assert_eq!(records.last().unwrap().sequence, 100);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap(); let port = listener.local_addr().unwrap().port();
        let (_stop, rx) = watch::channel(false);
        assert_eq!(crate::file_service_http::serve(listener, Arc::new(vec![]), "test".into(), rx, manager, Duration::from_millis(10)).await, AuditKind::Expired);
        let _rebound = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await.unwrap();
    });
}
