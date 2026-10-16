//! Local direct-route probes. No SSH, shell, credentials, logging or persistence.
//! Share one engine per application when integrating the future IPC owner.
use std::future::Future;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::net::{TcpSocket, TcpStream};
use tokio::sync::{watch, Semaphore};

const MAX_CONCURRENT: usize = 4;
const MAX_ADDRESSES: usize = 16;
const TOTAL_TIMEOUT: Duration = Duration::from_secs(5);
const ADDRESS_TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProbeKind { Dns, Tcp, LocalPort }

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProbeStatus { Success, Cancelled, TimedOut, Unavailable, Failed, InvalidInput }

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProbeReason {
    Resolved, Connected, Cancelled, Deadline, Busy, InvalidHost, InvalidPort,
    ResolutionFailed, NoAddresses, ConnectionRefused, ConnectFailed, AddressLimit, WorkerUnavailable,
    PortAvailable, AddressInUse, PermissionDenied, BindFailed,
}

#[derive(Debug, Serialize)]
pub struct ProbeResult {
    pub kind: ProbeKind,
    pub status: ProbeStatus,
    pub reason: ProbeReason,
    pub duration_ms: u64,
    /// Bounded count only; no resolved address or input target crosses this contract.
    pub address_count: usize,
    pub addresses_truncated: bool,
}

#[derive(Clone)]
pub struct ProbeCancellation(watch::Sender<bool>);
impl Default for ProbeCancellation {
    fn default() -> Self { Self(watch::channel(false).0) }
}
impl ProbeCancellation {
    pub fn cancel(&self) { self.0.send_replace(true); }
    pub(crate) fn is_cancelled(&self) -> bool { *self.0.borrow() }
}

#[derive(Clone)]
pub struct ProbeEngine {
    operations: Arc<Semaphore>,
    resolvers: Arc<Semaphore>,
}
impl Default for ProbeEngine {
    fn default() -> Self {
        Self { operations: Arc::new(Semaphore::new(MAX_CONCURRENT)),
            resolvers: Arc::new(Semaphore::new(MAX_CONCURRENT)) }
    }
}

type Outcome = (ProbeStatus, ProbeReason);
struct Addresses { values: Vec<SocketAddr>, truncated: bool }

impl ProbeEngine {
    pub async fn probe(&self, kind: ProbeKind, host: &str, port: u16,
        cancellation: &ProbeCancellation) -> ProbeResult {
        let started = Instant::now();
        let mut result = ProbeResult { kind, status: ProbeStatus::Failed,
            reason: ProbeReason::ConnectFailed, duration_ms: 0, address_count: 0,
            addresses_truncated: false };
        let outcome = if cancellation.is_cancelled() {
            (ProbeStatus::Cancelled, ProbeReason::Cancelled)
        } else if !valid_host(host) || (kind == ProbeKind::LocalPort && host != "127.0.0.1") {
            (ProbeStatus::InvalidInput, ProbeReason::InvalidHost)
        } else if kind != ProbeKind::Dns && port == 0 {
            (ProbeStatus::InvalidInput, ProbeReason::InvalidPort)
        } else if let Ok(_permit) = self.operations.clone().try_acquire_owned() {
            bounded(cancellation, TOTAL_TIMEOUT, async {
                if kind == ProbeKind::LocalPort { return bind_local_port(port); }
                let addresses = match self.resolve(host, port).await {
                    Ok(value) => value,
                    Err(outcome) => return outcome,
                };
                result.address_count = addresses.values.len();
                result.addresses_truncated = addresses.truncated;
                if addresses.values.is_empty() { return (ProbeStatus::Failed, ProbeReason::NoAddresses); }
                if kind == ProbeKind::Dns { return (ProbeStatus::Success, ProbeReason::Resolved); }
                connect_addresses(addresses).await
            }).await
        } else { (ProbeStatus::Unavailable, ProbeReason::Busy) };
        result.status = outcome.0;
        result.reason = outcome.1;
        result.duration_ms = started.elapsed().as_millis() as u64;
        result
    }

    async fn resolve(&self, host: &str, port: u16) -> Result<Addresses, Outcome> {
        if let Ok(ip) = host.parse::<IpAddr>() {
            return Ok(Addresses { values: vec![SocketAddr::new(ip, port)], truncated: false });
        }
        let host = host.to_owned();
        self.resolve_with(move || (host.as_str(), port).to_socket_addrs().map(collect_addresses)).await
    }

