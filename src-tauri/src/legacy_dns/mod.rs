//! Owned OS resolution: no credentials, cache, address publication or late dial.

use crate::legacy_socket::{valid, SocketError};
use std::{io, net::{Ipv4Addr, SocketAddr, SocketAddrV4, ToSocketAddrs}, sync::{atomic::{AtomicBool, Ordering}, Arc}, time::Instant};
use tokio::sync::Semaphore;
const MAX_RESOLVERS: usize = 4;
const MAX_ADDRESSES: usize = 16;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Destination { Address(SocketAddrV4), Host { name: String, port: u16 } }
impl From<SocketAddrV4> for Destination { fn from(value: SocketAddrV4) -> Self { Self::Address(value) } }
impl Destination {
    pub fn parse(host: &str, port: u16) -> Result<Self, ResolveError> {
        let invalid = || ResolveError::from(SocketError::InvalidAddress);
        if port == 0 || host.is_empty() || host.len() > 253 { return Err(invalid()); }
        if let Ok(ip) = host.parse::<Ipv4Addr>() {
            return if valid(ip) { Ok(Self::Address(SocketAddrV4::new(ip, port))) } else { Err(invalid()) };
        }
        // Malformed numeric input must never be reinterpreted by the OS as an alternate IP notation.
        if host.split('.').all(|label| label.bytes().all(|c| c.is_ascii_digit()) ||
            label.strip_prefix("0x").or_else(|| label.strip_prefix("0X")).is_some_and(|digits| !digits.is_empty() && digits.bytes().all(|c| c.is_ascii_hexdigit()))) {
            return Err(invalid());
        }
        let name = host.strip_suffix('.').unwrap_or(host);
        if !name.split('.').all(|label| !label.is_empty() && label.len() <= 63 &&
            !label.starts_with('-') && !label.ends_with('-') && label.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')) {
            return Err(invalid());
        }
        Ok(Self::Host { name: host.to_owned(), port })
    }
    pub fn validate(&self) -> Result<(), ResolveError> {
        match self {
            Self::Address(address) if valid(*address.ip()) && address.port() != 0 => Ok(()),
            Self::Address(_) => Err(SocketError::InvalidAddress.into()),
            Self::Host { name, port } => match Self::parse(name, *port)? {
                Self::Host { .. } => Ok(()), Self::Address(_) => Err(SocketError::InvalidAddress.into()),
            },
        }
    }
}
pub(crate) struct Resolver { permits: Arc<Semaphore> }
impl Default for Resolver { fn default() -> Self { Self { permits: Arc::new(Semaphore::new(MAX_RESOLVERS)) } } }
fn checkpoint(cancel: &AtomicBool, deadline: Instant) -> Result<(), ResolveError> {
    if cancel.load(Ordering::Acquire) { Err(SocketError::Cancelled.into()) }
    else if Instant::now() >= deadline { Err(SocketError::Timeout.into()) } else { Ok(()) }
}
fn first_ipv4(addresses: impl Iterator<Item=SocketAddr>) -> Result<SocketAddrV4, ResolveError> {
    let mut candidates = Vec::new();
    for address in addresses.take(MAX_ADDRESSES) {
        if let SocketAddr::V4(address) = address {
            if valid(*address.ip()) && address.port() != 0 && !candidates.contains(&address) { candidates.push(address); }
        }
    }
    candidates.into_iter().next().ok_or(ResolveError::NoIpv4)
}
impl Resolver {
    pub async fn resolve(&self, destination: &Destination, cancel: &Arc<AtomicBool>, deadline: Instant) -> Result<SocketAddrV4, ResolveError> {
        checkpoint(cancel, deadline)?; destination.validate()?;
        match destination {
            Destination::Address(address) => Ok(*address),
            Destination::Host { name, port } => {
                let name = name.clone(); let port = *port;
                self.resolve_with(cancel, deadline, move || (name.as_str(), port).to_socket_addrs()
                    .map(|addresses| addresses.take(MAX_ADDRESSES).collect())).await
            },
        }
    }
    pub(crate) async fn resolve_with<F>(&self, cancel: &Arc<AtomicBool>, deadline: Instant, resolve: F) -> Result<SocketAddrV4, ResolveError>
    where F: FnOnce() -> io::Result<Vec<SocketAddr>> + Send + 'static {
        checkpoint(cancel, deadline)?;
        let permit = self.permits.clone().try_acquire_owned().map_err(|_| ResolveError::Busy)?;
        let signal = cancel.clone();
        let result = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            checkpoint(&signal, deadline)?;
            let addresses = resolve().map_err(|_| ResolveError::Failed)?;
            checkpoint(&signal, deadline)?;
            first_ipv4(addresses.into_iter())
        }).await.map_err(|_| ResolveError::Unavailable)?;
        // Keep the actor/worker lease until the real OS call returns, even after cancellation/deadline.
        checkpoint(cancel, deadline)?; result
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResolveError { Socket(SocketError), Busy, Failed, NoIpv4, Unavailable }
impl From<SocketError> for ResolveError { fn from(error: SocketError) -> Self { Self::Socket(error) } }
#[cfg(test)] mod tests;
