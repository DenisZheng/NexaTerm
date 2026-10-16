//! L0 原生协议核。尚未接入终端、OOB transport 或协议能力声明。
mod wire;
pub use wire::{encode_request, window_size_frame, Handshake, HandshakeProgress, ProtocolError,
    DEFAULT_PORT, MAX_REJECTION_BYTES, MAX_TERMINAL_BYTES, MAX_USER_BYTES};
#[cfg(test)] mod tests;
