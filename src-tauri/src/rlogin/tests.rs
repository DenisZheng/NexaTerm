use super::*;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::time::{Duration, Instant};

#[test]
fn initial_exchange_matches_rfc_field_order_and_preserves_names() {
    assert_eq!(DEFAULT_PORT, 513);
    assert_eq!(encode_request("bostic", "kbostic", "vt100", 9600).unwrap(), b"\0bostic\0kbostic\0vt100/9600\0");
    assert_eq!(encode_request(" local ", "远端", "xterm-256color", u32::MAX).unwrap(),
        "\0 local \0远端\0xterm-256color/4294967295\0".as_bytes());
}
#[test]
fn both_user_fields_enforce_utf8_byte_budgets_and_reject_controls() {
    let exact = "é".repeat(MAX_USER_BYTES / 2);
    assert!(encode_request(&exact, &exact, "xterm", 9600).is_ok());
    for invalid in ["".to_owned(), "a\0b".into(), "a\nb".into(), "a\u{7f}b".into(), format!("{exact}a")] {
        assert_eq!(encode_request(&invalid, "remote", "xterm", 9600), Err(ProtocolError::InvalidUser));
        assert_eq!(encode_request("local", &invalid, "xterm", 9600), Err(ProtocolError::InvalidUser));
    }
}
#[test]
fn terminal_delimiter_ascii_and_speed_are_validated_without_truncation() {
    assert!(encode_request("a", "b", &"x".repeat(MAX_TERMINAL_BYTES), 1).is_ok());
    for terminal in ["".to_owned(), "x/9600".into(), "x\0y".into(), "终端".into(), "x term".into(), "x".repeat(MAX_TERMINAL_BYTES + 1)] {
        assert_eq!(encode_request("a", "b", &terminal, 9600), Err(ProtocolError::InvalidTerminal));
    }
    assert_eq!(encode_request("a", "b", "xterm", 0), Err(ProtocolError::InvalidSpeed));
}
#[test]
fn accepted_tail_is_exact_for_every_chunk_width_including_binary_data() {
    let exchange = b"\0banner\0\xff\x02\x80\n";
    for width in 1..=exchange.len() {
        let mut parser = Handshake::new(); let mut accepted = false; let mut output = Vec::new();
        assert_eq!(parser.receive(&[]), Ok(HandshakeProgress::Pending));
        for chunk in exchange.chunks(width) {
            if accepted { output.extend_from_slice(chunk); continue; }
            match parser.receive(chunk).unwrap() {
                HandshakeProgress::Accepted(tail) => { accepted = true; output.extend_from_slice(tail); }
                HandshakeProgress::Pending => {},
            }
        }
        assert!(accepted); assert_eq!(output, &exchange[1..]); assert_eq!(parser.end_of_stream(), Ok(()));
        assert_eq!(parser.receive(b"later"), Err(ProtocolError::AlreadyFinished));
    }
}
#[test]
fn every_nonzero_status_rejects_and_never_returns_error_text_as_terminal_data() {
    for status in 1..=255 {
        let mut parser = Handshake::new();
        assert_eq!(parser.receive(&[status]), Ok(HandshakeProgress::Pending));
        for byte in b"fixture-private-rejection" { assert_eq!(parser.receive(&[*byte]), Ok(HandshakeProgress::Pending)); }
        let error = parser.receive(b"\nnot-a-banner").unwrap_err();
        assert_eq!(error, ProtocolError::Rejected); assert_eq!(error.to_string(), "rlogin_rejected");
        assert!(!format!("{error:?}").contains("fixture-private"));
        assert_eq!(parser.receive(b"\0"), Err(ProtocolError::Rejected));
        assert_eq!(parser.end_of_stream(), Err(ProtocolError::Rejected));
    }
}
#[test]
fn rejection_is_bounded_and_eof_is_state_specific() {
    let mut parser = Handshake::new(); assert_eq!(parser.end_of_stream(), Err(ProtocolError::UnexpectedEof));
    assert_eq!(parser.receive(b"\0"), Err(ProtocolError::UnexpectedEof));
    let mut parser = Handshake::new(); assert_eq!(parser.receive(b"\x01unterminated"), Ok(HandshakeProgress::Pending));
    assert_eq!(parser.end_of_stream(), Err(ProtocolError::Rejected));
    let mut parser = Handshake::new(); parser.receive(b"\x01").unwrap();
    for _ in 0..MAX_REJECTION_BYTES { assert_eq!(parser.receive(b"x"), Ok(HandshakeProgress::Pending)); }
    assert_eq!(parser.receive(b"\n"), Err(ProtocolError::Rejected));
    let mut parser = Handshake::new(); parser.receive(b"\x01").unwrap();
    parser.receive(&[b'x'; MAX_REJECTION_BYTES]).unwrap();
    assert_eq!(parser.receive(b"x"), Err(ProtocolError::RejectionTooLong));
    assert_eq!(parser.receive(b"\n"), Err(ProtocolError::RejectionTooLong));
}
#[test]
fn window_frame_has_magic_and_network_order_without_sending_unsolicited_data() {
    assert_eq!(window_size_frame(24, 80, 640, 480).unwrap(), [255,255,b's',b's',0,24,0,80,2,128,1,224]);
    assert_eq!(window_size_frame(u16::MAX, u16::MAX, 0, 0).unwrap(), [255,255,b's',b's',255,255,255,255,0,0,0,0]);
    for (rows, columns) in [(0,80), (24,0)] { assert_eq!(window_size_frame(rows, columns, 0, 0), Err(ProtocolError::InvalidWindow)); }
}

