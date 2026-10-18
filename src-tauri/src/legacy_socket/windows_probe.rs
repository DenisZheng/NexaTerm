//! 仅自造loopback数据的原生API对照；观察结果不启用生产精确flush能力。
use super::{fixture::{pair, until}, platform, send_urgent_fixture, NativeSocket};
use std::{io::{self, Write}, net::{Shutdown, TcpStream}, os::windows::io::AsRawSocket};
use windows_sys::Win32::Networking::WinSock::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Api { Receive, ReceiveEx }

fn receive(api: Api, stream: &TcpStream, bytes: &mut [u8], input_flags: u32) -> io::Result<(usize, u32)> {
    let socket = stream.as_raw_socket() as _;
    let mut flags = input_flags;
    let count = match api {
        Api::Receive => {
            let buffer = WSABUF { len: bytes.len() as u32, buf: bytes.as_mut_ptr() };
            let mut count = 0;
            let result = unsafe { WSARecv(socket, &buffer, 1, &mut count, &mut flags, std::ptr::null_mut(), None) };
            if result == SOCKET_ERROR { return Err(io::Error::from_raw_os_error(unsafe { WSAGetLastError() })); }
            count as usize
        },
        Api::ReceiveEx => {
            let mut signed_flags = flags as i32;
            let count = unsafe { WSARecvEx(socket, bytes.as_mut_ptr(), bytes.len() as i32, &mut signed_flags) };
            if count == SOCKET_ERROR { return Err(io::Error::from_raw_os_error(unsafe { WSAGetLastError() })); }
            flags = signed_flags as u32;
            count as usize
        },
    };
    Ok((count, flags))
}

fn observe(api: Api, inline: bool, peek: bool, chunk: usize) {
    let (socket, mut peer) = pair();
    if inline { platform::inline_fixture(&socket.stream).unwrap(); }
    // 普通流含同一个控制值：不能按payload值推断边界。
    let before = [0xb2, 0, 0x80, b'a'];
    let after = [0xb2, 0xff, 0x02, b'z'];
    peer.write_all(&before).unwrap(); send_urgent_fixture(&peer, 0xb2); peer.write_all(&after).unwrap();
    peer.shutdown(Shutdown::Write).unwrap();
    let expected = if inline { [&before[..], &[0xb2], &after[..]].concat() } else { [before, after].concat() };
    until(|| (platform::pending_bytes_fixture(&socket.stream).unwrap() as usize == expected.len()).then_some(()));
    let mut bytes = [0_u8; 128];
    if peek {
        assert_eq!(api, Api::Receive, "WSARecvEx ignores input flags and cannot peek");
        let first = receive(api, &socket.stream, &mut bytes, MSG_PEEK as _).unwrap();
        let second = receive(api, &socket.stream, &mut bytes, MSG_PEEK as _).unwrap();
        assert_eq!(first, second, "peek observations changed without consumption");
        println!("windows_receive_api api={api:?} inline={inline} peek_count={} peek_flags={}", first.0, first.1);
    }
    let mut output = Vec::new();
    let mut observations = Vec::new();
    until(|| {
        let mark = platform::at_mark(&socket.stream).unwrap();
        match receive(api, &socket.stream, &mut bytes[..chunk], 0) {
            Ok((0, flags)) => {
                observations.push((output.len(), 0, flags, mark));
                Some(())
            },
            Ok((count, flags)) => {
                observations.push((output.len(), count, flags, mark));
                output.extend_from_slice(&bytes[..count]);
                None
            },
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => None,
            Err(error) => panic!("native receive error code: {:?}", error.raw_os_error()),
        }
    });
    assert_eq!(output, expected);
    if !inline { assert_eq!(socket.urgent(false).unwrap(), Some(0xb2)); }
    println!("windows_receive_api api={api:?} inline={inline} peek={peek} chunk={chunk} observations={observations:?}");
    assert!(!NativeSocket::supports_urgent_boundary(), "probe must not silently enable runtime IO");
    socket.close().unwrap();
}

#[test]
fn windows_receive_apis_preserve_fixture_bytes_and_record_native_flags() {
    for api in [Api::Receive, Api::ReceiveEx] {
        for inline in [false, true] {
            let peeks: &[bool] = if api == Api::Receive { &[false, true] } else { &[false] };
            for &peek in peeks {
                for chunk in [1, 128] { observe(api, inline, peek, chunk); }
            }
        }
    }
}

#[test]
fn windows_peek_observes_before_mark_at_mark_and_after_consumption() {
    for prefix_len in [0, 1, 4, 8193] {
        let (mut socket, mut peer) = pair();
        let prefix = vec![0x82; prefix_len];
        let tail = [0x82, 0, 0x02, 0x80, 0xff, b'z'];
        peer.write_all(&prefix).unwrap(); send_urgent_fixture(&peer, 0x82); peer.write_all(&tail).unwrap();
        peer.shutdown(Shutdown::Write).unwrap();
        until(|| (platform::pending_bytes_fixture(&socket.stream).unwrap() as usize == prefix_len + tail.len()).then_some(()));
        let mut buffer = vec![0; 32768];
        let initial = receive(Api::Receive, &socket.stream, &mut buffer, MSG_PEEK as _);
        let std_initial = socket.stream.peek(&mut buffer);
        println!("windows_peek_cursor prefix={prefix_len} initial={initial:?} std_initial={std_initial:?}");
        let mut received = Vec::new();
        until(|| {
            if received.len() == prefix_len { return Some(()); }
            if let Some(count) = socket.read(&mut buffer[..(prefix_len-received.len()).min(32768)]).unwrap() {
                assert_ne!(count, 0); received.extend_from_slice(&buffer[..count]);
            }
            None
        });
        assert_eq!(received, prefix);
        let at = receive(Api::Receive, &socket.stream, &mut buffer, MSG_PEEK as _);
        let repeated = receive(Api::Receive, &socket.stream, &mut buffer, MSG_PEEK as _);
        let std_at = socket.stream.peek(&mut buffer);
        println!("windows_peek_cursor prefix={prefix_len} at={at:?} repeated={repeated:?} std_at={std_at:?} mark={:?}", platform::at_mark(&socket.stream));
        assert_eq!(socket.urgent(false).unwrap(), Some(0x82));
        let after = receive(Api::Receive, &socket.stream, &mut buffer, MSG_PEEK as _);
        println!("windows_peek_cursor prefix={prefix_len} after={after:?}");
        let mut received = Vec::new();
        until(|| {
            if let Some(count) = socket.read(&mut buffer).unwrap() {
                if count == 0 { return Some(()); }
                received.extend_from_slice(&buffer[..count]);
            }
            None
        });
        assert_eq!(received, tail);
        socket.close().unwrap();
    }
}
