//! Explicit, temporary, single-file IPv4 loopback service. No persisted secrets.
use std::collections::VecDeque;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use serde::Serialize;
use tokio::net::TcpSocket;
use tokio::sync::{watch, Semaphore};
use crate::app_error::AppError;

pub(crate) const MAX_BYTES: usize = 16 * 1024 * 1024;
const RESERVATION_TTL: Duration = Duration::from_secs(15);
const START_TIMEOUT: Duration = Duration::from_secs(5);
pub(crate) const SERVICE_TTL: Duration = Duration::from_secs(15 * 60);
const MAX_AUDIT: usize = 64;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AuditKind { Started, Stopped, Expired, StartFailed, Cancelled, RequestOk, RequestDenied, RequestRejected, RequestTimeout, RequestFailed, ServiceFailed }
#[derive(Clone, Serialize)]
pub(crate) struct AuditRecord { sequence: u64, timestamp_ms: u64, kind: AuditKind }
#[derive(Clone, Serialize)]
pub(crate) struct ServiceStatus {
    pub id: String,
    pub phase: &'static str,
    pub port: Option<u16>,
    pub size: Option<usize>,
}
#[derive(Serialize)]
pub(crate) struct StartedService { pub status: ServiceStatus, pub token: String }
struct Entry {
    owner: String, status: ServiceStatus, used: bool, created: Instant,
    cancel: watch::Sender<bool>, done: watch::Sender<bool>,
}
#[derive(Default)]
struct Inner { entry: Option<Entry>, closed: bool, sequence: u64, audit: VecDeque<AuditRecord> }
#[derive(Clone)]
pub(crate) struct FileServiceManager { inner: Arc<Mutex<Inner>>, readers: Arc<Semaphore> }
impl Default for FileServiceManager {
    fn default() -> Self { Self { inner: Arc::new(Mutex::new(Inner::default())), readers: Arc::new(Semaphore::new(1)) } }
}
struct Lease { inner: Arc<Mutex<Inner>>, id: String, cancel: watch::Sender<bool>, event: AuditKind }
impl Drop for Lease {
    fn drop(&mut self) {
        self.cancel.send_replace(true);
        if let Ok(mut inner) = self.inner.lock() {
            if inner.entry.as_ref().is_some_and(|e| e.status.id == self.id) {
                if let Some(entry) = inner.entry.take() { entry.done.send_replace(true); }
                record(&mut inner, self.event);
            }
        }
    }
}
pub(crate) fn error(code: &str) -> AppError { AppError::new(code, "本机文件服务操作未完成。", "", true) }
fn record(inner: &mut Inner, kind: AuditKind) {
    inner.sequence = inner.sequence.saturating_add(1);
    if inner.audit.len() == MAX_AUDIT { inner.audit.pop_front(); }
    inner.audit.push_back(AuditRecord { sequence: inner.sequence,
        timestamp_ms: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64, kind });
}
fn prune(inner: &mut Inner) {
    if inner.entry.as_ref().is_some_and(|e| !e.used && e.created.elapsed() >= RESERVATION_TTL) {
        if let Some(entry) = inner.entry.take() { entry.cancel.send_replace(true); entry.done.send_replace(true); }
        record(inner, AuditKind::Cancelled);
    }
}
pub(crate) async fn cancelled(receiver: &mut watch::Receiver<bool>) {
    if *receiver.borrow() { return; }
    let _ = receiver.changed().await;
}
impl FileServiceManager {
    pub(crate) fn reserve(&self, owner: &str) -> Result<String, AppError> {
        let mut inner = self.inner.lock().map_err(|_| error("file_service_unavailable"))?;
        prune(&mut inner);
        if inner.closed { return Err(error("file_service_unavailable")); }
        if inner.entry.is_some() { return Err(error("file_service_busy")); }
        let id = uuid::Uuid::new_v4().to_string();
        inner.entry = Some(Entry { owner: owner.to_owned(), status: ServiceStatus { id: id.clone(), phase: "reserved", port: None, size: None },
            used: false, created: Instant::now(), cancel: watch::channel(false).0, done: watch::channel(false).0 });
        Ok(id)
    }
    fn begin(&self, owner: &str, id: &str) -> Result<Lease, AppError> {
        let mut inner = self.inner.lock().map_err(|_| error("file_service_unavailable"))?;
        prune(&mut inner);
        let entry = inner.entry.as_mut().filter(|e| e.owner == owner && e.status.id == id)
            .ok_or_else(|| error("file_service_expired"))?;
        if entry.used { return Err(error("file_service_busy")); }
        entry.used = true; entry.status.phase = "starting";
        Ok(Lease { inner: self.inner.clone(), id: id.to_owned(), cancel: entry.cancel.clone(), event: AuditKind::StartFailed })
    }
    pub(crate) async fn start(&self, owner: &str, id: &str, path: String, port: u16) -> Result<StartedService, AppError> {
        let mut lease = self.begin(owner, id)?;
        if port != 0 && port < 1024 { return Err(error("file_service_invalid_port")); }
        let mut cancellation = lease.cancel.subscribe();
        let prepared = async {
            let bytes = self.read_file(path).await?;
            let token = crate::mcp::generate_remote_token().map_err(|_| error("file_service_unavailable"))?;
            let socket = TcpSocket::new_v4().map_err(|_| error("file_service_bind_failed"))?;
            socket.bind(std::net::SocketAddr::from(([127, 0, 0, 1], port))).map_err(|e| bind_error(e.kind()))?;
            let listener = socket.listen(8).map_err(|e| bind_error(e.kind()))?;
            let bound_port = listener.local_addr().map_err(|_| error("file_service_bind_failed"))?.port();
            Ok::<_, AppError>((bytes, token, listener, bound_port))
        };
        let (bytes, token, listener, port) = tokio::select! {
            biased;
            _ = cancelled(&mut cancellation) => { lease.event = AuditKind::Cancelled; return Err(error("file_service_cancelled")); },
            result = tokio::time::timeout(START_TIMEOUT, prepared) => result.map_err(|_| error("file_service_timeout"))??,
        };
        let status = ServiceStatus { id: id.to_owned(), phase: "running", port: Some(port), size: Some(bytes.len()) };
        {
            let mut inner = self.inner.lock().map_err(|_| error("file_service_unavailable"))?;
            let entry = inner.entry.as_mut().filter(|e| e.status.id == id)
                .ok_or_else(|| error("file_service_expired"))?;
            if *entry.cancel.borrow() { return Err(error("file_service_cancelled")); }
            entry.status = status.clone(); record(&mut inner, AuditKind::Started);
        }
        lease.event = AuditKind::Stopped;
        let manager = self.clone(); let server_token = token.clone();
        tokio::spawn(async move {
            lease.event = crate::file_service_http::serve(listener, Arc::new(bytes), server_token, cancellation, manager, SERVICE_TTL).await;
            drop(lease); // listener and request tasks have ended before the stop acknowledgement.
        });
        Ok(StartedService { status, token })
    }
    async fn read_file(&self, path: String) -> Result<Vec<u8>, AppError> {
        if path.is_empty() || path.len() > 4096 || path.contains('\0') { return Err(error("file_service_invalid_file")); }
        self.read_with(move || {
            let metadata = std::fs::symlink_metadata(&path).map_err(|_| error("file_service_read_failed"))?;
            if !metadata.is_file() { return Err(error("file_service_invalid_file")); }
            if metadata.len() > MAX_BYTES as u64 { return Err(error("file_service_too_large")); }
            let file = std::fs::File::open(&path).map_err(|_| error("file_service_read_failed"))?;
            if !file.metadata().map_err(|_| error("file_service_read_failed"))?.is_file() { return Err(error("file_service_invalid_file")); }
            let mut bytes = Vec::new();
            file.take((MAX_BYTES + 1) as u64).read_to_end(&mut bytes).map_err(|_| error("file_service_read_failed"))?;
            if bytes.len() > MAX_BYTES { return Err(error("file_service_too_large")); }
            Ok(bytes)
        }).await
    }
    async fn read_with<F>(&self, read: F) -> Result<Vec<u8>, AppError>
    where F: FnOnce() -> Result<Vec<u8>, AppError> + Send + 'static {
        let permit = self.readers.clone().try_acquire_owned().map_err(|_| error("file_service_busy"))?;
        // An uninterruptible OS read keeps its permit after caller cancellation.
        tokio::task::spawn_blocking(move || { let _permit = permit; read() }).await
            .map_err(|_| error("file_service_read_failed"))?
    }
    fn request_stop(&self, owner: &str, id: &str) -> Result<Option<watch::Receiver<bool>>, AppError> {
        let mut inner = self.inner.lock().map_err(|_| error("file_service_unavailable"))?;
        let Some(entry) = inner.entry.as_mut().filter(|e| e.owner == owner && e.status.id == id) else { return Ok(None); };
        let done = entry.done.subscribe(); entry.cancel.send_replace(true); entry.status.phase = "stopping";
        if !entry.used {
            if let Some(entry) = inner.entry.take() { entry.done.send_replace(true); }
            record(&mut inner, AuditKind::Cancelled);
        }
        Ok(Some(done))
    }
    pub(crate) async fn stop(&self, owner: &str, id: &str) -> Result<(), AppError> {
        if let Some(mut done) = self.request_stop(owner, id)? {
            tokio::time::timeout(Duration::from_secs(2), cancelled(&mut done)).await.map_err(|_| error("file_service_stop_pending"))?;
        }
        Ok(())
    }
    pub(crate) fn status(&self, owner: &str) -> Result<Option<ServiceStatus>, AppError> {
        let mut inner = self.inner.lock().map_err(|_| error("file_service_unavailable"))?; prune(&mut inner);
        Ok(inner.entry.as_ref().filter(|e| e.owner == owner).map(|e| e.status.clone()))
    }
    pub(crate) fn audit(&self) -> Result<Vec<AuditRecord>, AppError> {
        Ok(self.inner.lock().map_err(|_| error("file_service_unavailable"))?.audit.iter().cloned().collect())
    }
    pub(crate) fn record(&self, kind: AuditKind) { if let Ok(mut inner) = self.inner.lock() { record(&mut inner, kind); } }
    pub(crate) fn cancel_window(&self, owner: &str) {
        if owner != "main" { return; }
        let id = if let Ok(mut inner) = self.inner.lock() { inner.closed = true; inner.entry.as_ref().map(|e| e.status.id.clone()) } else { None };
        if let Some(id) = id { let _ = self.request_stop(owner, &id); }
    }
    pub(crate) async fn shutdown(&self) {
        self.cancel_window("main");
        if let Ok(Some(status)) = self.status("main") { let _ = self.stop("main", &status.id).await; }
    }
}
fn bind_error(kind: std::io::ErrorKind) -> AppError {
    error(match kind { std::io::ErrorKind::AddrInUse => "file_service_port_in_use", std::io::ErrorKind::PermissionDenied => "file_service_permission_denied", _ => "file_service_bind_failed" })
}
#[cfg(test)]
#[path = "file_service_tests.rs"]
mod tests;
