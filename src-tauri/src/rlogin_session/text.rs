//! 编码属于冻结的会话配置；绝不替换不可表示字符或保留输入到错误中。
use super::SessionError;
use crate::legacy_socket::MAX_CHUNK;
use encoding_rs::Encoding;

pub(super) const MAX_TEXT_BYTES: usize = 4096;
#[derive(Clone, Copy)]
pub(super) struct SessionEncoding(&'static Encoding);
impl SessionEncoding {
    pub fn new(label: &str) -> Result<Self, SessionError> {
        if !matches!(label, "utf-8" | "gbk" | "gb18030" | "big5" | "euc-jp" | "iso-2022-jp" | "shift-jis" | "euc-kr") {
            return Err(SessionError::InvalidEncoding);
        }
        Encoding::for_label_no_replacement(label.as_bytes()).map(Self).ok_or(SessionError::InvalidEncoding)
    }
    pub fn encode(self, data: &str) -> Result<Vec<u8>, SessionError> {
        // 在编码分配前限制输入；最坏的不可表示字符临时替代也受该固定预算约束。
        if data.len() > MAX_TEXT_BYTES { return Err(SessionError::InvalidChunk); }
        if std::ptr::eq(self.0,encoding_rs::ISO_2022_JP) {
            // ISO-2022-JP文本编码器拒绝ESC/SI/SO；终端按键必须保留这些控制字节。
            let mut output=Vec::new(); let mut start=0;
            for (offset,ch) in data.char_indices() {
                if matches!(ch,'\u{1b}' | '\u{e}' | '\u{f}') {
                    self.append(&data[start..offset],&mut output)?;
                    if output.len()>=MAX_CHUNK { return Err(SessionError::InvalidChunk); }
                    output.push(ch as u8); start=offset+1;
                }
            }
            self.append(&data[start..],&mut output)?; return Ok(output);
        }
        let mut output=Vec::new(); self.append(data,&mut output)?; Ok(output)
    }
    fn append(self, data: &str, output: &mut Vec<u8>) -> Result<(), SessionError> {
        if data.is_empty() { return Ok(()); }
        let (bytes, _, had_errors) = self.0.encode(data);
        if had_errors { return Err(SessionError::EncodingFailed); }
        if output.len()+bytes.len() > MAX_CHUNK { return Err(SessionError::InvalidChunk); }
        output.extend_from_slice(&bytes); Ok(())
    }
}
