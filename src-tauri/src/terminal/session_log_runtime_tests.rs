use super::*;
use std::time::{Duration, Instant};

struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("nexaterm-log-runtime-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Directory {
    fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
}

fn finished(logs: &SessionLogs, session: &str) -> CaptureStatus {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let status = logs.status(session).unwrap();
        if !status.state.active() { return status; }
        assert!(Instant::now() < deadline, "worker did not finish");
        std::thread::sleep(Duration::from_millis(1));
    }
}

#[test]
fn utf8_split_at_every_byte_preserves_exact_text() {
    let text = "a中文🙂\r\n\x1b[31m";
    for split in 0..=text.len() {
        let mut decoder = Utf8Chunks::default();
        let mut result = decoder.push(&text.as_bytes()[..split]).unwrap();
        result.push_str(&decoder.push(&text.as_bytes()[split..]).unwrap());
        assert_eq!(result, text);
        assert!(decoder.pending.is_empty());
    }
    let mut decoder = Utf8Chunks::default();
    for byte in text.as_bytes() {
        decoder.push(&[*byte]).unwrap();
        assert!(decoder.pending.len() <= 3);
    }
    assert!(decoder.push(&[0xff]).is_err());
}

#[test]
fn actual_worker_pins_session_and_drains_on_stop() {
    let dir = Directory::new();
    let logs = SessionLogs::default();
    let path = dir.0.join("output.log");
    let start = logs.start("one", path.clone()).unwrap();
    assert!(logs.start("one", dir.0.join("duplicate")).is_err());
    logs.output("other", b"wrong");
    for byte in "中文🙂".as_bytes() { logs.output("one", &[*byte]); }
    assert!(logs.stop("one", "wrong-capture").is_err());
    logs.stop("one", &start.capture_id).unwrap();
    logs.output("one", b"late");
    let result = finished(&logs, "one");
    assert_eq!(result.state, CaptureState::Stopped);
    assert_eq!(result.bytes_written, 10);
    assert_eq!(std::fs::read_to_string(path).unwrap(), "中文🙂");
    assert_eq!(logs.stop("one", &start.capture_id).unwrap().unwrap().state, CaptureState::Stopped);
}

#[test]
fn disconnect_flushes_and_retains_final_status() {
    let dir = Directory::new();
    let logs = SessionLogs::default();
    let path = dir.0.join("output.log");
    logs.start("old", path.clone()).unwrap();
    logs.output("old", b"before");
    logs.close("old");
    logs.output("old", b"after");
    logs.output("new", b"reconnected");
    assert_eq!(finished(&logs, "old").state, CaptureState::Stopped);
    assert_eq!(std::fs::read_to_string(path).unwrap(), "before");
    assert!(logs.status("new").is_none());
}

#[test]
fn existing_destination_is_preserved_and_failure_visible() {
    let dir = Directory::new();
    let logs = SessionLogs::default();
    let path = dir.0.join("existing.log");
    std::fs::write(&path, "keep").unwrap();
    logs.start("one", path.clone()).unwrap();
    assert_eq!(finished(&logs, "one").state, CaptureState::Failed);
    assert_eq!(std::fs::read_to_string(path).unwrap(), "keep");
}

#[test]
fn truncated_or_invalid_utf8_is_an_explicit_failure() {
    for bytes in [vec![0xe4, 0xb8], vec![0xff]] {
        let dir = Directory::new();
        let logs = SessionLogs::default();
        let start = logs.start("one", dir.0.join("output.log")).unwrap();
        logs.output("one", &bytes);
        logs.stop("one", &start.capture_id).unwrap();
        assert_eq!(finished(&logs, "one").state, CaptureState::InvalidEncoding);
    }
}

#[test]
fn full_queue_closes_sender_without_waiting_or_altering_input() {
    let logs = SessionLogs::default();
    let (sender, receiver) = sync_channel(1);
    let status = Arc::new(Mutex::new(CaptureStatus { capture_id: "capture".into(),
        state: CaptureState::Recording, bytes_written: 0 }));
    let overflow = Arc::new(AtomicUsize::new(0));
    logs.entries.lock().unwrap().insert("one".into(), Entry { closed: false, sender: Some(sender),
        status, overflow: overflow.clone() });
    let bytes = vec![b'a'; CHUNK_BYTES * 3];
    logs.output("one", &bytes);
    assert_eq!(bytes.len(), CHUNK_BYTES * 3);
    assert_eq!(receiver.recv().unwrap().len(), CHUNK_BYTES);
    assert!(receiver.recv().is_err());
    assert_eq!(overflow.load(Ordering::SeqCst), 1);
    assert_eq!(logs.status("one").unwrap().state, CaptureState::Stopping);
}

#[test]
fn capacity_counts_still_alive_workers() {
    let dir = Directory::new();
    let logs = SessionLogs::default();
    logs.workers.store(MAX_WORKERS, Ordering::SeqCst);
    let path = dir.0.join("output.log");
    assert!(logs.start("one", path.clone()).is_err());
    assert!(!path.exists());
    assert!(logs.status("one").is_none());
}

#[test]
fn late_stop_cannot_stop_a_new_capture_in_same_session() {
    let dir = Directory::new();
    let logs = SessionLogs::default();
    let old = logs.start("one", dir.0.join("old.log")).unwrap();
    logs.stop("one", &old.capture_id).unwrap();
    finished(&logs, "one");
    let new = logs.start("one", dir.0.join("new.log")).unwrap();
    assert_ne!(old.capture_id, new.capture_id);
    assert!(logs.stop("one", &old.capture_id).is_err());
    logs.stop("one", &new.capture_id).unwrap();
    assert_eq!(finished(&logs, "one").state, CaptureState::Stopped);
}
