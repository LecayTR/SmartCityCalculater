// Belgeleri ortak bir tablo biçimine çeviren okuyucu. Hiçbir dosya sunucuya gönderilmez.
// Desteklenen biçimler ve Türkiye'deki tipik kaynakları:
//   .xlsx              – Excel 2007 ve sonrası; muhasebe ve envanter dökümleri
//   .ods               – LibreOffice / Pardus kullanan kurumlar
//   .xls (HTML)        – web tabanlı sistemlerin "Excel'e aktar" çıktıları (çoğu aslında HTML tablosudur)
//   .xls / .xml (2003) – Excel 2003 XML elektronik tablosu
//   .csv / .txt        – ; veya , ayraçlı; UTF-8 ya da Windows-1254 (Türkçe) kodlamalı
//   .xml (UBL-TR)      – e-Fatura
// Eski ikili .xls (Excel 97-2003) biçimi okunamaz; kullanıcıdan .xlsx olarak kaydetmesi istenir.
//
// Çıktı: { name, kind: 'table' | 'invoice', sheets: [{ name, rows: Cell[][] }], xml }
// Hücre: { v: sayı | metin, t: 'n' | 's' | 'd' | 'b', pct: yüzde biçimli mi, a: 'B3' }

import { parseXml, findAll, find, child, children, textOf, attr, rootElement, decodeEntities } from './xml.js';

export class ReadError extends Error {}

export function colName(c) {
  let s = '';
  for (c += 1; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
}
export const cellAddress = (r, c) => `${colName(c)}${r + 1}`;

function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function put(rows, r, c, cell) {
  while (rows.length <= r) rows.push([]);
  cell.a = cellAddress(r, c);
  rows[r][c] = cell;
}

// ---------- Metin kodlaması ----------

// Önce UTF-8 denenir; geçersiz bayt varsa Türkçe Windows kod sayfası (1254) kullanılır.
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1254').decode(u8);
  }
}

// ---------- CSV ----------

