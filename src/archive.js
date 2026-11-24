/** Small ZIP STORE writer for a few browser downloads. No external dependencies. */
const encoder = new TextEncoder();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(view, offset, number) { view.setUint16(offset, number, true); }
function u32(view, offset, number) { view.setUint32(offset, number, true); }
export function makeZip(files) {
  if (!Array.isArray(files) || files.length > 65535) throw new Error('Invalid ZIP file list');
  const parts = [], central = [];
  let position = 0;
  for (const { name, content } of files) {
    if (!name || /[\\]/.test(name) || name.startsWith('/') || name.split('/').includes('..')) throw new Error('Invalid ZIP entry name');
    const filename = encoder.encode(name);
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    if (!(data instanceof Uint8Array)) throw new Error('ZIP content must be text or Uint8Array');
    if (data.byteLength > 0xffffffff || position > 0xffffffff) throw new Error('ZIP entry exceeds ZIP32 limit');
    const checksum = crc32(data);
    const local = new Uint8Array(30 + filename.length), l = new DataView(local.buffer);
    u32(l,0,0x04034b50);u16(l,4,20);u16(l,6,0x0800);u16(l,8,0);u16(l,10,0);u16(l,12,33);
    u32(l,14,checksum);u32(l,18,data.length);u32(l,22,data.length);u16(l,26,filename.length);u16(l,28,0);
    local.set(filename,30);
    parts.push(local,data);
    const header = new Uint8Array(46 + filename.length), h = new DataView(header.buffer);
    u32(h,0,0x02014b50);u16(h,4,20);u16(h,6,20);u16(h,8,0x0800);u16(h,10,0);u16(h,12,0);u16(h,14,33);
    u32(h,16,checksum);u32(h,20,data.length);u32(h,24,data.length);u16(h,28,filename.length);
    u16(h,30,0);u16(h,32,0);u16(h,34,0);u16(h,36,0);u32(h,38,0);u32(h,42,position);
    header.set(filename,46);
    central.push(header);
    position += local.length + data.length;
  }
  const directorySize = central.reduce((sum, part) => sum + part.length, 0);
  if (position + directorySize + 22 > 0xffffffff) throw new Error('ZIP archive exceeds ZIP32 limit');
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  u32(e,0,0x06054b50);u16(e,4,0);u16(e,6,0);u16(e,8,files.length);u16(e,10,files.length);
  u32(e,12,directorySize);u32(e,16,position);u16(e,20,0);
  const output = new Uint8Array(position + directorySize + end.length);
  let offset = 0;
  for (const part of [...parts,...central,end]) { output.set(part,offset);offset += part.length; }
  return output;
}
