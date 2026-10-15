use super::*;
use std::sync::atomic::{AtomicBool, Ordering};

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
}

#[test]
fn host_validation_rejects_urls_credentials_shell_and_unbounded_names() {
    for host in ["localhost", "example.invalid", "example.invalid.", "xn--bcher-kva.invalid", "127.0.0.1", "::1"] {
        assert!(valid_host(host));
    }
    for host in ["", ".", " https://example.invalid", "https://example.invalid", "user:password@example.invalid",
        "example.invalid:22", "--help", "a..b", "a\nb", "a b", "$(id)", "[::1]", "例子.invalid"] {
        assert!(!valid_host(host));
    }
    assert!(!valid_host(&"a".repeat(254)));
    assert!(!valid_host(&format!("{}.invalid", "a".repeat(64))));
}

#[test]
fn literal_dns_is_bounded_and_results_do_not_echo_targets() {
    runtime().block_on(async {
        let engine = ProbeEngine::default();
        for host in ["127.0.0.1", "::1"] {
            let result = engine.probe(ProbeKind::Dns, host, 0, &ProbeCancellation::default()).await;
            assert_eq!(result.status, ProbeStatus::Success);
            assert_eq!(result.address_count, 1);
            assert!(!result.addresses_truncated);
            let json = serde_json::to_string(&result).unwrap();
            assert!(!json.contains(host));
            assert!(!json.contains("target"));
            assert!(!json.contains("stdout"));
        }
    });
}

#[test]
fn invalid_input_and_precancel_never_acquire_io_capacity() {
    runtime().block_on(async {
        let engine = ProbeEngine::default();
        let _occupied = engine.operations.clone().acquire_many_owned(MAX_CONCURRENT as u32).await.unwrap();
        let cancellation = ProbeCancellation::default();
        let bad = engine.probe(ProbeKind::Tcp, "user:secret@example.invalid", 22, &cancellation).await;
        assert_eq!(bad.reason, ProbeReason::InvalidHost);
        assert!(!serde_json::to_string(&bad).unwrap().contains("secret"));
        assert_eq!(engine.probe(ProbeKind::Tcp, "127.0.0.1", 0, &cancellation).await.reason, ProbeReason::InvalidPort);
        cancellation.cancel();
        assert_eq!(engine.probe(ProbeKind::Dns, "example.invalid", 0, &cancellation).await.status, ProbeStatus::Cancelled);
    });
}

#[test]
fn operation_limit_is_shared_by_clones_and_released() {
    runtime().block_on(async {
        let engine = ProbeEngine::default();
        let guard = engine.operations.clone().acquire_many_owned(MAX_CONCURRENT as u32).await.unwrap();
        assert_eq!(engine.clone().probe(ProbeKind::Dns, "127.0.0.1", 0, &ProbeCancellation::default()).await.reason, ProbeReason::Busy);
        drop(guard);
        assert_eq!(engine.probe(ProbeKind::Dns, "127.0.0.1", 0, &ProbeCancellation::default()).await.status, ProbeStatus::Success);
        assert_eq!(engine.operations.available_permits(), MAX_CONCURRENT);
    });
}

#[test]
fn loopback_tcp_connects_without_sending_payload_and_closes_socket() {
    runtime().block_on(async {
        use tokio::io::AsyncReadExt;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let engine = ProbeEngine::default();
        let result = engine.probe(ProbeKind::Tcp, "127.0.0.1", port, &ProbeCancellation::default()).await;
        assert_eq!(result.reason, ProbeReason::Connected);
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut byte = [0];
        assert_eq!(tokio::time::timeout(Duration::from_secs(1), stream.read(&mut byte)).await.unwrap().unwrap(), 0);
        assert_eq!(engine.operations.available_permits(), MAX_CONCURRENT);
    });
}

#[test]
fn connection_refusal_is_distinct_from_timeout_without_os_timing_assumptions() {
    runtime().block_on(async {
        for (error, expected) in [
            (std::io::ErrorKind::ConnectionRefused, (ProbeStatus::Failed, ProbeReason::ConnectionRefused)),
            (std::io::ErrorKind::TimedOut, (ProbeStatus::TimedOut, ProbeReason::Deadline)),
        ] {
            let addresses = Addresses { values: vec!["127.0.0.1:22".parse().unwrap()], truncated: false };
            let outcome = connect_addresses_with(addresses, |_| async move {
                Err(std::io::Error::from(error))
            }).await;
            assert_eq!(outcome, expected);
        }
    });
}

