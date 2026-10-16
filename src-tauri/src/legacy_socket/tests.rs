use super::*;
use super::fixture::{pair, until};
use std::sync::{Arc, Mutex};
static RESERVED_TEST: Mutex<()> = Mutex::new(());
fn runtime() -> tokio::runtime::Runtime { tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap() }
fn rebound(address: SocketAddr) {
    let socket = TcpSocket::new_v4().unwrap();
    #[cfg(windows)] platform::exclusive(&socket).unwrap();
    socket.bind(address).expect("dropped future retained a bound socket");
}
#[test]
fn reserved_scan_is_bounded_and_never_falls_back_to_high_ports() {
    let cancel = AtomicBool::new(false); let mut attempted = Vec::new();
    let result: Result<(), _> = choose_port(&cancel, |port| { attempted.push(port); Err(io::ErrorKind::AddrInUse.into()) });
    assert_eq!(result, Err(SocketError::PortsBusy)); assert_eq!(attempted, (512..=1023).rev().collect::<Vec<_>>());
    let mut calls = 0;
    let result: Result<(), _> = choose_port(&cancel, |_| { calls += 1; Err(io::ErrorKind::PermissionDenied.into()) });
    assert_eq!(result, Err(SocketError::AccessDenied)); assert_eq!(calls, 512);
    let result: Result<(), _> = choose_port(&cancel, |port| Err(if port % 2 == 0 { io::ErrorKind::AddrInUse } else { io::ErrorKind::PermissionDenied }.into()));
    assert_eq!(result, Err(SocketError::PortsUnavailable));
    // Windows 的独占端口冲突可能返回 EACCES，不能在首个拒绝处误判整段不可用。
    let result = choose_port(&cancel, |port| if port == 1023 { Err(io::ErrorKind::PermissionDenied.into()) } else { Ok(port) });
    assert_eq!(result, Ok(1022));
}
#[test]
fn cancellation_and_invalid_addresses_prevent_socket_work() {
    let result: Result<(), _> = choose_port(&AtomicBool::new(true), |_| panic!("cancelled scan attempted bind"));
    assert_eq!(result, Err(SocketError::Cancelled));
    for address in [Ipv4Addr::UNSPECIFIED, Ipv4Addr::BROADCAST, Ipv4Addr::new(224,0,0,1)] {
        assert_eq!(bind_reserved(address, &AtomicBool::new(false)).unwrap_err(), SocketError::InvalidAddress);
    }
    assert_eq!(bind_reserved(Ipv4Addr::LOCALHOST, &AtomicBool::new(true)).unwrap_err(), SocketError::Cancelled);
}
#[test]
fn real_reserved_socket_is_owned_through_connect_or_reports_actual_access_denial() {
    let _guard = RESERVED_TEST.lock().unwrap(); let cancel = AtomicBool::new(false);
    let a = match bind_reserved(Ipv4Addr::LOCALHOST, &cancel) {
        Ok(socket) => { println!("reserved_source_port: available"); socket },
        Err(SocketError::AccessDenied) => { println!("reserved_source_port: access_denied"); return; },
        Err(error) => panic!("unexpected reserved bind outcome: {error}"),
    };
    let address = a.local_addr().unwrap(); assert!((512..=1023).contains(&address.port()));
    let b = bind_reserved(Ipv4Addr::LOCALHOST, &cancel).unwrap(); assert_ne!(b.local_addr().unwrap(), address);
    let duplicate = TcpSocket::new_v4().unwrap();
    assert!(duplicate.bind(address).is_err()); drop(duplicate); drop(a); rebound(address);
    let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    listener.set_nonblocking(true).unwrap();
    let SocketAddr::V4(target) = listener.local_addr().unwrap() else { unreachable!() };
    let expected = b.local_addr().unwrap();
    let mut connected = runtime().block_on(b.connect(target, &cancel)).unwrap();
    let (mut peer, source) = until(|| match listener.accept() {
        Ok(pair) => Some(pair), Err(error) if error.kind() == io::ErrorKind::WouldBlock => None,
        Err(error) => panic!("fixture accept failed: {error}"),
    });
    peer.set_nonblocking(false).unwrap(); peer.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    assert_eq!(source, expected); assert_eq!(connected.local_addr().unwrap(), expected);
    assert_eq!(connected.peer_addr().unwrap(), SocketAddr::V4(target));
    until(|| connected.write(b"z").unwrap().filter(|n| *n == 1));
    let mut byte = [0_u8]; peer.read_exact(&mut byte).unwrap(); assert_eq!(byte, *b"z");
    connected.close().unwrap(); assert_eq!(peer.read(&mut byte).unwrap(), 0);
}
#[test]
fn cancellation_timeout_and_actual_task_abort_drop_owned_pending_sockets() {
    let rt = runtime();
    for cancelled in [false, true] {
        let socket = TcpSocket::new_v4().unwrap(); socket.bind((Ipv4Addr::LOCALHOST, 0).into()).unwrap();
        let address = socket.local_addr().unwrap(); let cancel = Arc::new(AtomicBool::new(false)); let copy = cancel.clone();
        let thread = if cancelled { Some(std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(15)); copy.store(true, Ordering::Release); })) } else { None };
        let pending = async move { let _owned = socket; std::future::pending::<io::Result<()>>().await };
        let result = rt.block_on(wait_connect(pending, &cancel, Instant::now() + Duration::from_millis(80)));
        assert_eq!(result, Err(if cancelled { SocketError::Cancelled } else { SocketError::Timeout }));
        if let Some(thread) = thread { thread.join().unwrap(); } rebound(address);
    }
    let socket = TcpSocket::new_v4().unwrap(); socket.bind((Ipv4Addr::LOCALHOST, 0).into()).unwrap();
    let address = socket.local_addr().unwrap();
    rt.block_on(async move {
        let task = tokio::spawn(async move {
            let pending = async move { let _owned = socket; std::future::pending::<io::Result<()>>().await };
            wait_connect(pending, &AtomicBool::new(false), Instant::now() + CONNECT_TIMEOUT).await
        });
        tokio::task::yield_now().await; task.abort(); assert!(task.await.unwrap_err().is_cancelled());
    });
    rebound(address);
}
#[test]
fn nonblocking_reads_byte_budgets_and_peer_eof_have_distinct_results() {
    let (mut socket, mut peer) = pair();
    assert_eq!(socket.read(&mut [0;4]).unwrap(), None);
    assert!(!socket.poll_ready().unwrap().urgent);
    assert_eq!(socket.read(&mut []).unwrap_err(), SocketError::InvalidChunk);
    assert_eq!(socket.read(&mut vec![0; MAX_CHUNK+1]).unwrap_err(), SocketError::InvalidChunk);
    assert_eq!(socket.write(&vec![0; MAX_CHUNK+1]).unwrap_err(), SocketError::InvalidChunk);
    peer.write_all(&[0,255,2,128]).unwrap();
    let mut result = Vec::new(); let mut buffer = [0;4];
    until(|| { if let Some(n) = socket.read(&mut buffer).unwrap() { assert_ne!(n,0); result.extend_from_slice(&buffer[..n]); } (result.len()==4).then_some(()) });
    assert_eq!(result, [0,255,2,128]); peer.shutdown(Shutdown::Both).unwrap();
    until(|| socket.read(&mut buffer).unwrap().filter(|n| *n == 0));
}
#[test]
fn native_urgent_mark_and_peek_preserve_normal_stream_boundaries() {
    let (mut socket, mut peer) = pair();
    peer.write_all(b"before").unwrap(); send_urgent_fixture(&peer,0x82); peer.write_all(b"after").unwrap();
    until(|| socket.poll_ready().unwrap().urgent.then_some(()));
    let before = (platform::at_mark(&socket.stream),platform::pending_bytes_fixture(&socket.stream));
    let peek = platform::urgent(&socket.stream,true);
    let peeked = (platform::at_mark(&socket.stream),platform::pending_bytes_fixture(&socket.stream));
    let mut buffer = [0_u8;128]; let prefix = socket.read(&mut buffer);
    let mut normal = Vec::new(); if let Ok(Some(n)) = prefix { normal.extend_from_slice(&buffer[..n]); }
    let middle = (platform::at_mark(&socket.stream),platform::pending_bytes_fixture(&socket.stream));
    let consume = platform::urgent(&socket.stream,false);
    let after = (platform::at_mark(&socket.stream),platform::pending_bytes_fixture(&socket.stream));
    println!("native_mark_probe before={before:?} peek={peek:?} peeked={peeked:?} prefix={prefix:?} middle={middle:?} consume={consume:?} after={after:?}");
    until(|| {
        if let Some(n) = socket.read(&mut buffer).unwrap() { assert_ne!(n,0); normal.extend_from_slice(&buffer[..n]); }
        (normal.len()>=11).then_some(())
    });
    assert_eq!(normal,b"beforeafter"); assert_eq!(peek.unwrap(),Some(0x82)); assert_eq!(consume.unwrap(),Some(0x82));
}
