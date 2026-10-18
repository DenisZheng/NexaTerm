use super::{TaskError,Phase,Stream,OutputFrame,TaskStatus,ReadReply};
use crate::{legacy_socket::MAX_CHUNK,rsh::Signal};
use std::collections::VecDeque;
const BYTE_BUDGET:usize=1024*1024;
// Per stream: queue+flight, transport ACK tail, actor scratch and response copy <=1MiB.
const OUTPUT_LIMIT:usize=BYTE_BUDGET-3*MAX_CHUNK;
const INPUT_LIMIT:usize=BYTE_BUDGET-MAX_CHUNK;
const ITEMS:usize=32;
struct Output {chunks:VecDeque<Vec<u8>>,bytes:usize}
pub(super) struct Queues {
    pub phase:Phase,pub reason:Option<TaskError>,input:VecDeque<Vec<u8>>,input_bytes:usize,input_items:usize,
    pub eof_requested:bool,pub stdin_eof:bool,pub output_eof:[bool;2],
    pub signals:VecDeque<Signal>,output:[Output;2],flight:Option<OutputFrame>,last_ack:Option<u64>,next_sequence:u64,next_stream:Stream,
}
impl Queues {
    pub fn new()->Self{Self{phase:Phase::Reserved,reason:None,input:VecDeque::new(),input_bytes:0,input_items:0,
        eof_requested:false,stdin_eof:false,output_eof:[false;2],signals:VecDeque::new(),
        output:std::array::from_fn(|_|Output{chunks:VecDeque::new(),bytes:0}),flight:None,last_ack:None,next_sequence:1,next_stream:Stream::Stdout}}
    fn ready(&self)->Result<(),TaskError>{if self.phase==Phase::InitialExchangeReady{Ok(())}else{Err(TaskError::NotReady)}}
    pub fn write(&mut self,bytes:&[u8])->Result<(),TaskError>{
        self.ready()?;if self.eof_requested{return Err(TaskError::StdinClosed);}
        if bytes.len()>MAX_CHUNK{return Err(TaskError::InvalidChunk);}if bytes.is_empty(){return Ok(());}
        if self.input_items>=ITEMS || self.input_bytes+bytes.len()>INPUT_LIMIT{return Err(TaskError::Busy);}
        self.input.push_back(bytes.to_vec());self.input_bytes+=bytes.len();self.input_items+=1;Ok(())
    }
    pub fn close_stdin(&mut self)->Result<(),TaskError>{self.ready()?;self.eof_requested=true;Ok(())}
    pub fn signal(&mut self,signal:Signal)->Result<(),TaskError>{self.ready()?;
        if self.signals.len()>=ITEMS{return Err(TaskError::Busy);}self.signals.push_back(signal);Ok(())}
    pub fn take_input(&mut self)->Option<Vec<u8>>{self.input.pop_front()}
    pub fn input_complete(&mut self,bytes:usize)->Result<(),TaskError>{
        self.input_bytes=self.input_bytes.checked_sub(bytes).ok_or(TaskError::Unavailable)?;
        self.input_items=self.input_items.checked_sub(1).ok_or(TaskError::Unavailable)?;Ok(())
    }
    pub fn eof_ready(&self)->bool{self.eof_requested && self.input_items==0 && !self.stdin_eof}
    pub fn can_read(&self,stream:Stream)->bool{let out=&self.output[stream.index()];
        !self.output_eof[stream.index()] && out.bytes+MAX_CHUNK<=OUTPUT_LIMIT &&
        out.chunks.len()+usize::from(self.flight.as_ref().is_some_and(|f|f.stream==stream))<ITEMS
    }
    pub fn push_output(&mut self,stream:Stream,bytes:&[u8])->Result<(),TaskError>{
        if bytes.is_empty()||bytes.len()>MAX_CHUNK{return Err(TaskError::InvalidChunk);}
        if !self.can_read(stream){return Err(TaskError::Busy);}
        let out=&mut self.output[stream.index()];out.bytes+=bytes.len();out.chunks.push_back(bytes.to_vec());Ok(())
    }
    fn acknowledge(&mut self,sequence:u64)->Result<(),TaskError>{
        if self.last_ack==Some(sequence){return Ok(());}
        let flight=self.flight.as_ref().filter(|f|f.sequence==sequence).ok_or(TaskError::InvalidAck)?;
        let out=&mut self.output[flight.stream.index()];out.bytes=out.bytes.checked_sub(flight.data.len()).ok_or(TaskError::Unavailable)?;
        self.flight=None;self.last_ack=Some(sequence);Ok(())
    }
    pub fn read(&mut self,ack:Option<u64>,done:bool)->Result<ReadReply,TaskError>{
        if let Some(sequence)=ack{self.acknowledge(sequence)?;}
        let mut frame=None;
        if self.flight.is_none(){
            let first=self.next_stream;let other=if first==Stream::Stdout{Stream::Stderr}else{Stream::Stdout};
            let stream=if !self.output[first.index()].chunks.is_empty(){first}else{other};
            if !self.output[stream.index()].chunks.is_empty(){
                let next=self.next_sequence.checked_add(1).ok_or(TaskError::Unavailable)?;
                let data=self.output[stream.index()].chunks.pop_front().ok_or(TaskError::Unavailable)?;
                frame=Some(OutputFrame{sequence:self.next_sequence,stream,data:data.clone()});
                self.flight=Some(OutputFrame{sequence:self.next_sequence,stream,data});self.next_sequence=next;self.next_stream=other;
            }
        }Ok(ReadReply{status:self.status(done),frame})
    }
    pub fn status(&self,done:bool)->TaskStatus{TaskStatus{phase:self.phase,reason:self.reason,stdin_eof:self.stdin_eof,
        stdout_eof:self.output_eof[0],stderr_eof:self.output_eof[1],awaiting_ack:self.flight.is_some(),
        finished:done && self.flight.is_none() && self.output.iter().all(|o|o.chunks.is_empty())}}
    pub fn finish(&mut self,phase:Phase,reason:Option<TaskError>){self.phase=phase;self.reason=reason;
        self.input.clear();self.input_bytes=0;self.input_items=0;self.signals.clear();}
}
#[cfg(test)] mod tests;
