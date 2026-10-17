use super::{Ack, OutputFrame, Phase, ReadReply, SessionError, SessionStatus};
use crate::legacy_socket::MAX_CHUNK;
use crate::rlogin_connect::WindowSize;
use std::collections::VecDeque;

pub(super) const BYTE_BUDGET: usize = 1024 * 1024;
pub(super) const INPUT_LIMIT: usize = BYTE_BUDGET - MAX_CHUNK - 24;
pub(super) const OUTPUT_LIMIT: usize = BYTE_BUDGET - 3 * MAX_CHUNK;
pub(super) const ITEM_LIMIT: usize = 32;
pub(super) struct Queues {
    pub phase: Phase, pub reason: Option<SessionError>,
    input: VecDeque<Vec<u8>>, input_bytes: usize, input_items: usize,
    output: VecDeque<Vec<u8>>, output_bytes: usize, flight: Option<OutputFrame>, last_ack: Option<Ack>,
    epoch: u64, next_sequence: u64, pub resize: Option<WindowSize>,
}
impl Queues {
    pub fn new() -> Self {
        Self { phase: Phase::Reserved, reason: None, input: VecDeque::new(), input_bytes: 0, input_items: 0,
            output: VecDeque::new(), output_bytes: 0, flight: None, last_ack: None, epoch: 0, next_sequence: 1, resize: None }
    }
    pub fn write(&mut self, bytes: &[u8]) -> Result<(), SessionError> {
        if bytes.len() > MAX_CHUNK { return Err(SessionError::InvalidChunk); }
        if self.phase != Phase::InitialExchangeReady { return Err(SessionError::NotReady); }
        if bytes.is_empty() { return Ok(()); }
        if self.input_items >= ITEM_LIMIT || self.input_bytes + bytes.len() > INPUT_LIMIT { return Err(SessionError::Busy); }
        self.input.push_back(bytes.to_vec()); self.input_bytes += bytes.len(); self.input_items += 1; Ok(())
    }
    pub fn take_input(&mut self) -> Option<Vec<u8>> { self.input.pop_front() }
    pub fn input_complete(&mut self, original: usize) -> Result<(), SessionError> {
        let bytes = self.input_bytes.checked_sub(original).ok_or(SessionError::Unavailable)?;
        let items = self.input_items.checked_sub(1).ok_or(SessionError::Unavailable)?;
        self.input_bytes = bytes; self.input_items = items; Ok(())
    }
    pub fn can_read(&self) -> bool {
        self.output.len() + usize::from(self.flight.is_some()) < ITEM_LIMIT && self.output_bytes + MAX_CHUNK <= OUTPUT_LIMIT
    }
    pub fn push_output(&mut self, bytes: &[u8]) -> Result<(), SessionError> {
        if bytes.is_empty() || bytes.len() > MAX_CHUNK { return Err(SessionError::InvalidChunk); }
        if !self.can_read() { return Err(SessionError::Busy); }
        self.output.push_back(bytes.to_vec()); self.output_bytes += bytes.len(); Ok(())
    }
    pub fn flush(&mut self) -> Result<(), SessionError> {
        let epoch = self.epoch.checked_add(1).ok_or(SessionError::Unavailable)?;
        self.output.clear(); self.output_bytes = self.flight.as_ref().map_or(0, |f| f.data.len()); self.epoch = epoch; Ok(())
    }
    fn acknowledge(&mut self, ack: Ack) -> Result<(), SessionError> {
        if self.last_ack == Some(ack) { return Ok(()); }
        let flight = self.flight.as_ref().filter(|f| f.epoch == ack.epoch && f.sequence == ack.sequence).ok_or(SessionError::InvalidAck)?;
        let remaining = self.output_bytes.checked_sub(flight.data.len()).ok_or(SessionError::Unavailable)?;
        self.flight = None; self.output_bytes = remaining; self.last_ack = Some(ack); Ok(())
    }
    pub fn read(&mut self, last_epoch: u64, ack: Option<Ack>, done: bool) -> Result<ReadReply, SessionError> {
        if last_epoch > self.epoch { return Err(SessionError::InvalidAck); }
        if let Some(ack) = ack { self.acknowledge(ack)?; }
        let reset = last_epoch != self.epoch;
        let mut frame = None;
        if !reset && self.flight.is_none() && !self.output.is_empty() {
            let next = self.next_sequence.checked_add(1).ok_or(SessionError::Unavailable)?;
            let data = self.output.pop_front().ok_or(SessionError::Unavailable)?;
            frame = Some(OutputFrame { epoch: self.epoch, sequence: self.next_sequence, data: data.clone() });
            self.flight = Some(OutputFrame { epoch: self.epoch, sequence: self.next_sequence, data }); self.next_sequence = next;
        }
        Ok(ReadReply { epoch: self.epoch, phase: self.phase, reason: self.reason, requires_reset: reset,
            awaiting_ack: self.flight.is_some(), finished: done && self.flight.is_none() && self.output.is_empty(), frame })
    }
    pub fn finish(&mut self, phase: Phase, reason: Option<SessionError>) {
        self.phase = phase; self.reason = reason; self.input.clear(); self.input_bytes = 0; self.input_items = 0; self.resize = None;
    }
    pub fn status(&self, done: bool) -> SessionStatus {
        SessionStatus { epoch: self.epoch, phase: self.phase, reason: self.reason, awaiting_ack: self.flight.is_some(),
            finished: done && self.flight.is_none() && self.output.is_empty() }
    }
}
