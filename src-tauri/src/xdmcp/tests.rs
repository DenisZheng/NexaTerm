use super::*;
use std::{fs, path::{Path, PathBuf}, process::Command, sync::{MutexGuard, OnceLock}};
static PROCESS_TESTS: Mutex<()> = Mutex::new(());
#[path="../../test-fixtures/xdmcp_observed_process.rs"] mod observed_process;
use observed_process::ObservedProcess;
fn runtime() -> tokio::runtime::Runtime { tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap() }
fn fixture() -> PathBuf {
    static BINARY: OnceLock<PathBuf> = OnceLock::new();
    BINARY.get_or_init(|| {
        let dir = std::env::temp_dir().join(format!("nexaterm xdmcp fixture-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let binary = dir.join(if cfg!(windows) { "fixture.exe" } else { "fixture" });
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("test-fixtures/xdmcp_process.rs");
        let output = Command::new(std::env::var_os("RUSTC").unwrap_or("rustc".into()))
            .args(["--edition=2021", "-o"]).arg(&binary).arg(source).output().unwrap();
        assert!(output.status.success(), "native fixture compilation failed"); binary
    }).clone()
}
fn setup() -> (MutexGuard<'static, ()>, XdmcpManager, LaunchRequest) {
    let guard = PROCESS_TESTS.lock().unwrap_or_else(|e| e.into_inner());
    let binary = fixture();
    // A prior test's markers must not satisfy a new run's readiness assertion.
    for display in 100..132 { let _ = fs::remove_dir_all(binary.parent().unwrap().join(display.to_string())); }
    (guard, XdmcpManager::default(), LaunchRequest { executable: binary.to_str().unwrap().into(),
        target: "127.0.0.1".into(), local_address: "127.0.0.1".into(), allow_external: true, allow_network: true })
}
fn markers(display: u16) -> PathBuf { fixture().parent().unwrap().join(display.to_string()) }
async fn until(mut predicate: impl FnMut() -> bool) {
    tokio::time::timeout(Duration::from_secs(8), async {
        while !predicate() { tokio::time::sleep(Duration::from_millis(10)).await; }
    }).await.expect("fixture condition did not complete");
}
async fn terminal(manager: &XdmcpManager, id: &str) -> Status {
    until(|| manager.status("main").unwrap().iter().any(|s| s.id == id && matches!(s.phase, Phase::Closed | Phase::Failed))).await;
    manager.status("main").unwrap().into_iter().find(|s| s.id == id).unwrap()
}
#[test]
fn real_processes_are_isolated_and_stop_waits_for_auth_and_tree_cleanup() {
    let (_guard, manager, request) = setup();
    runtime().block_on(async {
        let a = manager.reserve("main").unwrap(); let b = manager.reserve("main").unwrap();
        let first = manager.start("main", &a, request.clone()).await.unwrap();
        let second = manager.start("main", &b, request.clone()).await.unwrap();
        assert_eq!(first.phase, Phase::Querying); assert_ne!(first.display, second.display);
        let ma = markers(first.display.unwrap()); let mb = markers(second.display.unwrap());
        until(|| ma.join("heartbeat").exists() && mb.join("heartbeat").exists()).await;
        let directory = PathBuf::from(fs::read_to_string(ma.join("directory")).unwrap());
        let child = fs::read_to_string(ma.join("heartbeat")).unwrap();
        let child = ObservedProcess::capture(child.parse().unwrap());
        manager.stop("foreign", &a).await.unwrap(); assert!(directory.exists());
        let serialized = serde_json::to_string(&manager.status("main").unwrap()).unwrap();
        for secret in [request.executable.as_str(), request.target.as_str(), directory.to_str().unwrap()] {
            assert!(!serialized.contains(secret));
        }
        manager.stop("main", &a).await.unwrap(); assert!(!directory.exists());
        assert!(matches!(terminal(&manager, &a).await.phase, Phase::Closed));
        assert!(manager.status("main").unwrap().iter().any(|s| s.id == b && s.phase == Phase::Querying));
        // A descendant must actually be gone, rather than merely deleting its working directory.
        child.assert_stopped();
        let replacement_id = manager.reserve("main").unwrap();
        manager.start("main", &replacement_id, request.clone()).await.unwrap();
        manager.stop("main", &a).await.unwrap();
        assert!(manager.status("main").unwrap().iter().any(|s| s.id == replacement_id && s.phase == Phase::Querying));
        manager.stop("main", &replacement_id).await.unwrap(); manager.stop("main", &b).await.unwrap();
    });
}
#[test]
fn native_fixture_natural_and_failed_exit_are_not_desktop_success() {
    let (_guard, manager, mut request) = setup();
    runtime().block_on(async {
        for (target, expected) in [("127.0.0.2", Phase::Closed), ("127.0.0.3", Phase::Failed), ("127.0.0.5", Phase::Closed)] {
            request.target = target.into(); let id = manager.reserve("main").unwrap();
            let started = manager.start("main", &id, request.clone()).await.unwrap();
            let marker = markers(started.display.unwrap());
            let child = if target=="127.0.0.5" {
                until(|| marker.join("heartbeat").exists()).await;
                let child=ObservedProcess::capture(fs::read_to_string(marker.join("heartbeat")).unwrap().parse().unwrap());
                fs::write(marker.join("allow-exit"),b"exit").unwrap(); Some(child)
            } else { None };
            let result = terminal(&manager, &id).await; assert_eq!(result.phase, expected);
            let directory = PathBuf::from(fs::read_to_string(marker.join("directory")).unwrap());
            assert!(!directory.exists());
            if let Some(child)=child { child.assert_stopped(); }
            let _ = fs::remove_dir_all(marker);
        }
    });
}
#[test]
fn reservations_and_late_cancel_keep_real_worker_ownership_and_quota() {
    let manager = XdmcpManager::default(); let a = manager.reserve("main").unwrap();
    assert!(manager.begin("other", &a).is_err());
    let lease = manager.begin("main", &a).unwrap(); assert!(manager.begin("main", &a).is_err());
    for _ in 1..MAX_RUNS { manager.reserve("main").unwrap(); }
    assert!(manager.reserve("main").is_err());
    runtime().block_on(async {
        // Simulates an OS operation that cannot return yet: cancelled lease still owns quota.
        assert_eq!(manager.stop("main", &a).await.unwrap_err().code, "xdmcp_stop_pending");
        assert!(lease.cancel.load(Ordering::Acquire)); assert!(manager.reserve("main").is_err());
        drop(lease); assert!(manager.reserve("main").is_ok());
    });
    let manager = XdmcpManager::default(); let id = manager.reserve("main").unwrap();
    manager.inner.lock().unwrap().entries.get_mut(&id).unwrap().created = Instant::now() - LEASE_TTL;
    assert!(manager.begin("main", &id).is_err());
}
#[test]
fn cancelled_reservation_and_shutdown_prevent_late_start_and_release_running_tree() {
    let (_guard, manager, request) = setup();
    runtime().block_on(async {
        let stale = manager.reserve("main").unwrap(); manager.stop("main", &stale).await.unwrap();
        assert_eq!(manager.start("main", &stale, request.clone()).await.unwrap_err().code, "xdmcp_expired");
        let id = manager.reserve("main").unwrap(); let status = manager.start("main", &id, request.clone()).await.unwrap();
        let marker = markers(status.display.unwrap()); until(|| marker.join("heartbeat").exists()).await;
        let directory = PathBuf::from(fs::read_to_string(marker.join("directory")).unwrap());
        manager.shutdown().await; assert!(manager.reserve("main").is_err());
        assert!(!directory.exists()); assert!(manager.inner.lock().unwrap().entries.is_empty());
    });
}
#[test]
fn invalid_fields_missing_consent_and_non_native_files_never_launch() {
    let (_guard, manager, request) = setup();
    runtime().block_on(async {
        for value in ["example.invalid", "0.0.0.0", "224.0.0.1", "255.255.255.255", "127.0.0.1 -ac", "::1"] {
            let mut bad = request.clone(); bad.target = value.into(); let id = manager.reserve("main").unwrap();
            assert_eq!(manager.start("main", &id, bad).await.unwrap_err().code, "xdmcp_invalid_request");
        }
        let mut bad = request.clone(); bad.allow_network = false; let id = manager.reserve("main").unwrap();
        assert_eq!(manager.start("main", &id, bad).await.unwrap_err().code, "xdmcp_consent_required");
        let mut bad = request.clone(); bad.executable = "relative-name".into(); let id = manager.reserve("main").unwrap();
        assert_eq!(manager.start("main", &id, bad).await.unwrap_err().code, "xdmcp_invalid_request");
        let script = fixture().parent().unwrap().join("script"); fs::write(&script, "#!/bin/sh\nexit 0\n").unwrap();
        let mut bad = request.clone(); bad.executable = script.to_str().unwrap().into(); let id = manager.reserve("main").unwrap();
        assert_eq!(manager.start("main", &id, bad).await.unwrap_err().code, "xdmcp_engine_unavailable");
        let value = serde_json::json!({"executable":request.executable,"target":request.target,
            "local_address":request.local_address,"allow_external":true,"allow_network":true,"extra":true});
        assert!(serde_json::from_value::<LaunchRequest>(value).is_err());
    });
}
#[test]
fn auth_file_permissions_fixed_arguments_and_history_are_bounded() {
    let (_guard, manager, request) = setup();
    #[cfg(target_os = "macos")] assert!(!platform::mac_group_has_no_live_members(unsafe { libc::getpgrp() }));
    let directory = platform::RunDirectory::create(123).unwrap();
    let auth = fs::read(directory.path.join("authority")).unwrap();
    assert!(auth.starts_with(&[255, 255, 0, 0, 0, 3, b'1', b'2', b'3']));
    assert_eq!(&auth[auth.len()-18..auth.len()-16], &[0, 16]);
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(fs::metadata(&directory.path).unwrap().permissions().mode() & 0o777, 0o700);
        assert_eq!(fs::metadata(directory.path.join("authority")).unwrap().permissions().mode() & 0o777, 0o600);
    }
    let args = platform::arguments(123, request.target.parse().unwrap(), request.local_address.parse().unwrap(), &directory.path);
    assert_eq!(args[0], ":123"); assert!(!args.iter().any(|a| a == "-ac"));
    assert!(args.windows(2).any(|a| a[0] == "-listen" && a[1] == "tcp"));
    for _ in 0..24 { let id = manager.reserve("main").unwrap(); drop(manager.begin("main", &id).unwrap()); }
    assert_eq!(manager.status("main").unwrap().len(), 16);
}
#[test]
fn exhausted_display_ports_do_not_silently_start_a_process() {
    let (_guard, manager, request) = setup();
    let listeners: Vec<_> = (6100..6132).filter_map(|port| TcpListener::bind((Ipv4Addr::LOCALHOST, port)).ok()).collect();
    runtime().block_on(async {
        let id = manager.reserve("main").unwrap();
        assert_eq!(manager.start("main", &id, request).await.unwrap_err().code, "xdmcp_port_in_use");
        assert_eq!(terminal(&manager, &id).await.phase, Phase::Failed);
    });
    drop(listeners);
}

#[test]
fn dropping_actual_start_future_cancels_late_worker_without_freeing_its_quota() {
    let (_guard, manager, request) = setup();
    let (entered_tx, entered_rx) = std::sync::mpsc::sync_channel(1);
    let (proceed_tx, proceed_rx) = std::sync::mpsc::channel();
    *manager.gate.lock().unwrap() = Some((entered_tx, proceed_rx));
    runtime().block_on(async {
        let id = manager.reserve("main").unwrap();
        let copy = manager.clone(); let worker_id = id.clone();
        let task = tokio::spawn(async move { copy.start("main", &worker_id, request).await });
        until(|| entered_rx.try_recv().is_ok()).await;
        task.abort(); assert!(task.await.unwrap_err().is_cancelled());
        assert!(manager.inner.lock().unwrap().entries.get(&id).unwrap().cancelled.load(Ordering::Acquire));
        for _ in 1..MAX_RUNS { manager.reserve("main").unwrap(); }
        assert!(manager.reserve("main").is_err());
        assert_eq!(manager.stop("main", &id).await.unwrap_err().code, "xdmcp_stop_pending");
        assert!(manager.reserve("main").is_err());
        proceed_tx.send(()).unwrap();
        assert_eq!(terminal(&manager, &id).await.reason, Some("cancelled"));
        assert!(!(100..132).any(|d| markers(d).join("heartbeat").exists()));
        assert!(manager.reserve("main").is_ok());
    });
}
