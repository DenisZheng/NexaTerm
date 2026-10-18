//! 编码属于冻结的会话配置；绝不替换不可表示字符或保留输入到错误中。

use crate::legacy_socket::MAX_CHUNK;
use encoding_rs::Encoding;

pub(crate) const MAX_TEXT_BYTES: usize = 4096;
#[derive(Clone, Copy)]
pub(crate) struct SessionEncoding(&'static Encoding);
impl SessionEncoding {
    pub fn new(label: &str) -> Result<Self, TextError> {
        if !matches!(label, "utf-8" | "gbk" | "gb18030" | "big5" | "euc-jp" | "iso-2022-jp" | "shift-jis" | "euc-kr") {
            return Err(TextError::InvalidEncoding);
        }
        Encoding::for_label_no_replacement(label.as_bytes()).map(Self).ok_or(TextError::InvalidEncoding)
    }
    pub fn encode(self, data: &str) -> Result<Vec<u8>, TextError> { self.encode_limited(data, MAX_TEXT_BYTES, MAX_CHUNK) }
    pub fn encode_limited(self, data:&str, text_limit:usize, encoded_limit:usize)->Result<Vec<u8>,TextError> {
        // 在编码分配前限制输入；最坏的不可表示字符临时替代也受该固定预算约束。
        if data.len() > text_limit { return Err(TextError::InvalidChunk); }
        if std::ptr::eq(self.0,encoding_rs::ISO_2022_JP) {
            // ISO-2022-JP文本编码器拒绝ESC/SI/SO；终端按键必须保留这些控制字节。
            let mut output=Vec::new(); let mut start=0;
            for (offset,ch) in data.char_indices() {
                if matches!(ch,'\u{1b}' | '\u{e}' | '\u{f}') {
                    self.append(&data[start..offset],&mut output,encoded_limit)?;
                    if output.len()>=encoded_limit { return Err(TextError::InvalidChunk); }
                    output.push(ch as u8); start=offset+1;
                }
            }
            self.append(&data[start..],&mut output,encoded_limit)?; return Ok(output);
        }
        let mut output=Vec::new(); self.append(data,&mut output,encoded_limit)?; Ok(output)
    }
    fn append(self, data: &str, output: &mut Vec<u8>,limit:usize) -> Result<(), TextError> {
        if data.is_empty() { return Ok(()); }
        let (bytes, _, had_errors) = self.0.encode(data);
        if had_errors { return Err(TextError::EncodingFailed); }
        if output.len()+bytes.len() > limit { return Err(TextError::InvalidChunk); }
        output.extend_from_slice(&bytes); Ok(())
    }
}

#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub(crate) enum TextError {InvalidEncoding,EncodingFailed,InvalidChunk}
