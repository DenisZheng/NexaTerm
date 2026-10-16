//! X1: explicitly selected external engine. Bundled/desktop support is not implied.
use std::collections::{HashMap, VecDeque};
use std::net::{Ipv4Addr, TcpListener};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tokio::sync::{oneshot, watch};
use crate::app_error::AppError;
mod platform;
#[cfg(windows)] mod windows;
#[cfg(test)] mod tests;
const MAX_RUNS: usize = 4;
const LEASE_TTL: Duration = Duration::from_secs(15);
const START_TIMEOUT: Duration = Duration::from_secs(15);
const STOP_TIMEOUT: Duration = Duration::from_secs(2);
const POLL: Duration = Duration::from_millis(25);

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct LaunchRequest {
    pub executable: String, pub target: String, pub local_address: String,
    pub allow_external: bool, pub allow_network: bool,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Phase { Reserved, Starting, Querying, Stopping, Closed, Failed }
#[derive(Clone, Debug, Serialize)]
pub(crate) struct Status {
    pub id: String, pub phase: Phase, pub display: Option<u16>, pub reason: Option<&'static str>,
}
#[derive(Serialize)]
pub(crate) struct Capability {
    pub bundled: bool, pub external: bool, pub desktop_verified: bool, pub reason: &'static str,
}
pub(crate) fn capability() -> Capability {
    Capability { bundled: false, external: cfg!(any(windows, target_os = "linux")),
        desktop_verified: false, reason: if cfg!(any(windows, target_os = "linux")) { "engine_selection_required" } else { "platform_unavailable" } }
}
pub(crate) fn error(code: &'static str) -> AppError {
    AppError::new(&format!("xdmcp_{code}"), "XDMCP 操作未完成。", "", true)
}
struct Entry {
    owner: String, status: Status, used: bool, created: Instant,
    cancelled: Arc<AtomicBool>, done: watch::Sender<bool>,
}
#[derive(Default)]
struct Inner { entries: HashMap<String, Entry>, recent: VecDeque<(String, Status)>, closed: bool }
#[derive(Clone, Default)]
pub(crate) struct XdmcpManager {
    inner: Arc<Mutex<Inner>>,
    #[cfg(test)] gate: Arc<Mutex<Option<(std::sync::mpsc::SyncSender<()>, std::sync::mpsc::Receiver<()>)>>>,
}
struct Lease { manager: XdmcpManager, id: String, owner: String, cancel: Arc<AtomicBool>, reason: &'static str }
impl Lease {
    fn update(&self, phase: Phase, display: Option<u16>) -> Option<Status> {
        let mut inner = self.manager.inner.lock().ok()?;
        let entry = inner.entries.get_mut(&self.id)?;
        entry.status.phase = if self.cancel.load(Ordering::Acquire) { Phase::Stopping } else { phase };
        if display.is_some() { entry.status.display = display; }
        Some(entry.status.clone())
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.manager.inner.lock() {
            if let Some(mut entry) = inner.entries.remove(&self.id) {
                entry.status.phase = if self.reason == "closed" || self.reason == "cancelled" { Phase::Closed } else { Phase::Failed };
                entry.status.reason = Some(self.reason);
                if inner.recent.len() == 16 { inner.recent.pop_front(); }
                inner.recent.push_back((self.owner.clone(), entry.status));
                entry.done.send_replace(true);
            }
        }
    }
}
fn prune(inner: &mut Inner) {
    inner.entries.retain(|_, entry| {
        let keep = entry.used || entry.created.elapsed() < LEASE_TTL;
        if !keep { entry.cancelled.store(true, Ordering::Release); entry.done.send_replace(true); }
        keep
    });
}
impl XdmcpManager {
    pub(crate) fn reserve(&self, owner: &str) -> Result<String, AppError> {
        let mut inner = self.inner.lock().map_err(|_| error("unavailable"))?; prune(&mut inner);
        if inner.closed { return Err(error("unavailable")); }
        if inner.entries.len() >= MAX_RUNS { return Err(error("busy")); }
        let id = uuid::Uuid::new_v4().to_string();
        inner.entries.insert(id.clone(), Entry { owner: owner.to_owned(),
            status: Status { id: id.clone(), phase: Phase::Reserved, display: None, reason: None },
            used: false, created: Instant::now(), cancelled: Arc::new(AtomicBool::new(false)), done: watch::channel(false).0 });
        Ok(id)
    }
    fn begin(&self, owner: &str, id: &str) -> Result<Lease, AppError> {
        let mut inner = self.inner.lock().map_err(|_| error("unavailable"))?; prune(&mut inner);
        let entry = inner.entries.get_mut(id).filter(|e| e.owner == owner).ok_or_else(|| error("expired"))?;
        if entry.used { return Err(error("busy")); }
        entry.used = true; entry.status.phase = Phase::Starting;
        Ok(Lease { manager: self.clone(), owner: owner.to_owned(), id: id.to_owned(),
            cancel: entry.cancelled.clone(), reason: "start_failed" })
    }
    pub(crate) async fn start(&self, owner: &str, id: &str, request: LaunchRequest) -> Result<Status, AppError> {
        let lease = self.begin(owner, id)?;
        let cancel = lease.cancel.clone();
        let (tx, rx) = oneshot::channel();
        // Worker owns lease through blocking filesystem/spawn and real process cleanup.
        std::thread::Builder::new().name("xdmcp-owner".into()).spawn(move || worker(lease, request, tx))
            .map_err(|_| error("start_failed"))?;
        struct CancelOnDrop(Arc<AtomicBool>, bool);
        impl Drop for CancelOnDrop { fn drop(&mut self) { if self.1 { self.0.store(true, Ordering::Release); } } }
        let mut guard = CancelOnDrop(cancel, true);
        let result = tokio::time::timeout(START_TIMEOUT, rx).await
            .map_err(|_| error("timeout"))?.map_err(|_| error("start_failed"))?;
        if result.is_ok() { guard.1 = false; }
        result.map_err(error)
    }
    pub(crate) fn status(&self, owner: &str) -> Result<Vec<Status>, AppError> {
        let mut inner = self.inner.lock().map_err(|_| error("unavailable"))?; prune(&mut inner);
        let mut result: Vec<_> = inner.recent.iter().filter(|(o, _)| o == owner).map(|(_, s)| s.clone()).collect();
        result.extend(inner.entries.values().filter(|e| e.owner == owner).map(|e| e.status.clone()));
        Ok(result)
    }
    pub(crate) async fn stop(&self, owner: &str, id: &str) -> Result<(), AppError> {
        let receiver = {
            let mut inner = self.inner.lock().map_err(|_| error("unavailable"))?;
            let Some(entry) = inner.entries.get_mut(id).filter(|e| e.owner == owner) else { return Ok(()); };
            entry.cancelled.store(true, Ordering::Release);
            if !entry.used { inner.entries.remove(id); return Ok(()); }
            entry.status.phase = Phase::Stopping; entry.done.subscribe()
        };
        let mut receiver = receiver;
        if *receiver.borrow() { return Ok(()); }
        tokio::time::timeout(STOP_TIMEOUT, receiver.changed()).await.map_err(|_| error("stop_pending"))?
            .map_err(|_| error("unavailable"))?;
        Ok(())
    }
    pub(crate) fn cancel_window(&self, owner: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            if owner == "main" { inner.closed = true; }
            inner.entries.retain(|_, e| {
                if e.owner != owner { return true; }
                e.cancelled.store(true, Ordering::Release); e.status.phase = Phase::Stopping;
                e.used
            });
        }
    }
    pub(crate) async fn shutdown(&self) {
        self.cancel_window("main");
        let waiting = async {
            loop {
                if self.inner.lock().map(|i| i.entries.is_empty()).unwrap_or(true) { break; }
                tokio::time::sleep(POLL).await;
            }
        };
        let _ = tokio::time::timeout(STOP_TIMEOUT, waiting).await;
    }
}
fn addresses(request: &LaunchRequest) -> Result<(Ipv4Addr, Ipv4Addr), &'static str> {
    if !request.allow_external || !request.allow_network { return Err("consent_required"); }
    let target: Ipv4Addr = request.target.parse().map_err(|_| "invalid_request")?;
    let local: Ipv4Addr = request.local_address.parse().map_err(|_| "invalid_request")?;
    for address in [target, local] {
        if address.is_unspecified() || address.is_multicast() || address.is_broadcast() { return Err("invalid_request"); }
    }
    Ok((target, local))
}
fn allocate_display(lease: &Lease, local: Ipv4Addr) -> Result<(u16, TcpListener), &'static str> {
    let mut inner = lease.manager.inner.lock().map_err(|_| "unavailable")?;
    for display in 100..132 {
        if inner.entries.values().any(|e| e.status.display == Some(display)) { continue; }
        if let Ok(socket) = TcpListener::bind((local, 6000 + display)) {
            inner.entries.get_mut(&lease.id).ok_or("cancelled")?.status.display = Some(display);
            return Ok((display, socket));
        }
    }
    Err("port_in_use")
}
fn worker(mut lease: Lease, request: LaunchRequest, tx: oneshot::Sender<Result<Status, &'static str>>) {
    #[cfg(test)] {
        let gate = lease.manager.gate.lock().unwrap().take();
        if let Some((entered, proceed)) = gate { let _ = entered.send(()); let _ = proceed.recv(); }
    }
    let prepared = (|| {
        if lease.cancel.load(Ordering::Acquire) { return Err("cancelled"); }
        if !cfg!(any(windows, target_os = "linux", test)) { return Err("unavailable"); }
        let (target, local) = addresses(&request)?;
        let executable = PathBuf::from(&request.executable);
        platform::validate_executable(&executable)?;
        let (display, port_guard) = allocate_display(&lease, local)?;
        let directory = platform::RunDirectory::create(display)?;
        if lease.cancel.load(Ordering::Acquire) { return Err("cancelled"); }
        let args = platform::arguments(display, target, local, &directory.path);
        drop(port_guard); // Engine owns its listener; a bind race becomes engine failure.
        let process = platform::OwnedProcess::spawn(&executable, &args, &directory.path).map_err(|_| "start_failed")?;
        Ok((directory, process, display))
    })();
    let (directory, mut process, display) = match prepared {
        Ok(value) => value,
        Err(reason) => { lease.reason = reason; let _ = tx.send(Err(reason)); return; }
    };
    if lease.cancel.load(Ordering::Acquire) {
        lease.reason = "cancelled"; let _ = tx.send(Err("cancelled"));
    } else if let Some(status) = lease.update(Phase::Querying, Some(display)) {
        if tx.send(Ok(status)).is_err() { lease.cancel.store(true, Ordering::Release); }
    }
    let mut failure_seen = false;
    loop {
        if lease.cancel.load(Ordering::Acquire) {
            lease.update(Phase::Stopping, None); lease.reason = if failure_seen { "start_failed" } else { "cancelled" };
            if process.terminate().is_ok() { break; }
        } else {
            match process.exited() {
                Ok(Some(success)) => {
                    lease.reason = if success { "closed" } else { "start_failed" };
                    // Natural leader exit must also end descendants.
                    if process.terminate().is_ok() { break; }
                }
                Err(_) => { failure_seen = true; lease.cancel.store(true, Ordering::Release); }
                Ok(None) => {},
            }
        }
        std::thread::sleep(POLL);
    }
    drop(process);
    while directory.cleanup().is_err() { lease.update(Phase::Stopping, None); std::thread::sleep(POLL); }
    drop(directory); // cleanup precedes the lease acknowledgement.
}
