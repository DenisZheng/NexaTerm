//! Protocol-local error mapping preserves the established terminal contract.
use super::SessionError;
#[cfg(test)] pub(super) use crate::legacy_text::MAX_TEXT_BYTES;
#[derive(Clone,Copy)]
pub(super) struct SessionEncoding(crate::legacy_text::SessionEncoding);
impl SessionEncoding {
    pub fn new(label:&str)->Result<Self,SessionError>{crate::legacy_text::SessionEncoding::new(label).map(Self).map_err(Into::into)}
    pub fn encode(self,data:&str)->Result<Vec<u8>,SessionError>{self.0.encode(data).map_err(Into::into)}
}
impl From<crate::legacy_text::TextError> for SessionError {fn from(error:crate::legacy_text::TextError)->Self {
    use crate::legacy_text::TextError as E;match error{E::InvalidEncoding=>Self::InvalidEncoding,E::EncodingFailed=>Self::EncodingFailed,E::InvalidChunk=>Self::InvalidChunk}
}}
