//! L0 纯协议核；原生建立和 OOB 分别见 rlogin_connect/rlogin_native，无终端能力声明。
mod wire;
pub use wire::{encode_request, window_size_frame, Handshake, HandshakeProgress, ProtocolError,
    DEFAULT_PORT, MAX_REJECTION_BYTES, MAX_TERMINAL_BYTES, MAX_USER_BYTES};
#[cfg(test)] mod tests;
