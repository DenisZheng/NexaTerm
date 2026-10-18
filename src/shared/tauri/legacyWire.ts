/** Exact legacy IPC primitives; consumers keep protocol-specific errors. */
export function compareCounter(a:string,b:string){return a.length-b.length || (a<b?-1:a>b?1:0);}
export function isCounter(value:unknown):value is string{return typeof value==="string" && /^(0|[1-9][0-9]{0,19})$/.test(value) && compareCounter(value,"18446744073709551615")<=0;}
export function isLegacyId(value:unknown):value is string{return typeof value==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);}
export function isByteChunk(value:unknown,limit=32768):value is readonly number[]{
  if(!Array.isArray(value)||value.length===0||value.length>limit)return false;
  for(const byte of value)if(!Number.isInteger(byte)||byte<0||byte>255)return false;return true;
}
