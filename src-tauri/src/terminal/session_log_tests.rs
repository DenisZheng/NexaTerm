use super::*;
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Default)]
struct Probe {
    bytes: Vec<u8>,
    flushes: usize,
    drops: usize,
}

struct Sink {
    probe: Rc<RefCell<Probe>>,
    chunk: usize,
    fail_after: Option<usize>,
    interrupt_once: bool,
    fail_flush: bool,
}

impl Write for Sink {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.interrupt_once {
            self.interrupt_once = false;
            return Err(io::ErrorKind::Interrupted.into());
        }
        let mut probe = self.probe.borrow_mut();
        let remaining = self.fail_after.map(|limit| limit.saturating_sub(probe.bytes.len()));
        if remaining == Some(0) {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        let count = bytes.len().min(self.chunk).min(remaining.unwrap_or(usize::MAX));
        probe.bytes.extend_from_slice(&bytes[..count]);
        Ok(count)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.probe.borrow_mut().flushes += 1;
        if self.fail_flush { Err(io::ErrorKind::Other.into()) } else { Ok(()) }
    }
}

impl Drop for Sink {
    fn drop(&mut self) {
        self.probe.borrow_mut().drops += 1;
    }
}

fn sink() -> (Sink, Rc<RefCell<Probe>>) {
    let probe = Rc::new(RefCell::new(Probe::default()));
    (Sink { probe: probe.clone(), chunk: usize::MAX, fail_after: None,
        interrupt_once: false, fail_flush: false }, probe)
}

#[test]
fn preserves_exact_output_and_stop_is_terminal() {
    let (sink, probe) = sink();
    let mut log = SessionLog::new(sink, 128).unwrap();
    let output = "中文\r\n\x1b[31mred\x1b[0m";
    assert_eq!(log.append(output).state, LogState::Recording);
    let stopped = log.stop();
    assert_eq!(stopped.bytes_written, output.len() as u64);
    assert_eq!(stopped.state, LogState::Stopped);
    assert_eq!(log.append("ignored"), stopped);
    assert_eq!(log.stop(), stopped);
    assert_eq!(probe.borrow().bytes, output.as_bytes());
    assert_eq!(probe.borrow().flushes, 1);
    assert_eq!(probe.borrow().drops, 1);
}

#[test]
fn limit_keeps_complete_utf8_prefix_and_never_resumes() {
    let (sink, probe) = sink();
    let mut log = SessionLog::new(sink, 5).unwrap();
    log.append("a");
    let result = log.append("中🙂tail");
    assert_eq!(result, LogStatus { state: LogState::LimitReached, bytes_written: 4 });
    assert_eq!(log.append("x"), result);
    assert_eq!(log.stop(), result);
    assert_eq!(probe.borrow().bytes, "a中".as_bytes());
    assert_eq!(probe.borrow().flushes, 1);
    assert_eq!(probe.borrow().drops, 1);
}

#[test]
fn exact_limit_closes_immediately() {
    let (sink, probe) = sink();
    let mut log = SessionLog::new(sink, 3).unwrap();
    assert_eq!(log.append("中").state, LogState::LimitReached);
    assert_eq!(probe.borrow().drops, 1);
}

#[test]
fn first_character_larger_than_budget_produces_empty_completed_file() {
    let (sink, probe) = sink();
    let mut log = SessionLog::new(sink, 1).unwrap();
    assert_eq!(log.append("中"), LogStatus { state: LogState::LimitReached, bytes_written: 0 });
    assert!(probe.borrow().bytes.is_empty());
}

#[test]
fn empty_output_does_not_stop_capture() {
    let (sink, _) = sink();
    let mut log = SessionLog::new(sink, 1).unwrap();
    assert_eq!(log.append(""), LogStatus { state: LogState::Recording, bytes_written: 0 });
}

#[test]
fn handles_short_and_interrupted_writes_without_duplication() {
    let (mut sink, probe) = sink();
    sink.chunk = 1;
    sink.interrupt_once = true;
    let mut log = SessionLog::new(sink, 20).unwrap();
    assert_eq!(log.append("中abc").bytes_written, 6);
    assert_eq!(probe.borrow().bytes, "中abc".as_bytes());
}

#[test]
fn partial_failure_retains_actual_count_and_closes_without_retry() {
    let (mut sink, probe) = sink();
    sink.fail_after = Some(2);
    let mut log = SessionLog::new(sink, 20).unwrap();
    let failed = log.append("中abc");
    assert_eq!(failed, LogStatus { state: LogState::Failed(io::ErrorKind::PermissionDenied), bytes_written: 2 });
    assert_eq!(log.append("retry"), failed);
    assert_eq!(log.stop(), failed);
    assert_eq!(probe.borrow().bytes, &"中".as_bytes()[..2]);
    assert_eq!(probe.borrow().drops, 1);
}

#[test]
fn zero_write_is_failure_not_infinite_loop() {
    let (mut sink, _) = sink();
    sink.chunk = 0;
    let mut log = SessionLog::new(sink, 20).unwrap();
    assert_eq!(log.append("x").state, LogState::Failed(io::ErrorKind::WriteZero));
}

#[test]
fn flush_failure_overrides_both_stop_and_limit() {
    for hit_limit in [false, true] {
        let (mut sink, probe) = sink();
        sink.fail_flush = true;
        let mut log = SessionLog::new(sink, 2).unwrap();
        log.append(if hit_limit { "ab" } else { "a" });
        assert_eq!(log.stop().state, LogState::Failed(io::ErrorKind::Other));
        assert_eq!(log.stop().state, LogState::Failed(io::ErrorKind::Other));
        assert_eq!(probe.borrow().drops, 1);
        assert_eq!(probe.borrow().flushes, 1);
    }
}

#[test]
fn drop_releases_unstopped_writer() {
    let (sink, probe) = sink();
    drop(SessionLog::new(sink, 20).unwrap());
    assert_eq!(probe.borrow().drops, 1);
}

struct Directory(std::path::PathBuf);
impl Directory {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!("nexaterm-session-log-{}-{}-{}",
            std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed)));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Directory {
    fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
}

#[test]
fn invalid_requests_do_not_create_files() {
    let dir = Directory::new();
    let path = dir.0.join("capture.log");
    for limit in [0, MAX_LOG_BYTES + 1] {
        assert!(matches!(SessionLog::create(&path, limit), Err(io::ErrorKind::InvalidInput)));
        assert!(!path.exists());
    }
    assert!(matches!(SessionLog::create(Path::new("capture.log"), 100), Err(io::ErrorKind::InvalidInput)));
}

#[test]
fn real_file_is_exclusive_and_contains_exact_utf8() {
    let dir = Directory::new();
    let path = dir.0.join("capture.log");
    let mut log = SessionLog::create(&path, 100).unwrap();
    log.append("hello 世界\r\n");
    assert_eq!(log.stop().state, LogState::Stopped);
    assert!(matches!(SessionLog::create(&path, 100), Err(io::ErrorKind::AlreadyExists)));
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello 世界\r\n");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
    }
}

#[cfg(unix)]
#[test]
fn existing_and_dangling_symlinks_are_not_followed() {
    let dir = Directory::new();
    let target = dir.0.join("target");
    let link = dir.0.join("link");
    std::os::unix::fs::symlink(&target, &link).unwrap();
    assert!(matches!(SessionLog::create(&link, 100), Err(io::ErrorKind::AlreadyExists)));
    assert!(!target.exists());
    std::fs::write(&target, "keep").unwrap();
    assert!(matches!(SessionLog::create(&link, 100), Err(io::ErrorKind::AlreadyExists)));
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "keep");
}
