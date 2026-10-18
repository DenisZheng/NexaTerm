use super::*;
use crate::legacy_socket::fixture::{pair, until};
use std::{io::{Read, Write}, net::{Shutdown, SocketAddr, TcpListener as StdListener, TcpStream}, sync::Arc, thread, time::Duration};
const REQUEST: &[u8] = b"local\0remote\0printf exact\0";
fn options() -> ConnectOptions<'static> {
    ConnectOptions { local: Ipv4Addr::LOCALHOST, target: SocketAddrV4::new(Ipv4Addr::LOCALHOST, 514),
        local_user: "local", remote_user: "remote", command: b"printf exact" }
}
fn runtime() -> tokio::runtime::Runtime { tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap() }
fn request(peer: &mut TcpStream, expected: &[u8]) {
    let mut received = vec![0_u8; expected.len()]; peer.read_exact(&mut received).unwrap(); assert_eq!(received, expected);
}
fn eof(peer: &mut TcpStream) { assert_eq!(peer.read(&mut [0_u8]).unwrap(), 0, "retained owned socket"); }
fn listener() -> TcpListener {
    let listener = StdListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap(); listener.set_nonblocking(true).unwrap();
    TcpListener::from_std(listener).unwrap()
}
#[test]
fn invalid_fields_pre_cancel_and_expired_deadline_fail_before_socket_io() {
    let mut o = options(); o.local = Ipv4Addr::UNSPECIFIED; assert_eq!(o.prepare().err(), Some(SocketError::InvalidAddress.into()));
    let mut o = options(); o.target.set_port(0); assert_eq!(o.prepare().err(), Some(SocketError::InvalidAddress.into()));
    let mut o = options(); o.command = b"bad\0command"; assert_eq!(o.prepare().err(), Some(ProtocolError::InvalidCommand.into()));
    let mut o = options(); o.remote_user = "too long username"; assert_eq!(o.prepare().err(), Some(ProtocolError::InvalidUser.into()));
    let rt = runtime();
    assert_eq!(rt.block_on(connect(options(), &AtomicBool::new(true))).err(), Some(SocketError::Cancelled.into()));
    assert_eq!(rt.block_on(connect_until(options(), &AtomicBool::new(false), Instant::now())).err(), Some(SocketError::Timeout.into()));
}
#[test]
fn maximum_command_is_sent_once_in_bounded_chunks_and_ack_tail_preserved() {
    let (main, mut peer) = pair(); let (secondary, mut error_peer) = pair();
    let command = vec![0xff; super::super::MAX_COMMAND_BYTES]; let request_bytes = encode_command("local", "remote", &command).unwrap();
    let expected = request_bytes.clone();
    let server = thread::spawn(move || { request(&mut peer, &expected); peer.write_all(b"\0\0\xfftail").unwrap(); eof(&mut peer); });
    let mut transport = runtime().block_on(exchange(main, secondary, request_bytes, Reply::new(), &AtomicBool::new(false), Instant::now()+Duration::from_secs(2))).unwrap();
    let mut received = Vec::new(); let mut bytes = [0_u8; 2];
    until(|| { if let Some(count) = transport.read_stdout(&mut bytes).unwrap() { assert!(count > 0); received.extend_from_slice(&bytes[..count]); }
        (received.len() == 6).then_some(()) });
    assert_eq!(received, b"\0\xfftail"); transport.close().unwrap(); eof(&mut error_peer); server.join().unwrap();
}
#[test]
fn early_ack_is_invalid_and_fragmented_rejection_stops_command_before_any_write() {
    for reply in [b"\0bad".as_slice(), b"\x01private rejection\n".as_slice()] {
        let (main, mut peer) = pair(); let (secondary, mut error_peer) = pair(); peer.write_all(reply).unwrap();
        until(|| main.poll_ready().unwrap().readable.then_some(()));
        let error = runtime().block_on(exchange(main, secondary, REQUEST.to_vec(), Reply::new(), &AtomicBool::new(false), Instant::now()+Duration::from_secs(2))).err().unwrap();
        assert_eq!(error, NativeError::Protocol(if reply[0] == 0 { ProtocolError::InvalidHandshake } else { ProtocolError::Rejected }));
        assert!(!format!("{error:?} {error}").contains("private")); eof(&mut peer); eof(&mut error_peer);
    }
    let (main, mut peer) = pair(); let (secondary, mut error_peer) = pair(); peer.write_all(b"\x01").unwrap();
    until(|| main.poll_ready().unwrap().readable.then_some(()));
    let server = thread::spawn(move || { thread::sleep(Duration::from_millis(30)); peer.write_all(b"private reason\n").unwrap(); eof(&mut peer); });
    assert_eq!(runtime().block_on(exchange(main, secondary, REQUEST.to_vec(), Reply::new(), &AtomicBool::new(false), Instant::now()+Duration::from_secs(2))).err(), Some(ProtocolError::Rejected.into()));
    eof(&mut error_peer); server.join().unwrap();
}
#[test]
fn callback_wait_observes_primary_rejection_eof_and_invalid_early_ack() {
    for case in 0..4 {
        let (mut main, mut peer) = pair();
        match case { 0 => peer.write_all(b"\x01private rejection\n").unwrap(),
            1 => peer.shutdown(Shutdown::Write).unwrap(), 2 => peer.write_all(b"\0").unwrap(),
            _ => { peer.write_all(&vec![1; super::super::MAX_REJECTION_BYTES+2]).unwrap(); }, }
        let result = runtime().block_on(async { callback(&mut main, listener(), Ipv4Addr::LOCALHOST, &mut Reply::new(), &AtomicBool::new(false), Instant::now()+Duration::from_secs(2)).await });
        assert_eq!(result.err(), Some(NativeError::Protocol(match case { 0 => ProtocolError::Rejected, 1 => ProtocolError::UnexpectedEof,
            2 => ProtocolError::InvalidHandshake, _ => ProtocolError::RejectionTooLong })));
        drop(main); eof(&mut peer);
    }
}
#[test]
fn high_port_callbacks_are_closed_and_bounded_without_authorizing_command() {
    let (mut main, mut peer) = pair();
    runtime().block_on(async {
        let listener = listener(); let address = listener.local_addr().unwrap();
        // 阻塞 fixture peer 在独立线程，不能占住 single-thread reactor。
        let thread = thread::spawn(move || { for _ in 0..MAX_INVALID_CALLBACKS {
            let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2)).unwrap();
            assert!(stream.local_addr().unwrap().port() > 1023); stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap(); eof(&mut stream);
        } });
        assert_eq!(callback(&mut main, listener, Ipv4Addr::LOCALHOST, &mut Reply::new(), &AtomicBool::new(false), Instant::now()+Duration::from_secs(2)).await.err(), Some(ProtocolError::InvalidSecondaryPeer.into()));
        thread.join().unwrap();
    }); drop(main); eof(&mut peer);
}
#[test]
fn cancelling_timing_out_or_aborting_callback_wait_releases_listener_and_primary() {
    for case in 0..3 {
        let (mut main, mut peer) = pair();
        let address = runtime().block_on(async {
            let listener = listener(); let address = listener.local_addr().unwrap();
            let cancel = Arc::new(AtomicBool::new(false)); let copy = cancel.clone();
            let task = tokio::spawn(async move { callback(&mut main, listener, Ipv4Addr::LOCALHOST, &mut Reply::new(), &copy,
                Instant::now()+if case == 2 { Duration::from_millis(100) } else { CONNECT_TIMEOUT }).await });
            tokio::task::yield_now().await;
            if case == 0 { cancel.store(true, Ordering::Release); }
            if case == 1 { task.abort(); }
            let result = tokio::time::timeout(Duration::from_secs(2), task).await.unwrap();
            if case == 1 { assert!(result.err().unwrap().is_cancelled()); }
            else { assert_eq!(result.unwrap().err(), Some(NativeError::Socket(if case == 0 { SocketError::Cancelled } else { SocketError::Timeout }))); }
            address
        });
        eof(&mut peer);
        // listener 未接受任何连接，关闭后可立即重新绑定同一精确地址。
        let rebound = StdListener::bind(address).expect("callback listener retained after completion"); drop(rebound);
    }
}
#[test]
fn cancellation_and_original_deadline_release_both_streams_waiting_for_ack() {
    for cancelled in [false, true] {
        let (main, mut peer) = pair(); let (secondary, mut error_peer) = pair();
        let cancel = Arc::new(AtomicBool::new(false)); let copy = cancel.clone();
        let server = thread::spawn(move || { request(&mut peer, REQUEST); if cancelled { copy.store(true, Ordering::Release); } eof(&mut peer); });
        let error = runtime().block_on(exchange(main, secondary, REQUEST.to_vec(), Reply::new(), &cancel, Instant::now()+Duration::from_millis(150))).err();
        assert_eq!(error, Some(NativeError::Socket(if cancelled { SocketError::Cancelled } else { SocketError::Timeout })));
        eof(&mut error_peer); server.join().unwrap();
    }
}
#[test]
fn aborting_pending_ack_drops_both_sockets_without_background_owner() {
    let (main, mut peer) = pair(); let (secondary, mut error_peer) = pair();
    let (sent, received) = tokio::sync::oneshot::channel();
    let server = thread::spawn(move || { request(&mut peer, REQUEST); sent.send(()).unwrap(); eof(&mut peer); });
    runtime().block_on(async {
        let task = tokio::spawn(async move { exchange(main, secondary, REQUEST.to_vec(), Reply::new(), &AtomicBool::new(false), Instant::now()+CONNECT_TIMEOUT).await });
        tokio::time::timeout(Duration::from_secs(2), received).await.unwrap().unwrap(); task.abort(); assert!(task.await.err().unwrap().is_cancelled());
    }); eof(&mut error_peer); server.join().unwrap();
}
#[test]
fn actual_reserved_listener_main_source_and_verified_callback_transfer_both_streams() {
    let listening = StdListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap(); listening.set_nonblocking(true).unwrap();
    let SocketAddr::V4(target) = listening.local_addr().unwrap() else { unreachable!() };
    let (ready, prepared) = std::sync::mpsc::channel(); let stop = Arc::new(AtomicBool::new(false)); let stopped = stop.clone();
    let server = thread::spawn(move || runtime().block_on(async {
        let callback_socket = match bind_reserved(Ipv4Addr::LOCALHOST, &AtomicBool::new(false)) {
            Ok(socket) => { ready.send(Ok(())).unwrap(); socket },
            Err(error) => { ready.send(Err(error)).unwrap(); return None; },
        };
        let accepted = until(|| match listening.accept() {
            Ok(value) => Some(Some(value)), Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => stopped.load(Ordering::Acquire).then_some(None),
            Err(error) => panic!("fixture main accept failed: {error}"),
        });
        let Some((mut main, source)) = accepted else { return None; };
        assert!((512..=1023).contains(&source.port()));
        main.set_nonblocking(false).unwrap();
        main.set_read_timeout(Some(Duration::from_secs(2))).unwrap(); main.set_write_timeout(Some(Duration::from_secs(2))).unwrap();
        let mut port = Vec::new(); loop { let mut byte = [0_u8]; main.read_exact(&mut byte).unwrap(); if byte[0] == 0 { break; }
            assert!(port.len() < 4); port.push(byte[0]); }
        let port: u16 = std::str::from_utf8(&port).unwrap().parse().unwrap(); assert!((512..=1023).contains(&port));
        main.set_nonblocking(true).unwrap();
        assert!(matches!(main.read(&mut [0_u8]).unwrap_err().kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted), "metadata sent before callback verification");
        main.set_nonblocking(false).unwrap();
        let mut callback = callback_socket.connect(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port), &AtomicBool::new(false)).await.unwrap();
        request(&mut main, REQUEST); main.write_all(b"\0out\0").unwrap();
        let mut sent = 0; until(|| { if let Some(count) = callback.write(&b"\xfferr"[sent..]).unwrap() { assert!(count > 0); sent += count; }
            (sent == 4).then_some(()) });
        let mut input = Vec::new(); main.read_to_end(&mut input).unwrap(); assert_eq!(input, b"stdin\0\xff");
        main.write_all(b"tail").unwrap(); main.shutdown(Shutdown::Write).unwrap();
        let mut signal = [0_u8]; until(|| callback.read(&mut signal).unwrap()); assert_eq!(signal, [2]);
        callback.shutdown_write().unwrap();
        until(|| { match callback.read(&mut signal).unwrap() { Some(0) => Some(()), Some(_) => panic!("unexpected extra signal"), None => None } });
        callback.close().unwrap(); Some((source.port(), port))
    }));
    match prepared.recv_timeout(Duration::from_secs(2)).unwrap() {
        Err(SocketError::AccessDenied) => { assert_eq!(server.join().unwrap(), None);
            println!("rsh_reserved_dual_stream: access_denied; ordinary socket transport fixtures are separate"); return; },
        Err(error) => { server.join().unwrap(); panic!("unexpected callback bind result: {error}"); }, Ok(()) => {},
    }
    let mut o = options(); o.target = target;
    let result = runtime().block_on(connect(o, &AtomicBool::new(false)));
    let mut transport = match result {
        Ok(transport) => transport,
        Err(NativeError::Socket(SocketError::AccessDenied)) => { stop.store(true, Ordering::Release); assert_eq!(server.join().unwrap(), None);
            println!("rsh_reserved_dual_stream: client_access_denied; no high-port fallback"); return; },
        Err(error) => { stop.store(true, Ordering::Release); server.join().unwrap(); panic!("unexpected Rsh establish result: {error}"); },
    };
    let input = b"stdin\0\xff"; let mut written = 0;
    until(|| { if let Some(count) = transport.write_stdin(&input[written..]).unwrap() { assert!(count > 0); written += count; }
        (written == input.len()).then_some(()) });
    transport.close_stdin().unwrap(); until(|| transport.send_signal(super::super::Signal::Interrupt).unwrap());
    let mut stdout = Vec::new(); let mut stderr = Vec::new(); let mut bytes = [0_u8; 2];
    until(|| {
        if let Some(count) = transport.read_stdout(&mut bytes).unwrap() { stdout.extend_from_slice(&bytes[..count]); }
        if let Some(count) = transport.read_stderr(&mut bytes).unwrap() { stderr.extend_from_slice(&bytes[..count]); }
        transport.output_complete().then_some(())
    });
    assert_eq!(stdout, b"out\0tail"); assert_eq!(stderr, b"\xfferr"); transport.close().unwrap();
    let (main_port, callback_port) = server.join().unwrap().unwrap(); assert_ne!(main_port, callback_port);
    println!("rsh_reserved_dual_stream: available; reserved main/listener/callback verified");
}
