//! Rlogin-specific error mapping around the shared, owned resolver.
pub use crate::legacy_dns::Destination;
use crate::legacy_dns::ResolveError;
#[cfg(test)] use crate::legacy_dns::Resolver as SharedResolver;
use super::SessionError;
#[cfg(test)] use std::{net::SocketAddrV4, sync::{atomic::AtomicBool, Arc}, time::Instant};
#[cfg(test)]
#[derive(Default)]
pub(super) struct Resolver { shared: SharedResolver }
#[cfg(test)]
impl Resolver {
    #[cfg(test)]
    async fn resolve_with<F>(&self,cancel:&Arc<AtomicBool>,deadline:Instant,resolve:F)->Result<SocketAddrV4,SessionError>
    where F:FnOnce()->std::io::Result<Vec<std::net::SocketAddr>>+Send+'static {
        self.shared.resolve_with(cancel,deadline,resolve).await.map_err(Into::into)
    }
}
impl From<ResolveError> for SessionError { fn from(error:ResolveError)->Self {match error {
    ResolveError::Socket(error)=>error.into(),ResolveError::Busy=>Self::Busy,ResolveError::Failed=>Self::DnsFailed,
    ResolveError::NoIpv4=>Self::DnsNoIpv4,ResolveError::Unavailable=>Self::Unavailable,
}} }
#[cfg(test)] mod tests;
