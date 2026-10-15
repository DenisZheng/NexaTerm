use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, atomic::{AtomicUsize, Ordering}, mpsc::{sync_channel, SyncSender}};
use serde::Serialize;
use tauri::State;
use crate::app_error::AppError;
use super::{manager::TerminalManager, session_log::{LogState, SessionLog}};

const CHUNK_BYTES: usize = 16 * 1024;
const QUEUE_CHUNKS: usize = 32;
const MAX_WORKERS: usize = 16;
pub const CAPTURE_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureState {
    Starting, Recording, Stopping, Stopped, LimitReached, Overflow, Failed, InvalidEncoding,
}

impl CaptureState {
    fn active(self) -> bool {
        matches!(self, Self::Starting | Self::Recording | Self::Stopping)
    }
}

#[derive(Clone, Serialize)]
pub struct CaptureStatus {
    pub capture_id: String,
    pub state: CaptureState,
    pub bytes_written: u64,
}

struct Entry {
    closed: bool,
    sender: Option<SyncSender<Vec<u8>>>,
    status: Arc<Mutex<CaptureStatus>>,
    overflow: Arc<AtomicUsize>,
}

#[derive(Default)]
pub struct SessionLogs {
    entries: Mutex<HashMap<String, Entry>>,
    workers: Arc<AtomicUsize>,
}

struct WorkerLease(Arc<AtomicUsize>);
impl Drop for WorkerLease {
    fn drop(&mut self) { self.0.fetch_sub(1, Ordering::SeqCst); }
}

fn error(code: &str) -> AppError {
    AppError::new(code, "会话日志操作失败。", code, false)
}

impl SessionLogs {
    // 调用者必须持有 session store 锁，确认仍是受支持的活动实例。
    pub(super) fn start(&self, session: &str, path: PathBuf) -> Result<CaptureStatus, AppError> {
        if !path.is_absolute() { return Err(error("terminal_log_path_invalid")); }
        let mut entries = self.entries.lock().unwrap();
        if entries.get(session).is_some_and(|entry| entry.status.lock().unwrap().state.active()) {
            return Err(error("terminal_log_active"));
        }
        self.workers.fetch_update(Ordering::SeqCst, Ordering::SeqCst,
            |count| (count < MAX_WORKERS).then_some(count + 1))
            .map_err(|_| error("terminal_log_capacity"))?;
        let lease = WorkerLease(self.workers.clone());
        if !entries.contains_key(session) && entries.len() >= 64 {
            if let Some(key) = entries.iter().find(|(_, entry)| entry.closed && !entry.status.lock().unwrap().state.active()).map(|(key, _)| key.clone()) {
                entries.remove(&key);
            } else { return Err(error("terminal_log_capacity")); }
        }
        let initial = CaptureStatus { capture_id: uuid::Uuid::new_v4().to_string(),
            state: CaptureState::Starting, bytes_written: 0 };
        let status = Arc::new(Mutex::new(initial.clone()));
        let overflow = Arc::new(AtomicUsize::new(0));
        let (sender, receiver) = sync_channel::<Vec<u8>>(QUEUE_CHUNKS);
        let worker_status = status.clone();
        let worker_overflow = overflow.clone();
        std::thread::Builder::new().name("session-log".into()).spawn(move || {
            let _lease = lease;
            let mut log = match SessionLog::create(&path, CAPTURE_BYTES) {
                Ok(log) => log,
                Err(_) => { worker_status.lock().unwrap().state = CaptureState::Failed; return; }
            };
            {
                let mut status = worker_status.lock().unwrap();
                if status.state == CaptureState::Starting { status.state = CaptureState::Recording; }
            }
            let mut decoder = Utf8Chunks::default();
            let mut outcome = CaptureState::Stopped;
            for bytes in receiver {
                let text = match decoder.push(&bytes) {
                    Ok(text) => text,
                    Err(()) => { outcome = CaptureState::InvalidEncoding; break; }
                };
                let written = log.append(&text);
                worker_status.lock().unwrap().bytes_written = written.bytes_written;
                match written.state {
                    LogState::Recording => {}
                    LogState::LimitReached => { outcome = CaptureState::LimitReached; break; }
                    _ => { outcome = CaptureState::Failed; break; }
                }
            }
            if outcome == CaptureState::Stopped {
                outcome = if worker_overflow.load(Ordering::SeqCst) != 0 {
                    CaptureState::Overflow
                } else if !decoder.pending.is_empty() {
                    CaptureState::InvalidEncoding
                } else { CaptureState::Stopped };
            }
            if matches!(log.stop().state, LogState::Failed(_)) { outcome = CaptureState::Failed; }
            worker_status.lock().unwrap().state = outcome;
        }).map_err(|_| error("terminal_log_worker_failed"))?;
        entries.insert(session.to_owned(), Entry { closed: false, sender: Some(sender), status, overflow });
        Ok(initial)
    }