struct DropFlag(Arc<AtomicBool>);
impl Drop for DropFlag { fn drop(&mut self) { self.0.store(true, Ordering::SeqCst); } }

#[test]
fn total_deadline_drops_pending_probe_future() {
    runtime().block_on(async {
        let dropped = Arc::new(AtomicBool::new(false));
        let guard = DropFlag(dropped.clone());
        let result = bounded(&ProbeCancellation::default(), Duration::from_millis(10), async move {
            let _guard = guard;
            std::future::pending::<Outcome>().await
        }).await;
        assert_eq!(result, (ProbeStatus::TimedOut, ProbeReason::Deadline));
        assert!(dropped.load(Ordering::SeqCst));
    });
}

#[test]
fn inflight_cancel_drops_pending_future_and_is_sticky() {
    runtime().block_on(async {
        let cancellation = ProbeCancellation::default();
        let clone = cancellation.clone();
        let dropped = Arc::new(AtomicBool::new(false));
        let guard = DropFlag(dropped.clone());
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            bounded(&clone, Duration::from_secs(1), async move {
                let _guard = guard;
                let _ = started_tx.send(());
                std::future::pending::<Outcome>().await
            }).await
        });
        started_rx.await.unwrap();
        cancellation.cancel();
        assert_eq!(task.await.unwrap(), (ProbeStatus::Cancelled, ProbeReason::Cancelled));
        assert!(dropped.load(Ordering::SeqCst));
        assert!(cancellation.is_cancelled());
    });
}

#[test]
fn dropped_resolver_caller_keeps_worker_capacity_until_real_completion() {
    runtime().block_on(async {
        let engine = ProbeEngine { operations: Arc::new(Semaphore::new(1)), resolvers: Arc::new(Semaphore::new(1)) };
        let clone = engine.clone();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
        let task = tokio::spawn(async move { clone.resolve_with(move || {
            let _ = started_tx.send(());
            let _ = release_rx.recv();
            Ok(Addresses { values: vec![], truncated: false })
        }).await });
        started_rx.await.unwrap();
        task.abort();
        assert!(matches!(task.await, Err(error) if error.is_cancelled()));
        assert_eq!(engine.resolvers.available_permits(), 0);
        let busy = engine.resolve_with(|| panic!("must not enqueue another resolver")).await;
        assert!(matches!(busy, Err((ProbeStatus::Unavailable, ProbeReason::Busy))));
        drop(release_tx);
        let permit = tokio::time::timeout(Duration::from_secs(1), engine.resolvers.acquire()).await.unwrap().unwrap();
        drop(permit);
        assert_eq!(engine.resolvers.available_permits(), 1);
    });
}

#[test]
fn address_collection_is_bounded_and_marks_omitted_candidates() {
    let address: SocketAddr = "127.0.0.1:22".parse().unwrap();
    let many = collect_addresses(std::iter::repeat(address));
    assert_eq!(many.values.len(), MAX_ADDRESSES);
    assert!(many.truncated);
    assert!(!collect_addresses(std::iter::repeat(address).take(MAX_ADDRESSES)).truncated);
    runtime().block_on(async {
        let outcome = connect_addresses(Addresses { values: vec![], truncated: true }).await;
        assert_eq!(outcome, (ProbeStatus::Unavailable, ProbeReason::AddressLimit));
    });
}

#[test]
fn resolver_errors_are_classified_without_raw_details_and_release_capacity() {
    runtime().block_on(async {
        let engine = ProbeEngine::default();
        let result = engine.resolve_with(|| Err(std::io::Error::other("private resolver detail"))).await;
        assert!(matches!(result, Err((ProbeStatus::Failed, ProbeReason::ResolutionFailed))));
        assert_eq!(engine.resolvers.available_permits(), MAX_CONCURRENT);
    });
}
