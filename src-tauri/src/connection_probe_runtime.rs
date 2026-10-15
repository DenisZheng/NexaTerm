//! Reservations bridge asynchronous IPC without cancel-before-start races.
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::Deserialize;
use tauri::{State, WebviewWindow};
use uuid::Uuid;
use crate::app_error::AppError;
use crate::connection_probe::{ProbeCancellation, ProbeEngine, ProbeKind, ProbeResult};

const MAX_LEASES: usize = 16;
const RESERVATION_TTL: Duration = Duration::from_secs(15);
struct Entry { owner: String, token: ProbeCancellation, started: bool, created: Instant }
type Entries = Arc<Mutex<HashMap<String, Entry>>>;
#[derive(Default)]
pub(crate) struct LocalProbeManager { engine: ProbeEngine, entries: Entries }
struct Lease { id: String, token: ProbeCancellation, entries: Entries }
impl Drop for Lease {
    fn drop(&mut self) {
        self.token.cancel();
        if let Ok(mut entries) = self.entries.lock() { entries.remove(&self.id); }
    }
}
fn error(code: &str) -> AppError { AppError::new(code, "本机诊断操作不可用。", "", true) }
impl LocalProbeManager {
    fn reserve(&self, owner: &str) -> Result<String, AppError> {
        let mut entries = self.entries.lock().map_err(|_| error("local_probe_unavailable"))?;
        entries.retain(|_, entry| entry.started || entry.created.elapsed() < RESERVATION_TTL);
        if entries.len() >= MAX_LEASES { return Err(error("local_probe_busy")); }
        let id = Uuid::new_v4().to_string();
        entries.insert(id.clone(), Entry { owner: owner.to_owned(), token: ProbeCancellation::default(),
            started: false, created: Instant::now() });
        Ok(id)
    }
    fn begin(&self, owner: &str, id: &str) -> Result<Lease, AppError> {
        let mut entries = self.entries.lock().map_err(|_| error("local_probe_unavailable"))?;
        let entry = entries.get_mut(id).filter(|entry| entry.owner == owner)
            .ok_or_else(|| error("local_probe_expired"))?;
        if entry.started { return Err(error("local_probe_duplicate")); }
        if entry.created.elapsed() >= RESERVATION_TTL {
            entries.remove(id);
            return Err(error("local_probe_expired"));
        }
        entry.started = true;
        Ok(Lease { id: id.to_owned(), token: entry.token.clone(), entries: self.entries.clone() })
    }
    fn cancel(&self, owner: &str, id: &str) -> Result<(), AppError> {
        let mut entries = self.entries.lock().map_err(|_| error("local_probe_unavailable"))?;
        if let Some(entry) = entries.get(id).filter(|entry| entry.owner == owner) {
            entry.token.cancel();
            if !entry.started { entries.remove(id); }
        }
        Ok(())
    }
    pub(crate) fn cancel_window(&self, owner: &str) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.retain(|_, entry| {
                if entry.owner == owner { entry.token.cancel(); false } else { true }
            });
        }
    }
}
#[derive(Deserialize)]
pub(crate) struct ProbeRequest { kind: ProbeKind, host: String, port: u16 }
fn require_main(window: &WebviewWindow) -> Result<(), AppError> {
    if window.label() == "main" { Ok(()) } else { Err(error("local_probe_unavailable")) }
}
#[tauri::command]
pub(crate) fn local_probe_reserve(window: WebviewWindow, manager: State<'_, LocalProbeManager>) -> Result<String, AppError> {
    require_main(&window)?;
    manager.reserve(window.label())
}
#[tauri::command]
pub(crate) async fn local_probe_run(window: WebviewWindow, manager: State<'_, LocalProbeManager>,
    reservation_id: String, request: ProbeRequest) -> Result<ProbeResult, AppError> {
    require_main(&window)?;
    let lease = manager.begin(window.label(), &reservation_id)?;
    Ok(manager.engine.probe(request.kind, &request.host, request.port, &lease.token).await)
}
#[tauri::command]
pub(crate) fn local_probe_cancel(window: WebviewWindow, manager: State<'_, LocalProbeManager>, reservation_id: String) -> Result<(), AppError> {
    require_main(&window)?;
    manager.cancel(window.label(), &reservation_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reservation_starts_once_and_drop_releases_entry() {
        let manager = LocalProbeManager::default(); let id = manager.reserve("main").unwrap();
        assert!(manager.begin("other", &id).is_err());
        let lease = manager.begin("main", &id).unwrap();
        assert!(manager.begin("main", &id).is_err());
        drop(lease); assert!(manager.entries.lock().unwrap().is_empty());
        assert!(manager.begin("main", &id).is_err());
    }
    #[test]
    fn cancellation_before_start_prevents_run_and_is_idempotent() {
        let manager = LocalProbeManager::default(); let id = manager.reserve("main").unwrap();
        manager.cancel("other", &id).unwrap(); assert_eq!(manager.entries.lock().unwrap().len(), 1);
        manager.cancel("main", &id).unwrap(); manager.cancel("main", &id).unwrap();
        assert!(manager.begin("main", &id).is_err());
    }
    #[test]
    fn window_cleanup_cancels_active_lease_without_affecting_other_owner() {
        let manager = LocalProbeManager::default(); let id = manager.reserve("main").unwrap();
        let other = manager.reserve("other").unwrap(); let lease = manager.begin("main", &id).unwrap();
        manager.cancel_window("main");
        assert!(lease.token.is_cancelled()); assert!(manager.begin("other", &other).is_ok());
    }
    #[test]
    fn active_cancel_signals_token_but_keeps_lease_until_drop() {
        let manager = LocalProbeManager::default(); let id = manager.reserve("main").unwrap();
        let lease = manager.begin("main", &id).unwrap(); manager.cancel("main", &id).unwrap();
        assert!(lease.token.is_cancelled()); assert_eq!(manager.entries.lock().unwrap().len(), 1);
        drop(lease); assert!(manager.entries.lock().unwrap().is_empty());
    }
    #[test]
    fn reservations_are_bounded_and_expired_unused_entries_are_pruned() {
        let manager = LocalProbeManager::default();
        for _ in 0..MAX_LEASES { manager.reserve("main").unwrap(); }
        assert!(manager.reserve("main").is_err());
        let mut entries = manager.entries.lock().unwrap();
        for entry in entries.values_mut() { entry.created = Instant::now() - RESERVATION_TTL; }
        drop(entries); assert!(manager.reserve("main").is_ok());
        assert_eq!(manager.entries.lock().unwrap().len(), 1);
    }
    #[test]
    fn expired_reservation_cannot_start() {
        let manager = LocalProbeManager::default(); let id = manager.reserve("main").unwrap();
        manager.entries.lock().unwrap().get_mut(&id).unwrap().created = Instant::now() - RESERVATION_TTL;
        assert!(manager.begin("main", &id).is_err()); assert!(manager.entries.lock().unwrap().is_empty());
    }
}