    pub fn output(&self, session: &str, bytes: &[u8]) {
        let mut entries = self.entries.lock().unwrap();
        let Some(entry) = entries.get_mut(session) else { return; };
        if !entry.status.lock().unwrap().state.active() {
            entry.sender.take();
            return;
        }
        for chunk in bytes.chunks(CHUNK_BYTES) {
            let Some(sender) = &entry.sender else { break; };
            if sender.try_send(chunk.to_vec()).is_err() {
                entry.overflow.store(1, Ordering::SeqCst);
                entry.sender.take();
                let mut status = entry.status.lock().unwrap();
                if status.state.active() { status.state = CaptureState::Stopping; }
                break;
            }
        }
    }

    pub fn status(&self, session: &str) -> Option<CaptureStatus> {
        self.entries.lock().unwrap().get(session).map(|entry| entry.status.lock().unwrap().clone())
    }

    pub fn stop(&self, session: &str, capture: &str) -> Result<Option<CaptureStatus>, AppError> {
        let mut entries = self.entries.lock().unwrap();
        let Some(entry) = entries.get_mut(session) else { return Ok(None); };
        let mut status = entry.status.lock().unwrap();
        if status.capture_id != capture { return Err(error("terminal_log_stale")); }
        if status.state.active() { status.state = CaptureState::Stopping; }
        entry.sender.take();
        Ok(Some(status.clone()))
    }

    pub fn close(&self, session: &str) {
        // 丢弃 sender 让工作线程排空后 flush；不在终端路径等待磁盘。
        let mut entries = self.entries.lock().unwrap();
        if let Some(entry) = entries.get_mut(session) {
            entry.closed = true;
            entry.sender.take();
            let mut status = entry.status.lock().unwrap();
            if status.state.active() { status.state = CaptureState::Stopping; }
        }
    }
}

#[derive(Default)]
struct Utf8Chunks { pending: Vec<u8> }
impl Utf8Chunks {
    fn push(&mut self, bytes: &[u8]) -> Result<String, ()> {
        self.pending.extend_from_slice(bytes);
        let valid = match std::str::from_utf8(&self.pending) {
            Ok(text) => text.len(),
            Err(error) if error.error_len().is_none() => error.valid_up_to(),
            Err(_) => return Err(()),
        };
        let text = std::str::from_utf8(&self.pending[..valid]).map_err(|_| ())?.to_owned();
        self.pending.drain(..valid);
        Ok(text)
    }
}

#[tauri::command]
pub async fn terminal_log_start(manager: State<'_, TerminalManager>, logs: State<'_, SessionLogs>,
    session_id: String, path: String, acknowledged: bool) -> Result<CaptureStatus, AppError> {
    if !acknowledged { return Err(error("terminal_log_consent_required")); }
    manager.start_log(&logs, &session_id, PathBuf::from(path)).await
}

#[tauri::command]
pub fn terminal_log_status(logs: State<'_, SessionLogs>, session_id: String) -> Option<CaptureStatus> {
    logs.status(&session_id)
}

#[tauri::command]
pub fn terminal_log_stop(logs: State<'_, SessionLogs>, session_id: String,
    capture_id: String) -> Result<Option<CaptureStatus>, AppError> {
    logs.stop(&session_id, &capture_id)
}

#[cfg(test)]
#[path = "session_log_runtime_tests.rs"]
mod tests;
