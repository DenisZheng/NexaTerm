use super::*;
use crate::legacy_socket::{fixture::{pair,until}, NativeSocket};
use std::{io::{Read,Write},net::{Ipv4Addr,Shutdown,SocketAddrV4}};
#[test]
fn split_request_has_decimal_callback_port_then_exact_users_and_command_without_rlogin_prefix() {
    assert_eq!(encode_secondary_port(512).unwrap(),b"512\0");assert_eq!(encode_secondary_port(1023).unwrap(),b"1023\0");
    for port in [0,1,511,1024,65535] {assert_eq!(encode_secondary_port(port),Err(ProtocolError::InvalidSecondaryPort));}
    assert_eq!(encode_command("LocalCase","RemoteCase",b"  printf 'a b'\nnext\xff  ").unwrap(),b"LocalCase\0RemoteCase\0  printf 'a b'\nnext\xff  \0");
    assert_eq!(DEFAULT_PORT,514);
}
#[test]
fn users_use_the_explicit_bsd16_byte_profile_without_trim_or_truncation() {
    assert!(encode_command(&"a".repeat(16),"remote",b"id").is_ok());assert!(encode_command("local",&"a".repeat(16),b"id").is_ok());
    assert!(encode_command(&"中".repeat(5),"remote",b"id").is_ok());
    for user in ["".to_owned(),"a".repeat(17),"中".repeat(6),"bad\0user".into(),"bad\nuser".into(),"bad\x7fuser".into()] {
        assert_eq!(encode_command(&user,"remote",b"id"),Err(ProtocolError::InvalidUser));assert_eq!(encode_command("local",&user,b"id"),Err(ProtocolError::InvalidUser));
    }
}
#[test]
fn command_budget_is_checked_before_encoding_and_only_nul_is_a_field_delimiter() {
    let command=vec![0xff;MAX_COMMAND_BYTES];let encoded=encode_command("l","r",&command).unwrap();
    assert_eq!(&encoded[4..encoded.len()-1],&command);assert_eq!(encoded.len(),MAX_COMMAND_BYTES+5);
    assert_eq!(encode_command("l","r",&vec![b'x';MAX_COMMAND_BYTES+1]),Err(ProtocolError::InvalidCommand));
    for command in [&b""[..],&b"a\0b"[..]] {assert_eq!(encode_command("l","r",command),Err(ProtocolError::InvalidCommand));}
    assert_eq!(encode_command("l","r",b" \r\n\x01").unwrap(),b"l\0r\0 \r\n\x01\0");
}
#[test]
fn callback_requires_exact_frozen_ipv4_and_reserved_source_port() {
    let expected=Ipv4Addr::new(192,0,2,10);
    for port in [512,1023] {assert_eq!(validate_secondary_peer(SocketAddrV4::new(expected,port).into(),expected),Ok(()));}
    for peer in ["192.0.2.11:512","192.0.2.10:511","192.0.2.10:1024","192.0.2.10:0","[::1]:512","[::ffff:192.0.2.10]:512"] {
        assert_eq!(validate_secondary_peer(peer.parse().unwrap(),expected),Err(ProtocolError::InvalidSecondaryPeer));
    }
    assert_eq!(validate_secondary_peer(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED,512).into(),Ipv4Addr::UNSPECIFIED),Err(ProtocolError::InvalidSecondaryPeer));
}
#[test]
fn signals_have_explicit_remote_bsd_values_independent_of_the_host_platform() {
    assert_eq!([Signal::Hangup,Signal::Interrupt,Signal::Quit,Signal::Kill,Signal::Terminate].map(Signal::encode),[[1],[2],[3],[9],[15]]);
}
#[test]
fn ack_transfers_binary_stdout_tail_once_and_never_strips_a_second_status_byte() {
    let bytes=b"\0\0\xff\x82stdout";
    for width in 1..=bytes.len() {
        let mut parser=Handshake::new();let mut output=Vec::new();let mut accepted=false;
        for chunk in bytes.chunks(width) {
            if accepted {output.extend_from_slice(chunk);}else if let HandshakeProgress::Accepted(tail)=parser.receive(chunk).unwrap() {accepted=true;output.extend_from_slice(tail);}
        }
        assert!(accepted);assert_eq!(output,&bytes[1..]);assert_eq!(parser.end_of_stream(),Ok(()));
        assert_eq!(parser.receive(b"tail"),Err(ProtocolError::AlreadyFinished));
    }
}
#[test]
fn every_nonzero_status_is_a_private_sticky_rejection() {
    for status in 1..=255 {
        let mut parser=Handshake::new();assert_eq!(parser.receive(&[status]),Ok(HandshakeProgress::Pending));
        assert_eq!(parser.receive(b"private fixture\n"),Err(ProtocolError::Rejected));
        assert_eq!(parser.receive(b"\0"),Err(ProtocolError::Rejected));assert_eq!(parser.end_of_stream(),Err(ProtocolError::Rejected));
        assert_eq!(ProtocolError::Rejected.to_string(),"rsh_rejected");
    }
}
#[test]
fn fragmented_rejection_is_bounded_without_retaining_or_echoing_server_text() {
    let mut parser=Handshake::new();assert_eq!(parser.receive(&[1]),Ok(HandshakeProgress::Pending));
    for _ in 0..MAX_REJECTION_BYTES {assert_eq!(parser.receive(b"x"),Ok(HandshakeProgress::Pending));}
    assert_eq!(parser.receive(b"\n"),Err(ProtocolError::Rejected));
    let mut parser=Handshake::new();parser.receive(&[1]).unwrap();assert_eq!(parser.receive(&vec![b'x';MAX_REJECTION_BYTES+1]),Err(ProtocolError::RejectionTooLong));
    assert_eq!(parser.end_of_stream(),Err(ProtocolError::RejectionTooLong));
}
#[test]
fn eof_distinguishes_missing_ack_rejection_and_accepted_transport_without_an_exit_code() {
    let mut parser=Handshake::new();assert_eq!(parser.receive(b""),Ok(HandshakeProgress::Pending));assert_eq!(parser.end_of_stream(),Err(ProtocolError::UnexpectedEof));
    assert_eq!(parser.receive(b"\0"),Err(ProtocolError::UnexpectedEof));
    let mut parser=Handshake::new();parser.receive(b"\x01private").unwrap();assert_eq!(parser.end_of_stream(),Err(ProtocolError::Rejected));
    let mut parser=Handshake::new();parser.receive(b"\0").unwrap();assert_eq!(parser.end_of_stream(),Ok(()));
}
fn send(socket:&mut NativeSocket,bytes:&[u8]) {
    let mut offset=0;until(||{if offset==bytes.len(){return Some(());}if let Some(n)=socket.write(&bytes[offset..]).unwrap(){assert_ne!(n,0);offset+=n;}(offset==bytes.len()).then_some(())});
}
#[test]
fn real_loopback_tcp_observes_split_fields_and_ack_with_transparent_binary_stdout() {
    let (mut socket,mut peer)=pair();let port=encode_secondary_port(512).unwrap();let command=encode_command("local","remote",b"printf test\nnext").unwrap();
    let expected=[port.clone(),command.clone()].concat();
    let server=std::thread::spawn(move ||{let mut request=vec![0;expected.len()];peer.read_exact(&mut request).unwrap();assert_eq!(request,expected);peer.write_all(b"\0\0\xffout\r\n").unwrap();peer.shutdown(Shutdown::Write).unwrap();});
    send(&mut socket,&port);send(&mut socket,&command);
    let mut parser=Handshake::new();let mut accepted=false;let mut output=Vec::new();let mut buffer=[0;64];
    until(||{if let Some(n)=socket.read(&mut buffer).unwrap(){assert_ne!(n,0);if accepted{output.extend_from_slice(&buffer[..n]);}else if let HandshakeProgress::Accepted(tail)=parser.receive(&buffer[..n]).unwrap(){accepted=true;output.extend_from_slice(tail);}}(output.len()>=7).then_some(())});
    assert_eq!(output,b"\0\xffout\r\n");socket.close().unwrap();server.join().unwrap();
}
#[test]
fn real_loopback_rejection_and_eof_before_ack_have_fixed_private_errors() {
    for (bytes,expected) in [(&b"\x01private fixture\n"[..],ProtocolError::Rejected),(&b""[..],ProtocolError::UnexpectedEof)] {
        let (mut socket,mut peer)=pair();peer.write_all(bytes).unwrap();peer.shutdown(Shutdown::Write).unwrap();let mut parser=Handshake::new();let mut buffer=[0;3];
        let error=until(||{if let Some(n)=socket.read(&mut buffer).unwrap(){if n==0{return parser.end_of_stream().err();}if let Err(error)=parser.receive(&buffer[..n]){return Some(error);}}None});
        assert_eq!(error,expected);assert!(!error.to_string().contains("private"));socket.close().unwrap();
    }
}
