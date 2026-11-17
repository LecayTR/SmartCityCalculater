// İndirilebilir veri şablonu (.xlsx). Bağımlılıksız: en küçük geçerli Excel paketi elle yazılır.
// Her yatırım için bir sayfa; birimlerden gelen değerler "Değer" sütununa girilip şablon geri yüklenir.

import { TARGETS } from './importer.js';
import { HINTS, COST_HINT } from './hints.js';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_DATE = ((2025 - 1980) << 9) | (1 << 5) | 1; // 1 Ocak 2025; sıfır tarih bazı araçlarda uyarı verir

// Sıkıştırmasız (stored) ZIP. files: [[ad, metin]]
export function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameB = enc.encode(name), data = enc.encode(content), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, nameB.length, true);
    parts.push(new Uint8Array(local.buffer), nameB, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(14, DOS_DATE, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameB.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = i => String.fromCharCode(65 + i);
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

// Stil numaraları: 0 normal, 1 kalın başlık, 2 sarı giriş hücresi, 3 kaydırmalı metin
function sheetXml(rows, widths) {
  const body = rows.map((cells, r) => `<row r="${r + 1}">${cells.map((c, i) => {
    if (c == null) return '';
    const ref = `${col(i)}${r + 1}`;
    const s = c.s ? ` s="${c.s}"` : '';
    if (c.v == null || c.v === '') return `<c r="${ref}"${s}/>`;
    return typeof c.v === 'number' ? `<c r="${ref}"${s}><v>${c.v}</v></c>` : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

const SHEET_NAMES = { aydinlatma: 'Aydınlatma', su: 'Su', atik: 'Atık', trafik: 'Trafik', genel: 'Genel ayarlar' };

// valueFor(model, key) → kullanıcının girdiği değer ya da null (şablon boş "Değer" ile gelir)
export function buildTemplate(valueFor = () => null) {
  const sheets = [];
  sheets.push(['Nasıl doldurulur', [
    [{ v: 'Akıllı Şehir Yatırım Rehberi – veri şablonu', s: 1 }],
    [{ v: '1. Her yatırımın sayfasında sarı “Değer” sütununu doldurun. Boş bıraktığınız alanlar hesaplayıcıda değişmez.' }],
    [{ v: '2. “Nereden bulunur” sütunu verinin hangi birimden veya belgeden alınacağını gösterir. İlgili birimlere sayfaları ayrı ayrı gönderebilirsiniz.' }],
    [{ v: '3. Sayıları Türkçe yazımla girebilirsiniz (1.250.000 veya 4,35). Yüzde alanlarına 35 ya da %35 yazın.' }],
    [{ v: '4. “Alan kodu” ve “Yatırım kodu” sütunlarını değiştirmeyin; dosya bu kodlarla tanınır.' }],
    [{ v: '5. Doldurduğunuz dosyayı hesaplayıcıdaki “Belge yükle” sayfasından yükleyin. Değerler yüklenmeden önce kontrol için gösterilir.' }],
  ], [120]]);
  for (const t of TARGETS) {
    const rows = [['Yatırım kodu', 'Alan kodu', 'Alan', 'Birim', 'Nereden bulunur', 'Değer', 'Örnek değer'].map(v => ({ v, s: 1 }))];
    for (const i of t.inputs) {
      const where = HINTS[t.id]?.[i.key] || (i.group === 'cost' && i.key !== 'grant' ? COST_HINT : i.group === 'assumption' ? 'Kaynaklara dayalı varsayım; pilot ölçümünüz varsa girin' : '');
      rows.push([{ v: t.id }, { v: i.key }, { v: i.label, s: 3 }, { v: i.unit }, { v: where, s: 3 }, { v: valueFor(t.id, i.key) ?? '', s: 2 }, { v: i.value }]);
    }
    sheets.push([SHEET_NAMES[t.id], rows, [14, 14, 48, 16, 52, 16, 14]]);
  }

  const files = [];
  files.push(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
  files.push(['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
  files.push(['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([name], i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`]);
  files.push(['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  files.push(['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
  sheets.forEach(([, rows, widths], i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(rows, widths)]));
  return zipStore(files);
}
