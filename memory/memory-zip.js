/* PROMPT DE EDICAO: memory-zip.js parte 1/3
   Escritor/leitor .ZIP puro-JS STORE sem dependencias.
   Ordem: 1.crc32 2.enc/dec 3.write 4.read 5.download */
(function (global) {
'use strict';
function makeCrcTable() {
  var t = new Uint32Array(256), c, n, k;
  for (n = 0; n < 256; n++) {
    c = n;
    for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
}
var CRC_TABLE = makeCrcTable();
function crc32(bytes) {
  var crc = 0xFFFFFFFF, i;
  for (i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
var _te = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;
var _td = (typeof TextDecoder !== 'undefined') ? new TextDecoder() : null;
function _enc(str) {
  if (_te) return _te.encode(str);
  var out = [], i, c;
  for (i = 0; i < str.length; i++) {
    c = str.charCodeAt(i);
    if (c < 128) out.push(c);
    else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
    else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  return new Uint8Array(out);
}
function _dec(bytes) {
  if (_td) return _td.decode(bytes);
  var s = '', i;
  for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
function _dosTime(date) {
  date = date || new Date();
  var t = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() >> 1) & 31);
  var d = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  return { t: t, d: d };
}
function _u16(v, arr) { arr.push(v & 255, (v >> 8) & 255); }
function _u32(v, arr) { arr.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255); }
global.__memZipBase = { crc32: crc32, enc: _enc, dec: _dec, dos: _dosTime, u16: _u16, u32: _u32 };
})(typeof window !== 'undefined' ? window : this);
/* PARTE 2/3: write STORE + read */
(function (global) {
'use strict';
var B = global.__memZipBase;
function zipWrite(files) {
  var names = Object.keys(files), chunks = [], offset = 0, dt = B.dos(new Date());
  names.forEach(function (name) {
    var safe = String(name).replace(/^\/+/, '').replace(/\.\./g, '_');
    var data = B.enc(String(files[name] == null ? '' : files[name]));
    var crc = B.crc32(data), nb = B.enc(safe), lh = [];
    B.u32(0x04034b50, lh); B.u16(20, lh); B.u16(0x0800, lh); B.u16(0, lh);
    B.u16(dt.t, lh); B.u16(dt.d, lh); B.u32(crc, lh);
    B.u32(data.length, lh); B.u32(data.length, lh);
    B.u16(nb.length, lh); B.u16(0, lh);
    var h = new Uint8Array(lh);
    chunks.push({ h: h, name: nb, data: data, crc: crc, off: offset });
    offset += h.length + nb.length + data.length;
  });
  var cOff = offset, cSize = 0, centrals = [];
  chunks.forEach(function (c) {
    var ch = [];
    B.u32(0x02014b50, ch); B.u16(20, ch); B.u16(20, ch);
    B.u16(0x0800, ch); B.u16(0, ch); B.u16(dt.t, ch); B.u16(dt.d, ch);
    B.u32(c.crc, ch); B.u32(c.data.length, ch); B.u32(c.data.length, ch);
    B.u16(c.name.length, ch); B.u16(0, ch); B.u16(0, ch);
    B.u16(0, ch); B.u16(0, ch); B.u32(0, ch); B.u32(c.off, ch);
    var h = new Uint8Array(ch);
    centrals.push({ h: h, name: c.name });
    cSize += h.length + c.name.length;
  });
  var end = [];
  B.u32(0x06054b50, end); B.u16(0, end); B.u16(0, end);
  B.u16(names.length, end); B.u16(names.length, end);
  B.u32(cSize, end); B.u32(cOff, end); B.u16(0, end);
  var endArr = new Uint8Array(end);
  var out = new Uint8Array(cOff + cSize + endArr.length), p = 0;
  chunks.forEach(function (c) {
    out.set(c.h, p); p += c.h.length;
    out.set(c.name, p); p += c.name.length;
    out.set(c.data, p); p += c.data.length;
  });
  centrals.forEach(function (c) {
    out.set(c.h, p); p += c.h.length;
    out.set(c.name, p); p += c.name.length;
  });
  out.set(endArr, p);
  return out;
}
global.__memZipWrite = zipWrite;
})(typeof window !== 'undefined' ? window : this);


/* PARTE 3/3: read + download */
(function (global) {
'use strict';
var B = global.__memZipBase;
function zipRead(buf) {
  var view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  var result = {}, pos = 0;
  while (pos + 30 < buf.length) {
    if (view.getUint32(pos, true) !== 0x04034b50) break;
    var fnLen = view.getUint16(pos + 26, true);
    var exLen = view.getUint16(pos + 28, true);
    var compSize = view.getUint32(pos + 18, true);
    var method = view.getUint16(pos + 8, true);
    var name = B.dec(buf.slice(pos + 30, pos + 30 + fnLen));
    var ds = pos + 30 + fnLen + exLen;
    var data = buf.slice(ds, ds + compSize);
    if (method === 0 && name.slice(-1) !== '/') result[name] = B.dec(data);
    pos = ds + compSize;
  }
  return result;
}
function zipDownload(bytes, filename, mime) {
  var blob = new Blob([bytes], { type: mime || 'application/zip' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename || 'memory.zip';
  document.body.appendChild(a); a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 600);
}
global.MemoryZip = { write: global.__memZipWrite, read: zipRead, download: zipDownload };
})(typeof window !== 'undefined' ? window : this);
