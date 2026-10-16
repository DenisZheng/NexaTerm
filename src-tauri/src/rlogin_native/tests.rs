use super::*;
use crate::legacy_socket::{fixture::{pair, until}, send_urgent_fixture};
use std::{io::{Read, Write}, net::Shutdown};
fn reader() -> (RloginReader, std::net::TcpStream) {
    let (socket, peer) = pair(); (RloginReader::new(socket, 24, 80, 0, 0).unwrap(), peer)
}
fn control(reader: &mut RloginReader, capacity: bool) -> Control {
    until(|| match reader.poll(&mut [0;128], capacity).unwrap() {
        ReceiveEvent::Control(control) => Some(control), ReceiveEvent::Idle => None,
        other => panic!("data preceded expected urgent control: {other:?}"),
    })
}
fn data(reader: &mut RloginReader, length: usize) -> Vec<u8> {
    let mut result = Vec::new(); let mut buffer = [0;128];
    until(|| {
        match reader.poll(&mut buffer, true).unwrap() {
            ReceiveEvent::Data(n) => result.extend_from_slice(&buffer[..n]), ReceiveEvent::Idle => {},
            other => panic!("unexpected event while reading data: {other:?}"),
        }
        (result.len() >= length).then_some(())
    }); result
}
fn write_frame(reader: &mut RloginReader, peer: &mut std::net::TcpStream, frame: [u8;12]) {
    let mut offset = 0;
    until(|| { if let Some(count) = reader.write(&frame[offset..]).unwrap() { offset += count; } (offset==frame.len()).then_some(()) });
    let mut actual = [0_u8;12]; peer.read_exact(&mut actual).unwrap(); assert_eq!(actual, frame);
}
#[test]
fn ordinary_control_values_are_not_treated_as_oob_or_telnet() {
    let (mut reader, mut peer) = reader(); let bytes = [0,255,2,16,32,128,b'~',b'.'];
    peer.write_all(&bytes).unwrap(); assert_eq!(data(&mut reader, bytes.len()), bytes);
    assert_eq!(reader.input(b"~.\0\xff").unwrap(), b"~.\0\xff");
}
#[test]
fn native_oob_window_requests_use_latest_size_and_do_not_appear_in_data() {
    let (mut reader, mut peer) = reader();
    assert_eq!(reader.resize(32,132,1024,768).unwrap(), None);
    peer.write_all(b"before").unwrap(); send_urgent_fixture(&peer, 0x80); peer.write_all(b"after").unwrap();
    let event = control(&mut reader, false); let first = event.window_frame.unwrap();
    assert_eq!(first, [255,255,b's',b's',0,32,0,132,4,0,3,0]); assert!(!event.flush_output);
    write_frame(&mut reader, &mut peer, first); assert_eq!(data(&mut reader, 11), b"beforeafter");
    let changed = reader.resize(40,140,0,0).unwrap().unwrap(); write_frame(&mut reader, &mut peer, changed);
    send_urgent_fixture(&peer, 0x80); peer.write_all(b"!").unwrap();
    assert_eq!(control(&mut reader, false).window_frame, Some(changed)); assert_eq!(data(&mut reader, 1), b"!");
}
#[test]
fn native_flush_discards_only_before_mark_and_combined_flags_work_under_backpressure() {
    let (mut reader, mut peer) = reader();
    peer.write_all(b"discard").unwrap(); send_urgent_fixture(&peer, 0xb2); peer.write_all(b"keep\x80").unwrap();
    let event = control(&mut reader, false);
    assert!(event.flush_output); assert_eq!(event.flow, FlowMode::Local); assert!(event.window_frame.is_some());
    assert!(reader.input(&[0x13]).unwrap().is_empty());
    for _ in 0..4 { assert_eq!(reader.poll(&mut [0;128], false).unwrap(), ReceiveEvent::Idle); }
    assert!(reader.input(&[0x11]).unwrap().is_empty()); assert_eq!(data(&mut reader, 5), b"keep\x80");
}
#[test]
fn urgent_raw_mode_resumes_locally_paused_output_and_preserves_input_bytes() {
    let (mut reader, mut peer) = reader();
    assert!(reader.input(&[0x13]).unwrap().is_empty()); peer.write_all(b"paused").unwrap();
    for _ in 0..3 { assert_eq!(reader.poll(&mut [0;128], true).unwrap(), ReceiveEvent::Idle); }
    send_urgent_fixture(&peer, 0x10); peer.write_all(b"!").unwrap();
    assert_eq!(control(&mut reader, false).flow, FlowMode::Remote);
    assert_eq!(reader.input(&[0x11,0x13,b'~',b'.',255]).unwrap(), [0x11,0x13,b'~',b'.',255]);
    assert_eq!(data(&mut reader, 7), b"paused!");
    send_urgent_fixture(&peer, 0x20); peer.write_all(b"?").unwrap();
    assert_eq!(control(&mut reader, false).flow, FlowMode::Local);
    assert!(reader.input(&[0x13,0x11]).unwrap().is_empty()); assert_eq!(data(&mut reader, 1), b"?");
}
#[test]
fn urgent_remains_available_when_normal_output_has_no_capacity() {
    let (mut reader, mut peer) = reader(); peer.write_all(b"held").unwrap();
    for _ in 0..3 { assert_eq!(reader.poll(&mut [0;128], false).unwrap(), ReceiveEvent::Idle); }
    send_urgent_fixture(&peer, 0); peer.write_all(b"kept").unwrap();
    let event = control(&mut reader, false); assert!(!event.flush_output); assert_eq!(event.window_frame,None);
    assert_eq!(data(&mut reader,8), b"heldkept");
}
#[test]
fn native_eof_is_idempotent_and_invalid_configuration_releases_the_socket() {
    let (mut active, peer) = reader(); peer.shutdown(Shutdown::Write).unwrap();
    until(|| (active.poll(&mut [0;128], true).unwrap()==ReceiveEvent::Closed).then_some(()));
    assert_eq!(active.poll(&mut [0;128], true).unwrap(), ReceiveEvent::Closed); active.close().unwrap();
    let (socket, mut peer) = pair(); assert_eq!(RloginReader::new(socket,0,80,0,0).err(),Some(ProtocolError::InvalidWindow));
    assert_eq!(peer.read(&mut [0_u8]).unwrap(), 0);
    let (mut active, _peer) = reader();
    assert_eq!(active.input(&vec![0;MAX_CHUNK+1]), Err(SocketError::InvalidChunk));
    assert_eq!(active.poll(&mut [],true), Err(SocketError::InvalidChunk));
    assert_eq!(active.resize(0,80,0,0),Err(ProtocolError::InvalidWindow));
}
#[test]
fn pending_urgent_data_is_bounded_and_only_pending_control_has_a_deadline() {
    let (mut active, mut peer) = reader(); peer.write_all(&vec![b'x';MAX_CHUNK+1]).unwrap();
    until(|| { active.hold_pre_mark().unwrap(); (active.quarantined.len()==MAX_CHUNK).then_some(()) });
    assert_eq!(active.hold_pre_mark(), Err(SocketError::UrgentBufferFull));
    assert_eq!(active.quarantined.len(), MAX_CHUNK);
    let (mut active, _peer) = reader();
    for _ in 0..4 { assert_eq!(active.poll(&mut [0;128], true).unwrap(),ReceiveEvent::Idle); }
    active.urgent_since = Some(Instant::now()-Duration::from_secs(16));
    assert_eq!(active.poll(&mut [0;128], true),Err(SocketError::Timeout));
}
