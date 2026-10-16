use super::*;
use crate::legacy_socket::fixture::{pair, until};
use crate::rlogin_native::ReceiveEvent;
use std::{io::{Read, Write}, net::{Shutdown, SocketAddr, TcpListener, TcpStream}, sync::Arc, thread, time::Duration};
const REQUEST: &[u8] = b"\0local\0remote\0xterm/38400\0";
fn options() -> ConnectOptions<'static> {
    ConnectOptions { local: Ipv4Addr::LOCALHOST, target: SocketAddrV4::new(Ipv4Addr::LOCALHOST, 513),
        local_user: "local", remote_user: "remote", terminal: "xterm", speed: 38400,
        window: WindowSize { rows: 24, columns: 80, x_pixels: 0, y_pixels: 0 } }
}
fn runtime() -> tokio::runtime::Runtime { tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap() }
fn request(peer: &mut TcpStream) {
    let mut bytes = [0_u8; REQUEST.len()]; peer.read_exact(&mut bytes).unwrap(); assert_eq!(bytes.as_slice(), REQUEST);
}
fn eof(peer: &mut TcpStream) { assert_eq!(peer.read(&mut [0_u8]).unwrap(), 0, "adapter retained its socket"); }
fn serving(mut peer: TcpStream, reply: impl FnOnce(&mut TcpStream) + Send + 'static) -> thread::JoinHandle<()> {
    thread::spawn(move || { request(&mut peer); reply(&mut peer); eof(&mut peer); })
}
fn read_data(reader: &mut RloginReader, length: usize) -> Vec<u8> {
    let mut bytes = Vec::new(); let mut buffer = [0_u8; 2];
    until(|| {
        match reader.poll(&mut buffer, true).unwrap() {
            ReceiveEvent::Data(count) => bytes.extend_from_slice(&buffer[..count]),
            ReceiveEvent::Idle => {}, event => panic!("unexpected fixture event: {event:?}"),
        }
        (bytes.len() >= length).then_some(())
    }); bytes
}
#[test]
fn selected_bsd_profile_validates_exact_byte_limits_and_addresses_without_truncation() {
    let user = "é".repeat(15); let terminal = "t".repeat(52);
    let mut o = options(); o.local_user = &user; o.remote_user = &user; o.terminal = &terminal;
    let encoded = o.prepare().unwrap().request;
    assert_eq!(encoded, encode_request(&user, &user, &terminal, 38400).unwrap());
    let long_user = format!("{user}x"); o.local_user = &long_user;
    assert_eq!(o.prepare().err(), Some(ProtocolError::InvalidUser.into())); o.local_user = &user;
    o.remote_user = &long_user; assert_eq!(o.prepare().err(), Some(ProtocolError::InvalidUser.into())); o.remote_user = &user;
    let long_terminal = format!("{terminal}t"); o.terminal = &long_terminal;
    assert_eq!(o.prepare().err(), Some(ProtocolError::InvalidTerminal.into()));
    for address in [Ipv4Addr::UNSPECIFIED, Ipv4Addr::BROADCAST, Ipv4Addr::new(224,0,0,1)] {
        let mut o = options(); o.local = address; assert_eq!(o.prepare().err(), Some(SocketError::InvalidAddress.into()));
        o.local = Ipv4Addr::LOCALHOST; o.target.set_ip(address);
        assert_eq!(o.prepare().err(), Some(SocketError::InvalidAddress.into()));
    }
    let mut o = options(); o.target.set_port(0); assert_eq!(o.prepare().err(), Some(SocketError::InvalidAddress.into()));
    let mut o = options(); o.window.rows = 0; assert_eq!(o.prepare().err(), Some(ProtocolError::InvalidWindow.into()));
    let o = options(); assert_eq!(runtime().block_on(connect(o, &AtomicBool::new(true))).err(), Some(SocketError::Cancelled.into()));
}
#[test]
fn actual_wire_request_and_ack_tail_are_transferred_once_in_order_under_backpressure() {
    let (socket, mut peer) = pair(); let initial = b"password: \x00\xff\x02\x80";
    let mut reply = vec![0]; reply.extend_from_slice(initial); peer.write_all(&reply).unwrap();
    let mut reader = runtime().block_on(exchange(socket, options().prepare().unwrap(), &AtomicBool::new(false), Instant::now()+Duration::from_secs(2))).unwrap();
    request(&mut peer);
    for _ in 0..3 { assert_eq!(reader.poll(&mut [0_u8;2], false).unwrap(), ReceiveEvent::Idle); }
    assert_eq!(read_data(&mut reader, initial.len()), initial);
    assert_eq!(reader.poll(&mut [0_u8;2], true).unwrap(), ReceiveEvent::Idle);
    peer.write_all(b"next").unwrap(); assert_eq!(read_data(&mut reader, 4), b"next");
    reader.close().unwrap(); eof(&mut peer);
}
#[test]
fn fragmented_rejection_oversize_and_no_ack_eof_are_private_and_release_the_socket() {
    let rt = runtime();
    for case in 0..4 {
        let (socket, peer) = pair();
        let server = serving(peer, move |peer| {
            match case {
                0 => { peer.write_all(&[1]).unwrap(); thread::sleep(Duration::from_millis(30)); peer.write_all(b"private fixture reason\n").unwrap(); },
                1 => { peer.write_all(&[1]).unwrap(); peer.write_all(&vec![b'x'; crate::rlogin::MAX_REJECTION_BYTES+1]).unwrap(); },
                2 => { peer.write_all(b"\x01private fixture reason").unwrap(); peer.shutdown(Shutdown::Write).unwrap(); },
                _ => peer.shutdown(Shutdown::Write).unwrap(),
            }
        });
        let error = rt.block_on(exchange(socket, options().prepare().unwrap(), &AtomicBool::new(false), Instant::now()+Duration::from_secs(2))).err().unwrap();
        assert_eq!(error, ConnectError::Protocol(match case { 1 => ProtocolError::RejectionTooLong, 3 => ProtocolError::UnexpectedEof, _ => ProtocolError::Rejected }));
        assert!(!format!("{error:?} {error}").contains("private")); server.join().unwrap();
    }
}
#[test]
fn cancellation_during_ack_and_pre_cancel_release_socket_without_reporting_acceptance() {
    let rt = runtime(); let cancel = Arc::new(AtomicBool::new(false)); let copy = cancel.clone();
    let (socket, peer) = pair(); let server = serving(peer, move |_| copy.store(true, Ordering::Release));
    assert_eq!(rt.block_on(exchange(socket, options().prepare().unwrap(), &cancel, Instant::now()+Duration::from_secs(2))).err(), Some(SocketError::Cancelled.into()));
    server.join().unwrap();
    let (socket, mut peer) = pair();
    assert_eq!(rt.block_on(exchange(socket, options().prepare().unwrap(), &AtomicBool::new(true), Instant::now()+Duration::from_secs(2))).err(), Some(SocketError::Cancelled.into()));
    eof(&mut peer);
}
#[test]
fn original_establish_deadline_is_not_restarted_before_ack_or_for_an_expired_exchange() {
    let rt = runtime(); let (socket, mut peer) = pair();
    let deadline = Instant::now()+Duration::from_millis(80);
    let result = rt.block_on(async {
        tokio::time::timeout(Duration::from_secs(2), async {
            // 模拟连接阶段已消费部分总预算，ACK等待必须沿用同一个Instant。
            tokio::time::sleep(Duration::from_millis(30)).await;
            exchange(socket, options().prepare().unwrap(), &AtomicBool::new(false), deadline).await
        }).await.expect("exchange restarted the original establish deadline")
    });
    assert_eq!(result.err(), Some(SocketError::Timeout.into()));
    let mut sent = Vec::new(); peer.read_to_end(&mut sent).unwrap();
    // 调度已跨过绝对截止时可以在write前失败；不能要求过期操作仍发送请求。
    assert!(sent.is_empty() || sent == REQUEST);
    let (socket, mut peer) = pair();
    assert_eq!(rt.block_on(exchange(socket, options().prepare().unwrap(), &AtomicBool::new(false), Instant::now())).err(), Some(SocketError::Timeout.into()));
    eof(&mut peer);
}
#[test]
fn aborting_the_actual_pending_handshake_task_drops_its_owned_socket() {
    let (socket, peer) = pair(); let (sent, received) = tokio::sync::oneshot::channel();
    let server = serving(peer, move |_| { sent.send(()).unwrap(); });
    runtime().block_on(async {
        let task = tokio::spawn(async move { exchange(socket, options().prepare().unwrap(), &AtomicBool::new(false), Instant::now()+CONNECT_TIMEOUT).await });
        tokio::time::timeout(Duration::from_secs(2), received).await.unwrap().unwrap();
        task.abort(); assert!(task.await.err().unwrap().is_cancelled());
    }); server.join().unwrap();
}
#[test]
fn public_adapter_uses_the_real_low_source_port_or_reports_actual_host_denial() {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap(); listener.set_nonblocking(true).unwrap();
    let SocketAddr::V4(target) = listener.local_addr().unwrap() else { unreachable!() };
    let stop = Arc::new(AtomicBool::new(false)); let copy = stop.clone();
    let server = thread::spawn(move || {
        until(|| {
            match listener.accept() {
                Ok((mut peer, source)) => {
                    peer.set_nonblocking(false).unwrap(); peer.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
                    peer.set_write_timeout(Some(Duration::from_secs(2))).unwrap(); request(&mut peer);
                    peer.write_all(b"\0!").unwrap(); eof(&mut peer); Some(Some(source.port()))
                },
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => copy.load(Ordering::Acquire).then_some(None),
                Err(error) => panic!("fixture accept failed: {error}"),
            }
        })
    });
    let mut o = options(); o.target = target;
    match runtime().block_on(connect(o, &AtomicBool::new(false))) {
        Ok(mut reader) => {
            assert_eq!(read_data(&mut reader, 1), b"!"); reader.close().unwrap();
            assert!((512..=1023).contains(&server.join().unwrap().unwrap()));
            println!("rlogin_establish_reserved_source: available");
        },
        Err(ConnectError::Socket(SocketError::AccessDenied)) => {
            stop.store(true, Ordering::Release); assert_eq!(server.join().unwrap(), None);
            println!("rlogin_establish_reserved_source: access_denied; ordinary-socket exchange fixtures remain separate");
        },
        Err(error) => { stop.store(true, Ordering::Release); server.join().unwrap(); panic!("unexpected establish result: {error}"); },
    }
}
#[cfg(unix)]
#[test]
fn ack_tail_stays_unrendered_until_urgent_flush_is_processed() {
    let (socket, mut peer) = pair(); peer.write_all(b"\0discard").unwrap();
    crate::legacy_socket::send_urgent_fixture(&peer, 0x02); peer.write_all(b"keep").unwrap();
    until(|| socket.poll_ready().unwrap().urgent.then_some(()));
    let mut reader = runtime().block_on(exchange(socket, options().prepare().unwrap(), &AtomicBool::new(false), Instant::now()+Duration::from_secs(2))).unwrap();
    request(&mut peer);
    assert!(matches!(reader.poll(&mut [0_u8;32], false).unwrap(), ReceiveEvent::Control(control) if control.flush_output));
    assert_eq!(read_data(&mut reader, 4), b"keep"); reader.close().unwrap(); eof(&mut peer);
}