fn tcp_fixture(server: impl FnOnce(TcpStream) + Send + 'static, client: impl FnOnce(TcpStream)) {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap(); listener.set_nonblocking(true).unwrap();
    let address: SocketAddr = listener.local_addr().unwrap();
    let thread = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(3);
        let stream = loop {
            match listener.accept() {
                Ok((stream, peer)) => { assert!(peer.ip().is_loopback()); break stream; }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(Instant::now() < deadline, "fixture accept timed out");
                    std::thread::sleep(Duration::from_millis(2));
                }
                Err(error) => panic!("fixture accept failed: {error}"),
            }
        };
        set_timeouts(&stream); server(stream);
    });
    let stream = TcpStream::connect_timeout(&address, Duration::from_secs(2)).unwrap();
    set_timeouts(&stream); client(stream); thread.join().unwrap();
}
fn set_timeouts(stream: &TcpStream) {
    stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    stream.set_write_timeout(Some(Duration::from_secs(2))).unwrap();
}
fn read_fixture_request(stream: &mut TcpStream) {
    // 固定对端期望字节；不用编码器生成 oracle，避免自证循环。
    let mut actual = [0_u8; 25]; stream.read_exact(&mut actual).unwrap();
    assert_eq!(&actual, b"\0local\0remote\0xterm/9600\0");
}
#[test]
fn real_tcp_fixture_preserves_ack_plus_binary_banner_and_following_input() {
    tcp_fixture(|mut stream| {
        read_fixture_request(&mut stream); stream.write_all(b"\0banner\xff\0\x02").unwrap();
        let mut input = [0_u8; 4]; stream.read_exact(&mut input).unwrap(); assert_eq!(input, [b'~',b'.',13,255]);
    }, |mut stream| {
        stream.write_all(&encode_request("local", "remote", "xterm", 9600).unwrap()).unwrap();
        let mut parser = Handshake::new(); let mut buffer = [0_u8; 3]; let mut output = Vec::new(); let mut accepted = false;
        while output.len() < 9 {
            let count = stream.read(&mut buffer).unwrap(); assert_ne!(count, 0);
            if accepted { output.extend_from_slice(&buffer[..count]); }
            else if let HandshakeProgress::Accepted(tail) = parser.receive(&buffer[..count]).unwrap() {
                accepted = true; output.extend_from_slice(tail);
            }
        }
        assert!(accepted); assert_eq!(output, b"banner\xff\0\x02");
        stream.write_all(&[b'~',b'.',13,255]).unwrap();
    });
}
#[test]
fn real_tcp_fixture_rejection_is_fragmented_bounded_and_private() {
    tcp_fixture(|mut stream| {
        read_fixture_request(&mut stream);
        for byte in b"\x01fixture-private-rejection\n" { stream.write_all(&[*byte]).unwrap(); }
    }, |mut stream| {
        stream.write_all(&encode_request("local", "remote", "xterm", 9600).unwrap()).unwrap();
        let mut parser = Handshake::new(); let mut byte = [0_u8; 1];
        loop {
            assert_eq!(stream.read(&mut byte).unwrap(), 1);
            match parser.receive(&byte) {
                Ok(HandshakeProgress::Pending) => {},
                Err(error) => { assert_eq!(error, ProtocolError::Rejected); break; }
                other => panic!("rejection was treated as accepted: {other:?}"),
            }
        }
    });
}
#[test]
fn real_tcp_fixture_eof_before_ack_never_becomes_accepted() {
    tcp_fixture(|mut stream| { read_fixture_request(&mut stream); }, |mut stream| {
        stream.write_all(&encode_request("local", "remote", "xterm", 9600).unwrap()).unwrap();
        let mut byte = [0_u8; 1]; assert_eq!(stream.read(&mut byte).unwrap(), 0);
        assert_eq!(Handshake::new().end_of_stream(), Err(ProtocolError::UnexpectedEof));
    });
}
