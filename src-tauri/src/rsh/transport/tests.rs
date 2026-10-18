use super::*;
use crate::legacy_socket::fixture::{pair, until};
use std::{io::{Read, Write}, net::Shutdown};

fn read_all(transport: &mut RshTransport, stderr: bool) -> Vec<u8> {
    let mut bytes = Vec::new(); let mut buffer = [0_u8; 2];
    until(|| {
        match if stderr { transport.read_stderr(&mut buffer) } else { transport.read_stdout(&mut buffer) }.unwrap() {
            Some(0) => Some(()), Some(count) => { bytes.extend_from_slice(&buffer[..count]); None }, None => None,
        }
    }); bytes
}
#[test]
fn stdout_prefix_and_stderr_are_exact_independent_streams_with_independent_eof() {
    let (main, mut stdout) = pair(); let (secondary, mut stderr) = pair();
    let mut transport = RshTransport::new(main, secondary, b"\0\xffprefix".to_vec());
    stdout.write_all(b"next\0").unwrap(); stdout.shutdown(Shutdown::Write).unwrap();
    assert_eq!(read_all(&mut transport, false), b"\0\xffprefixnext\0");
    assert!(!transport.output_complete());
    // stdout 已 EOF 也必须允许次连接晚到的尾部；首字节不是第二个 ACK。
    stderr.write_all(b"\0\xfflate error").unwrap(); stderr.shutdown(Shutdown::Write).unwrap();
    assert_eq!(read_all(&mut transport, true), b"\0\xfflate error");
    assert!(transport.output_complete());
    assert_eq!(transport.read_stdout(&mut [0_u8; 1]).unwrap(), Some(0));
    assert_eq!(transport.read_stderr(&mut [0_u8; 1]).unwrap(), Some(0));
    transport.close().unwrap();
    assert_eq!(stdout.read(&mut [0_u8]).unwrap(), 0); assert_eq!(stderr.read(&mut [0_u8]).unwrap(), 0);
}
#[test]
fn stdin_half_close_keeps_both_outputs_and_fixed_signals_available() {
    let (main, mut stdin) = pair(); let (secondary, mut signals) = pair();
    let mut transport = RshTransport::new(main, secondary, Vec::new());
    let input = b"input\0\xff"; let mut offset = 0;
    until(|| { if let Some(count) = transport.write_stdin(&input[offset..]).unwrap() { assert!(count > 0); offset += count; }
        (offset == input.len()).then_some(()) });
    transport.close_stdin().unwrap(); transport.close_stdin().unwrap();
    let mut received = Vec::new(); stdin.read_to_end(&mut received).unwrap(); assert_eq!(received, input);
    assert_eq!(transport.write_stdin(b"later"), Err(NativeError::StdinClosed));
    for signal in [Signal::Hangup, Signal::Interrupt, Signal::Quit, Signal::Kill, Signal::Terminate] {
        until(|| transport.send_signal(signal).unwrap());
    }
    let mut received = [0_u8; 5]; signals.read_exact(&mut received).unwrap(); assert_eq!(received, [1, 2, 3, 9, 15]);
    stdin.write_all(b"stdout after stdin EOF").unwrap(); stdin.shutdown(Shutdown::Write).unwrap();
    signals.write_all(b"stderr after stdin EOF").unwrap(); signals.shutdown(Shutdown::Write).unwrap();
    assert_eq!(read_all(&mut transport, false), b"stdout after stdin EOF");
    assert_eq!(read_all(&mut transport, true), b"stderr after stdin EOF");
    assert!(transport.output_complete()); transport.close().unwrap();
}
#[test]
fn bounded_io_rejects_invalid_chunks_without_consuming_prefix_or_writing_payload() {
    let (main, mut peer) = pair(); let (secondary, mut error_peer) = pair();
    let mut transport = RshTransport::new(main, secondary, b"private prefix".to_vec());
    for length in [0, MAX_CHUNK + 1] {
        assert_eq!(transport.read_stdout(&mut vec![0_u8; length]), Err(SocketError::InvalidChunk.into()));
        assert_eq!(transport.read_stderr(&mut vec![0_u8; length]), Err(SocketError::InvalidChunk.into()));
    }
    assert_eq!(transport.write_stdin(&vec![b'x'; MAX_CHUNK + 1]), Err(SocketError::InvalidChunk.into()));
    let mut prefix = [0_u8; 14]; assert_eq!(transport.read_stdout(&mut prefix).unwrap(), Some(14)); assert_eq!(&prefix, b"private prefix");
    assert_eq!(format!("{transport:?}"), "RshTransport{..}");
    transport.close().unwrap();
    assert_eq!(peer.read(&mut [0_u8]).unwrap(), 0); assert_eq!(error_peer.read(&mut [0_u8]).unwrap(), 0);
}
#[test]
fn dropping_transport_releases_both_owned_sockets() {
    let (main, mut peer) = pair(); let (secondary, mut error_peer) = pair();
    drop(RshTransport::new(main, secondary, Vec::new()));
    assert_eq!(peer.read(&mut [0_u8]).unwrap(), 0); assert_eq!(error_peer.read(&mut [0_u8]).unwrap(), 0);
}
