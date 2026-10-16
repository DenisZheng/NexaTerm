use super::NativeSocket;
use std::{io, net::{Ipv4Addr, TcpListener, TcpStream}, time::{Duration, Instant}};
pub(crate) fn until<T>(mut operation: impl FnMut() -> Option<T>) -> T {
    let deadline = Instant::now() + Duration::from_secs(4);
    loop {
        if let Some(value) = operation() { return value; }
        assert!(Instant::now() < deadline, "native socket fixture did not complete");
        std::thread::sleep(Duration::from_millis(2));
    }
}
pub(crate) fn pair() -> (NativeSocket, TcpStream) {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap(); listener.set_nonblocking(true).unwrap();
    let client = TcpStream::connect_timeout(&listener.local_addr().unwrap(), Duration::from_secs(2)).unwrap();
    let server = until(|| match listener.accept() {
        Ok((stream, _)) => Some(stream), Err(error) if error.kind() == io::ErrorKind::WouldBlock => None,
        Err(error) => panic!("fixture accept failed: {error}"),
    });
    server.set_nonblocking(false).unwrap();
    server.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    server.set_write_timeout(Some(Duration::from_secs(2))).unwrap();
    (NativeSocket::from_stream(client).unwrap(), server)
}