export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
  let best = ';', bestScore = -1;
  for (const d of [';', '\t', ',', '|']) {
    const counts = lines.map(l => splitCsvLine(l, d).length);
    if (!counts.length) continue;
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    const consistent = counts.filter(c => c === mode).length;
    const score = mode > 1 ? consistent * 100 + mode : 0;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function splitCsvLine(line, d) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  // Tırnak içinde satır sonu olabilir; satırları tırnak dengesine göre birleştir.
  const lines = text.split(/\r?\n/);
  let buf = null;
  for (const line of lines) {
    buf = buf == null ? line : `${buf}\n${line}`;
    if ((buf.match(/"/g) || []).length % 2) continue;
    const r = rows.length;
    splitCsvLine(buf, delimiter).forEach((v, c) => { if (v.trim() !== '') put(rows, r, c, { v: v.trim(), t: 's' }); });
    if (rows.length === r) rows.push([]);
    buf = null;
  }
  return rows;
}

// ---------- ZIP (xlsx ve ods için) ----------

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ReadError('Dosya bozuk görünüyor (ZIP dizini bulunamadı).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    entries.set(name, { method, csize, off });
    p += 46 + nlen + elen + clen;
  }
  return {
    names: [...entries.keys()],
    async text(name) {
      const e = entries.get(name) || entries.get(name.replace(/^\//, ''));
      if (!e) return null;
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
      const raw = u8.subarray(start, start + e.csize);
      const data = e.method === 0 ? raw : e.method === 8 ? await inflateRaw(raw) : null;
      if (!data) throw new ReadError('Dosyada desteklenmeyen bir sıkıştırma yöntemi var.');
      return new TextDecoder().decode(data);
    },
  };
}

// ---------- Excel 2007+ (.xlsx) ----------

const BUILTIN_PCT = new Set([9, 10]);
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

async function readXlsx(zip) {
  const wb = parseXml(await zip.text('xl/workbook.xml'));
  const relsText = await zip.text('xl/_rels/workbook.xml.rels');
  const rels = {};
  if (relsText) for (const r of findAll(parseXml(relsText), 'Relationship')) rels[r.attrs.Id] = r.attrs.Target;

  const shared = [];
  const ss = await zip.text('xl/sharedStrings.xml');
  if (ss) for (const si of findAll(parseXml(ss), 'si')) shared.push(findAll(si, 't').map(textOf).join('') || textOf(si));

  // Biçimler: yüzde ve tarih hücrelerini tanımak için
  const fmt = [];
  const st = await zip.text('xl/styles.xml');
  if (st) {
    const doc = parseXml(st);
    const custom = {};
    for (const nf of findAll(doc, 'numFmt')) custom[nf.attrs.numFmtId] = nf.attrs.formatCode || '';
    const xfs = find(doc, 'cellXfs');
    for (const xf of xfs ? children(xfs, 'xf') : []) {
      const id = Number(xf.attrs.numFmtId || 0);
      const code = (custom[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
      fmt.push({ pct: BUILTIN_PCT.has(id) || code.includes('%'), date: BUILTIN_DATE.has(id) || (/[dy]/i.test(code) && !code.includes('%')) });
    }
  }

  const sheets = [];
  for (const s of findAll(wb, 'sheet')) {
    const rid = attr(s, 'id');
    let target = rels[rid] || '';
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const xml = await zip.text(target);
    if (!xml) continue;
    const rows = [];
    for (const row of findAll(parseXml(xml), 'row')) {
      for (const c of children(row, 'c')) {
        const ref = /^([A-Z]+)(\d+)$/.exec(c.attrs.r || '');
        if (!ref) continue;
        const r = Number(ref[2]) - 1, col = colIndex(ref[1]);
        const t = c.attrs.t || 'n';
        const vNode = child(c, 'v');
        const style = fmt[Number(c.attrs.s || 0)] || {};
        let cell;
        if (t === 's') cell = { v: shared[Number(textOf(vNode))] ?? '', t: 's' };
        else if (t === 'inlineStr') cell = { v: findAll(c, 't').map(textOf).join(''), t: 's' };
        else if (t === 'str') cell = { v: textOf(vNode), t: 's' };
        else if (t === 'b') cell = { v: textOf(vNode) === '1', t: 'b' };
        else if (t === 'e' || !vNode) continue;
        else {
          const num = Number(textOf(vNode));
          cell = style.date ? { v: excelDate(num), t: 'd' } : { v: num, t: 'n', pct: !!style.pct };
        }
        if (cell.v === '' || cell.v == null) continue;
        put(rows, r, col, cell);
      }
    }
    sheets.push({ name: s.attrs.name || `Sayfa${sheets.length + 1}`, rows });
  }
  return sheets;
}

export function excelDate(serial) {
  return new Date(Math.round((serial - 25569) * 86400000));
}

// ---------- OpenDocument (.ods) ----------

async function readOds(zip) {
  const doc = parseXml(await zip.text('content.xml'));
  const sheets = [];
  for (const table of findAll(doc, 'table')) {
    const rows = [];
    let r = 0;
    for (const row of findAll(table, 'table-row')) {
      const rep = Math.min(Number(attr(row, 'number-rows-repeated') || 1), 10000);
      const cells = children(row, 'table-cell').concat(children(row, 'covered-table-cell'));
      const hasContent = cells.some(c => attr(c, 'value-type') || textOf(c).trim());
      if (!hasContent) { r += rep; continue; }
      let c = 0;
      for (const cellNode of row.children.filter(x => x.local === 'table-cell' || x.local === 'covered-table-cell')) {
        const crep = Math.min(Number(attr(cellNode, 'number-columns-repeated') || 1), 1000);
        const type = attr(cellNode, 'value-type');
        const text = findAll(cellNode, 'p').map(textOf).join('\n');
        let cell = null;
        if (type === 'float' || type === 'currency') cell = { v: Number(attr(cellNode, 'value')), t: 'n' };
        else if (type === 'percentage') cell = { v: Number(attr(cellNode, 'value')), t: 'n', pct: true };
        else if (type === 'date') cell = { v: new Date(attr(cellNode, 'date-value')), t: 'd' };
        else if (type === 'boolean') cell = { v: attr(cellNode, 'boolean-value') === 'true', t: 'b' };
        else if (text.trim()) cell = { v: text.trim(), t: 's' };
        if (cell) for (let k = 0; k < Math.min(crep, 50); k++) put(rows, r, c + k, { ...cell });
        c += crep;
      }
      r += 1; // içerikli satırın tekrarları (nadirdir) tek satır sayılır
    }
    sheets.push({ name: attr(table, 'name') || `Sayfa${sheets.length + 1}`, rows });
  }
  return sheets;
}

// ---------- Excel 2003 XML ve HTML tablosu (".xls" olarak dışa aktarılanlar) ----------

function readSpreadsheetMl(doc) {
  const sheets = [];
  for (const ws of findAll(doc, 'Worksheet')) {
    const rows = [];
    let r = 0;
    for (const row of findAll(ws, 'Row')) {
      const ri = attr(row, 'Index');
      if (ri) r = Number(ri) - 1;
      let c = 0;
      for (const cellNode of children(row, 'Cell')) {
        const ci = attr(cellNode, 'Index');
        if (ci) c = Number(ci) - 1;
        const data = child(cellNode, 'Data');
        if (data) {
          const type = attr(data, 'Type');
          const text = textOf(data);
          if (type === 'Number') put(rows, r, c, { v: Number(text), t: 'n' });
          else if (type === 'DateTime') put(rows, r, c, { v: new Date(text), t: 'd' });
          else if (text.trim()) put(rows, r, c, { v: text.trim(), t: 's' });
        }
        c += 1 + Number(attr(cellNode, 'MergeAcross') || 0);
      }
      r++;
    }
    sheets.push({ name: attr(ws, 'Name') || `Sayfa${sheets.length + 1}`, rows });
  }
  return sheets;
}

export function readHtmlTables(html) {
  const sheets = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  tables.forEach((tbl, k) => {
    const rows = [];
    (tbl.match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(tr => {
      const r = rows.length;
      rows.push([]);
      let c = 0;
      for (const m of tr.matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
        const text = decodeEntities(m[3].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
        if (text) put(rows, r, c, { v: text, t: 's' });
        const span = /colspan\s*=\s*["']?(\d+)/i.exec(m[2]);
        c += span ? Number(span[1]) : 1;
      }
    });
    if (rows.some(r => r.length)) sheets.push({ name: `Tablo ${k + 1}`, rows });
  });
  return sheets;
}

// ---------- Giriş noktası ----------

export async function readFile(name, buffer) {
  const u8 = new Uint8Array(buffer);
  const lower = name.toLocaleLowerCase('tr-TR');
  const sig = (a, b, c, d) => u8[0] === a && u8[1] === b && u8[2] === c && u8[3] === d;

  if (sig(0xd0, 0xcf, 0x11, 0xe0)) {
    throw new ReadError('Bu dosya eski Excel 97-2003 (.xls) ikili biçiminde. Excel veya LibreOffice’te açıp “Farklı Kaydet → Excel Çalışma Kitabı (.xlsx)” ya da “CSV” olarak kaydettikten sonra yükleyin.');
  }
  if (sig(0x25, 0x50, 0x44, 0x46)) {
    throw new ReadError('PDF belgeleri otomatik okunmaz; PDF’teki tablolar güvenilir biçimde ayrıştırılamaz. Aynı verinin Excel veya CSV dökümünü yükleyin ya da değerleri elle girin.');
  }
  if (sig(0x50, 0x4b, 0x03, 0x04)) {
    const zip = await unzip(u8);
    if (zip.names.includes('xl/workbook.xml')) return { name, kind: 'table', format: 'Excel (.xlsx)', sheets: await readXlsx(zip) };
    if (zip.names.includes('content.xml')) return { name, kind: 'table', format: 'OpenDocument (.ods)', sheets: await readOds(zip) };
    throw new ReadError('Sıkıştırılmış dosyanın içinde okunabilir bir tablo bulunamadı. Birden çok e-Fatura içeren bir ZIP ise önce açıp XML dosyalarını seçin.');
  }

  const text = decodeText(u8);
  const head = text.slice(0, 2000).toLocaleLowerCase('en');
  if (/^\s*</.test(text) && (head.includes('<?xml') || head.includes('<invoice') || head.includes('<workbook'))) {
    const doc = parseXml(text);
    const root = rootElement(doc);
    if (root?.local === 'Invoice') return { name, kind: 'invoice', format: 'e-Fatura (UBL-TR XML)', xml: root, sheets: [] };
    if (root?.local === 'Workbook') return { name, kind: 'table', format: 'Excel 2003 XML', sheets: readSpreadsheetMl(doc) };
    if (!head.includes('<html') && !head.includes('<table')) throw new ReadError('XML dosyası tanınmadı. e-Fatura (UBL-TR) veya Excel 2003 XML biçiminde olmalı.');
  }
  if (head.includes('<table') || head.includes('<html')) {
    const sheets = readHtmlTables(text);
    if (!sheets.length) throw new ReadError('Dosyada tablo bulunamadı.');
    return { name, kind: 'table', format: 'Web tablosu (.xls/.html)', sheets };
  }
  if (/\.(csv|txt|tsv)$/.test(lower) || text.includes(';') || text.includes(',') || text.includes('\t')) {
    const d = detectDelimiter(text);
    return { name, kind: 'table', format: `CSV (“${d === '\t' ? 'sekme' : d}” ayraçlı)`, sheets: [{ name: 'CSV', rows: parseCsv(text, d) }] };
  }
  throw new ReadError('Dosya biçimi tanınmadı. Excel (.xlsx, .ods), CSV veya e-Fatura XML yükleyin.');
}