    async fn resolve_with<F>(&self, resolver: F) -> Result<Addresses, Outcome>
    where F: FnOnce() -> std::io::Result<Addresses> + Send + 'static {
        let permit = self.resolvers.clone().try_acquire_owned()
            .map_err(|_| (ProbeStatus::Unavailable, ProbeReason::Busy))?;
        // The OS resolver cannot be forcibly cancelled. Its permit belongs to the worker,
        // not the JoinHandle, and survives a dropped/timed-out caller.
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            resolver().map_err(|_| (ProbeStatus::Failed, ProbeReason::ResolutionFailed))
        }).await.map_err(|_| (ProbeStatus::Unavailable, ProbeReason::WorkerUnavailable))?
    }
}

fn bind_local_port(port: u16) -> Outcome {
    // Bind only: never listen, accept, resolve names or retain a reservation.
    let result = TcpSocket::new_v4().and_then(|socket| {
        socket.bind(SocketAddr::from(([127, 0, 0, 1], port)))
    });
    local_bind_outcome(result)
}

fn local_bind_outcome(result: std::io::Result<()>) -> Outcome {
    use std::io::ErrorKind;
    match result {
        Ok(()) => (ProbeStatus::Success, ProbeReason::PortAvailable),
        Err(error) => (ProbeStatus::Failed, match error.kind() {
            ErrorKind::AddrInUse => ProbeReason::AddressInUse,
            ErrorKind::PermissionDenied => ProbeReason::PermissionDenied,
            _ => ProbeReason::BindFailed,
        }),
    }
}

fn valid_host(host: &str) -> bool {
    if host.is_empty() || host.len() > 253 { return false; }
    if host.parse::<IpAddr>().is_ok() { return true; }
    let name = host.strip_suffix('.').unwrap_or(host);
    name.split('.').all(|label| !label.is_empty() && label.len() <= 63 &&
        !label.starts_with('-') && !label.ends_with('-') &&
        label.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-'))
}

fn collect_addresses(addresses: impl Iterator<Item = SocketAddr>) -> Addresses {
    let mut values: Vec<_> = addresses.take(MAX_ADDRESSES + 1).collect();
    let truncated = values.len() > MAX_ADDRESSES;
    values.truncate(MAX_ADDRESSES);
    Addresses { values, truncated }
}

async fn bounded(cancellation: &ProbeCancellation, duration: Duration,
    future: impl Future<Output = Outcome>) -> Outcome {
    let mut receiver = cancellation.0.subscribe();
    if *receiver.borrow() { return (ProbeStatus::Cancelled, ProbeReason::Cancelled); }
    tokio::select! {
        biased;
        _ = receiver.changed() => (ProbeStatus::Cancelled, ProbeReason::Cancelled),
        result = tokio::time::timeout(duration, future) => result.unwrap_or((ProbeStatus::TimedOut, ProbeReason::Deadline)),
    }
}

async fn connect_addresses(addresses: Addresses) -> Outcome {
    connect_addresses_with(addresses, |address| async move {
        TcpStream::connect(address).await.map(drop)
    }).await
}

async fn connect_addresses_with<F, Fut>(addresses: Addresses, mut connect: F) -> Outcome
where F: FnMut(SocketAddr) -> Fut, Fut: Future<Output = std::io::Result<()>> {
    let mut timed_out = false;
    let mut all_refused = true;
    for address in addresses.values {
        match tokio::time::timeout(ADDRESS_TIMEOUT, connect(address)).await {
            Ok(Ok(())) => return (ProbeStatus::Success, ProbeReason::Connected),
            Ok(Err(error)) => {
                timed_out |= error.kind() == std::io::ErrorKind::TimedOut;
                all_refused &= error.kind() == std::io::ErrorKind::ConnectionRefused;
            }
            Err(_) => { timed_out = true; all_refused = false; }
        }
    }
    if timed_out { (ProbeStatus::TimedOut, ProbeReason::Deadline) }
    else if addresses.truncated { (ProbeStatus::Unavailable, ProbeReason::AddressLimit) }
    else if all_refused { (ProbeStatus::Failed, ProbeReason::ConnectionRefused) }
    else { (ProbeStatus::Failed, ProbeReason::ConnectFailed) }
}

#[cfg(test)]
#[path = "connection_probe_tests.rs"]
mod tests;
