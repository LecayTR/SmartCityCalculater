// Belgelerden değer çıkarma. sheets.js'in ürettiği tabloları tanır, ilgili alanlar için
// "öneri" üretir; öneriler kullanıcı onayından sonra forma işlenir. Arayüzden bağımsızdır.
//
// Öneri: { model: 'aydinlatma' | 'su' | 'atik' | 'trafik' | 'genel', key, value, where, note }

import { MODELS, GLOBAL_INPUTS } from './models.js';
import { find, findAll, child, textOf, attr } from './xml.js';

export const TARGETS = [
  ...MODELS.map(m => ({ id: m.id, name: m.name, inputs: m.inputs })),
  { id: 'genel', name: 'Genel ayarlar', inputs: GLOBAL_INPUTS },
];
export const inputOf = (model, key) => TARGETS.find(t => t.id === model)?.inputs.find(i => i.key === key);

// ---------- Metin ve sayı yardımcıları ----------

const TR = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', â: 'a', î: 'i', û: 'u', '³': '3', '²': '2' };
export function norm(s) {
  return String(s ?? '')
    .replace(/[ıİşŞğĞüÜöÖçÇâîû³²]/g, ch => TR[ch])
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

// Hücreyi sayıya çevirir. Türkçe yazım ("1.234,56"), para birimi ve birim ekleri, yüzde işareti tanınır.
export function toNumber(cell) {
  if (cell == null) return null;
  if (cell.t === 'n') return Number.isFinite(cell.v) ? { value: cell.v, pct: !!cell.pct, sign: false } : null;
  if (cell.t !== 's') return null;
  const s = String(cell.v).replace(/ /g, ' ');
  const m = /-?\s?\d[\d.,\s]*/.exec(s);
  if (!m) return null;
  // Sayıdan önce harf varsa (ör. "Direk 12") ya da metin çok uzunsa sayı sayılmaz.
  const before = s.slice(0, m.index);
  if (/[a-zçğıöşü]/i.test(before) && !/(tl|₺|try|%)\s*$/i.test(before)) return null;
  let t = m[0].replace(/\s/g, '');
  const hasDot = t.includes('.'), hasComma = t.includes(',');
  if (hasDot && hasComma) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (hasComma) {
    t = (t.match(/,/g).length > 1) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  const value = Number(t);
  if (!Number.isFinite(value)) return null;
  return { value, pct: false, sign: /%/.test(s) };
}

export function toDate(cell) {
  if (!cell) return null;
  if (cell.t === 'd') return Number.isNaN(cell.v.getTime()) ? null : cell.v;
  const s = String(cell.v);
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s); // 31.12.2025 (Türkiye'de yaygın)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
}

const text = cell => (cell && cell.t === 's' ? String(cell.v) : '');
// Dökümlerin altındaki "Toplam", "Genel Toplam" gibi satırlar; "Toplam su kaybı" gibi alan adları sayılmaz.
export const isTotalRow = row => row.some(c => c && c.t === 's' && /^(genel |ara )?toplam( tutar| tl| kwh)?$|^total$|^yekun$/.test(norm(c.v)));

// Başlık satırını bulur: ilk satırlarda, verilen sütun tanımlarından en çoğunu karşılayan satır.
// cols: { ad: başlık => boolean }. Dönüş: { index, cols: { ad: sütun } } veya null.
export function findHeader(rows, cols, { required = [], maxScan = 30 } = {}) {
  let best = null;
  for (let r = 0; r < Math.min(rows.length, maxScan); r++) {
    const row = rows[r] || [];
    const found = {};
    row.forEach((cell, c) => {
      if (!cell || cell.t !== 's') return;
      const h = norm(cell.v);
      for (const [name, test] of Object.entries(cols)) if (found[name] == null && test(h)) found[name] = c;
    });
    if (required.some(k => found[k] == null)) continue;
    const score = Object.keys(found).length;
    if (score && (!best || score > best.score)) best = { index: r, cols: found, score };
  }
  return best;
}

function dataRows(rows, from) {
  return rows.slice(from + 1).filter(r => r && r.some(Boolean) && !isTotalRow(r));
}

// Yüzde alanları: Excel'de yüzde biçimli hücre 0,35 olarak saklanır; "%35" yazımı 35'tir.
export function percentValue(input, num) {
  if (!input?.pct) return { value: num.value };
  if (num.pct) return { value: num.value * 100, note: 'Yüzde biçimli hücre' };
  if (!num.sign && num.value > 0 && num.value < 1 && input.value >= 10) return { value: num.value * 100, note: 'Oran olarak yorumlanıp yüzdeye çevrildi' };
  return { value: num.value };
}

// ---------- Öneri denetimi ----------

export function check(p) {
  const input = inputOf(p.model, p.key);
  if (!input) return { level: 'error', message: 'Bilinmeyen alan' };
  if (!Number.isFinite(p.value)) return { level: 'error', message: 'Sayı okunamadı' };
  if (input.min != null && p.value < input.min) return { level: 'error', message: `En az ${input.min} olmalı` };
  if (input.max != null && p.value > input.max) return { level: 'error', message: `En fazla ${input.max} olabilir` };
  if (input.unc && (p.value < input.unc[0] || p.value > input.unc[1])) return { level: 'warn', message: 'Kaynaklardaki aralığın dışında' };
  if (input.value > 0 && (p.value > input.value * 20 || p.value < input.value / 20)) return { level: 'warn', message: 'Örnek değerden çok farklı; birimi kontrol edin' };
  return { level: 'ok', message: '' };
}

const fmt = (x, d = 0) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d }).format(x);
const fmtDate = d => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// ---------- Belge türleri ----------
// Her tür: detect(dosya) → 0..1 puan; extract(dosyalar, seçenekler, bağlam) → sonuç.
// Sonuç: { summary, proposals, warnings, options: [{ id, label, type, choices, value, help }] }

const TEMPLATE = {
  id: 'sablon',
  title: 'Hesaplayıcı veri şablonu',
  fills: 'Tüm alanlar',
  formats: '.xlsx, .ods, .csv',
  source: 'Bu sayfadan indirilen şablon; birimlerden gelen değerler tek dosyada toplanır.',
  variants: ['Excel’de veya LibreOffice’te doldurulmuş şablon', 'Şablonun CSV olarak kaydedilmiş hali'],
  cols: { kod: h => h === 'alan kodu', deger: h => h === 'deger', yatirim: h => h === 'yatirim kodu' },
  detect(file) {
    return file.sheets.some(s => findHeader(s.rows, this.cols, { required: ['kod', 'deger'] })) ? 1 : 0;
  },
  extract(files) {
    const proposals = [], warnings = [];
    const sheetModel = { aydinlatma: 'aydinlatma', su: 'su', atik: 'atik', trafik: 'trafik', 'genel ayarlar': 'genel', genel: 'genel' };
    for (const file of files) for (const sheet of file.sheets) {
      const h = findHeader(sheet.rows, this.cols, { required: ['kod', 'deger'] });
      if (!h) continue;
      for (const row of dataRows(sheet.rows, h.index)) {
        const key = text(row[h.cols.kod]).trim();
        const model = h.cols.yatirim != null ? norm(text(row[h.cols.yatirim])) : sheetModel[norm(sheet.name)];
        const input = inputOf(model, key);
        const cell = row[h.cols.deger];
        if (!input || !cell) continue;
        const num = toNumber(cell);
        if (!num) { warnings.push(`${sheet.name} · ${cell.a}: “${cell.v}” sayı olarak okunamadı.`); continue; }
        const pv = percentValue(input, num);
        proposals.push({ model, key, value: pv.value, where: `${sheet.name} · ${cell.a}`, note: pv.note });
      }
    }
    return { summary: `${proposals.length} alan dolu`, proposals, warnings, options: [] };
  },
};

const EINVOICE = {
  id: 'efatura',
  title: 'Elektrik e-Faturaları',
  group: true,
  fills: 'Aydınlatma: elektrik birim fiyatı',
  formats: 'UBL-TR e-Fatura XML (birden çok dosya seçilebilir)',
  source: 'Mali Hizmetler veya e-Fatura entegratörü; aydınlatma abonelerinin son 12 aylık faturaları.',
  variants: ['Ödenecek tutar (vergiler dahil) veya vergiler hariç tutar', 'İade faturaları otomatik ayıklanır', 'Aynı fatura iki kez yüklenirse bir kez sayılır'],
  detect: file => (file.kind === 'invoice' ? 1 : 0),
  extract(files, opts = {}) {
    const amountKey = opts.amount || 'PayableAmount';
    const warnings = [];
    const seen = new Set();
    let kwh = 0, tl = 0, count = 0, dates = [], months = new Set(), suppliers = new Set();
    for (const f of files) {
      const inv = f.xml;
      const id = textOf(child(inv, 'ID')).trim();
      const supplier = textOf(find(find(inv, 'AccountingSupplierParty') || inv, 'Name')).trim();
      const dedupe = `${supplier}|${id}`;
      if (id && seen.has(dedupe)) { warnings.push(`${f.name}: ${id} numaralı fatura daha önce eklendi, tekrar sayılmadı.`); continue; }
      seen.add(dedupe);
      const type = textOf(child(inv, 'InvoiceTypeCode')).trim().toUpperCase();
      if (type === 'IADE') { warnings.push(`${f.name}: iade faturası, hesaba katılmadı.`); continue; }
      let invKwh = 0;
      for (const q of findAll(inv, 'InvoicedQuantity')) {
        const unit = (attr(q, 'unitCode') || '').toUpperCase();
        const v = Number(textOf(q));
        // Enerji ve dağıtım bedeli satırları aynı kWh'i taşır; toplanmaz, en büyüğü alınır.
        if (unit === 'KWH') invKwh = Math.max(invKwh, v);
        if (unit === 'MWH') invKwh = Math.max(invKwh, v * 1000);
      }
      if (!invKwh) { warnings.push(`${f.name}: kWh satırı yok; elektrik faturası olmayabilir, hesaba katılmadı.`); continue; }
      const amount = Number(textOf(find(find(inv, 'LegalMonetaryTotal') || inv, amountKey)));
      if (!Number.isFinite(amount)) { warnings.push(`${f.name}: tutar okunamadı.`); continue; }
      kwh += invKwh; tl += amount; count++;
      const d = new Date(textOf(child(inv, 'IssueDate')).trim());
      if (!Number.isNaN(d.getTime())) { dates.push(d); months.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`); }
      if (supplier) suppliers.add(supplier);
    }
    const options = [{ id: 'amount', label: 'Kullanılacak tutar', type: 'select', value: amountKey, choices: [['PayableAmount', 'Ödenecek tutar (vergiler dahil)'], ['TaxExclusiveAmount', 'Vergiler hariç tutar']], help: 'Belediyeler KDV’yi indiremediği için genellikle vergiler dahil tutar kullanılır.' }];
    if (!count) return { summary: 'Kullanılabilir elektrik faturası bulunamadı', proposals: [], warnings, options };
    dates.sort((a, b) => a - b);
    if (months.size < 12) warnings.push(`Faturalar ${months.size} ayı kapsıyor. 12 aydan kısa dönemde birim fiyat mevsim ve zam etkisi taşıyabilir.`);
    const period = dates.length ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : 'tarih okunamadı';
    return {
      summary: `${count} fatura · ${period} · ${fmt(kwh)} kWh · ${fmt(tl)} TL${suppliers.size ? ` · ${[...suppliers].slice(0, 2).join(', ')}` : ''}`,
      proposals: [{ model: 'aydinlatma', key: 'price', value: tl / kwh, where: `${count} faturanın toplamı`, note: `${fmt(tl)} TL ÷ ${fmt(kwh)} kWh` }],
      warnings, options,
    };
  },
};

const BILL_TABLE = {
  id: 'fatura-tablosu',
  title: 'Elektrik fatura listesi',
  fills: 'Aydınlatma: elektrik birim fiyatı',
  formats: '.xlsx, .xls, .ods, .csv',
  source: 'Muhasebe programı, e-Fatura portalı veya dağıtım şirketinin online işlemler sayfasından alınan döküm.',
  variants: ['kWh ve tutar sütunlu liste', 'Yalnızca tutar içeren liste (birim fiyat, hesaplanan tüketimden türetilir)', 'Birden çok tutar sütunu varsa seçilebilir (KDV hariç / ödenecek)', 'Alttaki “Toplam” satırları otomatik ayıklanır'],
  cols: {
    kwh: h => /kwh|tuketim|enerji miktari|aktif enerji/.test(h) && !/tutar|bedel|tl\b|fiyat/.test(h),
    amount: h => /tutar|odenecek|fatura toplami|bedeli?$/.test(h) && !/kwh|birim|miktar|fiyat/.test(h),
    date: h => /tarih|donem|^ay$|fatura ayi/.test(h),
  },
  amountColumns(sheet, h) {
    return (sheet.rows[h.index] || []).map((c, i) => [i, c]).filter(([, c]) => c && this.cols.amount(norm(c.v)));
  },
  detect(file) {
    for (const s of file.sheets) {
      const h = findHeader(s.rows, this.cols, { required: ['amount'] });
      if (!h) continue;
      if (h.cols.kwh != null) return 0.8;
      if (/fatura|elektrik/.test(norm(file.name + ' ' + s.name))) return 0.55;
    }
    return 0;
  },
  extract([file], opts = {}, ctx = {}) {
    const sheet = file.sheets.find(s => findHeader(s.rows, this.cols, { required: ['amount'] }));
    if (!sheet) return { summary: 'Tutar sütunu bulunamadı', proposals: [], warnings: [], options: [] };
    const h = findHeader(sheet.rows, this.cols, { required: ['amount'] });
    const cands = this.amountColumns(sheet, h);
    const pref = cands.find(([, c]) => /odenecek/.test(norm(c.v))) || cands.find(([, c]) => /genel toplam|toplam tutar/.test(norm(c.v))) || cands[0];
    const amountCol = opts.amountCol != null ? Number(opts.amountCol) : pref[0];
    const options = cands.length > 1 ? [{ id: 'amountCol', label: 'Tutar sütunu', type: 'select', value: amountCol, choices: cands.map(([i, c]) => [i, String(c.v)]) }] : [];
    const mwh = h.cols.kwh != null && /mwh/.test(norm(sheet.rows[h.index][h.cols.kwh].v));
    let kwh = 0, tl = 0, n = 0;
    for (const row of dataRows(sheet.rows, h.index)) {
      const a = toNumber(row[amountCol]);
      if (!a) continue;
      tl += a.value; n++;
      const k = h.cols.kwh != null ? toNumber(row[h.cols.kwh]) : null;
      if (k) kwh += k.value * (mwh ? 1000 : 1);
    }
    const warnings = [];
    if (n && n < 12) warnings.push(`${n} satır var; 12 aydan kısa dönemde birim fiyat mevsim ve zam etkisi taşıyabilir.`);
    const where = `${sheet.name} · ${n} satır toplamı`;
    if (kwh > 0) {
      return { summary: `${n} fatura satırı · ${fmt(kwh)} kWh · ${fmt(tl)} TL`, proposals: [{ model: 'aydinlatma', key: 'price', value: tl / kwh, where, note: `${fmt(tl)} TL ÷ ${fmt(kwh)} kWh` }], warnings, options };
    }
    // kWh yoksa: yıllık gider ÷ envanterden hesaplanan tüketim. Tasarruf (TL) bu durumda doğrudan
    // fatura tutarıyla orantılı olur; armatür sayısı, güç ve yanma süresinin doğru girilmesi gerekir.
    const v = ctx.values?.aydinlatma;
    const kwh0 = v ? v.n * v.w / 1000 * v.h : 0;
    warnings.push('Listede kWh sütunu yok. Birim fiyat, yıllık tutarın armatür sayısı × güç × yanma süresinden hesaplanan tüketime bölünmesiyle türetildi; bu alanların doğru girildiğinden emin olun.');
    return {
      summary: `${n} fatura satırı · ${fmt(tl)} TL (kWh bilgisi yok)`,
      proposals: kwh0 ? [{ model: 'aydinlatma', key: 'price', value: tl / kwh0, where, note: `${fmt(tl)} TL ÷ hesaplanan ${fmt(kwh0)} kWh` }] : [],
      warnings, options,
    };
  },
};

const WATER = {
  id: 'su-dengesi',
  title: 'Su kayıpları yıllık raporu (su dengesi tablosu)',
  fills: 'Su: sisteme verilen su, kayıp oranı, fiziki kayıp payı, abone sayısı',
  formats: '.xlsx, .xls, .ods, .csv',
  source: 'Su ve Kanalizasyon İdaresi / Su İşleri; yönetmelik gereği hazırlanan yıllık su kayıpları raporunun su dengesi tablosu.',
  variants: ['Dikey tablo: her satırda bir kalem ve değeri', 'Yatay, çok yıllık tablo: kalemler sütunda, yıllar satırda (yıl seçilebilir)', 'm³ veya bin m³ birimli', 'Gelir getirmeyen su ya da su kayıpları kalemlerinden hangisi varsa'],
  labels: {
    input: h => /sisteme giren su/.test(h) && !/oran/.test(h),
    losses: h => /^su kayiplari?$|^su kayiplari? (hacmi|miktari|m3)/.test(h) || (/^toplam su kayb/.test(h) && !/oran/.test(h)),
    nrwVol: h => /^gelir getirmeyen su/.test(h) && !/oran|%/.test(h),
    nrwPct: h => /(gelir getirmeyen su|su kayip|kayip) (orani|%)/.test(h),
    real: h => /^fiziki kayip/.test(h) && !/oran|%/.test(h),
    apparent: h => /^idari kayip/.test(h) && !/oran|%/.test(h),
    subscribers: h => /abone sayisi|toplam abone/.test(h),
  },
  detect(file) {
    for (const s of file.sheets) for (const row of s.rows.slice(0, 200)) {
      if ((row || []).some(c => c && c.t === 's' && this.labels.input(norm(c.v)))) return 0.9;
    }
    return 0;
  },
  extract([file], opts = {}) {
    const warnings = [];
    let found = {}, layout = 'dikey', years = [], sheetName = '';
    for (const s of file.sheets) {
      // Yatay düzen: başlık satırında en az iki kalem varsa her satır bir yıldır.
      const h = findHeader(s.rows, this.labels);
      if (h && h.score >= 2) {
        const rows = dataRows(s.rows, h.index).filter(r => r.some(c => toNumber(c)));
        if (rows.length) {
          layout = 'yatay';
          sheetName = s.name;
          years = rows.map((r, i) => {
            const y = r.find(c => c && /^(19|20)\d{2}$/.test(String(c.v).trim()));
            return [i, y ? String(y.v).trim() : `${i + 1}. satır`];
          });
          const pick = opts.year != null ? Number(opts.year) : years[years.length - 1][0];
          const row = rows[pick];
          for (const [k, c] of Object.entries(h.cols)) { const num = toNumber(row[c]); if (num) found[k] = { value: num.value, cell: row[c] }; }
          break;
        }
      }
      // Dikey düzen: satırdaki ilk anlamlı metin kalem adı, sağındaki ilk sayı değeridir.
      for (const row of s.rows) {
        if (!row) continue;
        const li = row.findIndex(c => c && c.t === 's' && /[a-z]{3}/.test(norm(c.v)));
        if (li < 0) continue;
        const label = norm(row[li].v);
        for (const [k, test] of Object.entries(this.labels)) {
          if (found[k] || !test(label)) continue;
          for (let c = li + 1; c < row.length; c++) {
            const num = toNumber(row[c]);
            if (num) { found[k] = { value: num.value, cell: row[c] }; break; }
          }
        }
      }
      if (found.input) { sheetName = s.name; break; }
    }
    const allText = file.sheets.flatMap(s => s.rows.flat()).filter(c => c && c.t === 's').map(c => norm(c.v)).join(' ');
    const autoUnit = /bin m3|1000 m3|bin metrekup|x1000/.test(allText) ? 'bin' : 'm3';
    const unit = opts.unit || autoUnit;
    const mult = unit === 'bin' ? 1000 : 1;
    const options = [{ id: 'unit', label: 'Hacim birimi', type: 'select', value: unit, choices: [['m3', 'm³'], ['bin', 'bin m³']], help: autoUnit === 'bin' ? 'Belgede “bin m³” ifadesi bulundu.' : 'Belgede birim belirtilmemişse m³ varsayılır.' }];
    if (layout === 'yatay' && years.length > 1) options.push({ id: 'year', label: 'Yıl', type: 'select', value: opts.year ?? years[years.length - 1][0], choices: years });
    if (!found.input) return { summary: '“Sisteme giren su” kalemi bulunamadı', proposals: [], warnings, options };

    const at = f => `${sheetName} · ${f.cell.a}`;
    const vol = f => f && f.value * mult;
    const input = vol(found.input);
    const proposals = [{ model: 'su', key: 'input', value: input, where: at(found.input) }];
    let lossVol = vol(found.losses);
    if (!lossVol && found.real && found.apparent) lossVol = vol(found.real) + vol(found.apparent);
    if (!lossVol && found.nrwVol) {
      lossVol = vol(found.nrwVol);
      warnings.push('“Su kayıpları” kalemi bulunamadı; gelir getirmeyen su kullanıldı. Bu kalem faturalanmayan yetkili tüketimi (itfaiye, park sulama vb.) de içerdiği için kayıp oranı biraz yüksek çıkabilir.');
    }
    if (found.nrwPct && !lossVol) {
      const p = found.nrwPct.value;
      proposals.push({ model: 'su', key: 'nrw', value: p < 1 ? p * 100 : p, where: at(found.nrwPct) });
    } else if (lossVol) {
      proposals.push({ model: 'su', key: 'nrw', value: lossVol / input * 100, where: `${sheetName} · kayıp ÷ sisteme giren su` });
    }
    if (found.real && found.apparent) {
      proposals.push({ model: 'su', key: 'realShare', value: vol(found.real) / (vol(found.real) + vol(found.apparent)) * 100, where: `${sheetName} · fiziki ÷ (fiziki + idari)` });
    } else if (found.real && lossVol) {
      proposals.push({ model: 'su', key: 'realShare', value: vol(found.real) / lossVol * 100, where: `${sheetName} · fiziki ÷ toplam kayıp` });
    } else warnings.push('Fiziki ve idari kayıp ayrımı bulunamadı; “Kayıpların fiziki payı” alanını elle girin.');
    if (found.subscribers) proposals.push({ model: 'su', key: 'subscribers', value: found.subscribers.value, where: at(found.subscribers) });
    return { summary: `${layout === 'yatay' ? 'Çok yıllık tablo' : 'Su dengesi tablosu'} · sisteme giren su ${fmt(input)} m³`, proposals, warnings, options };
  },
};

const LUMINAIRES = {
  id: 'armatur',
  title: 'Aydınlatma armatür envanteri',
  fills: 'Aydınlatma: armatür sayısı, ortalama güç',
  formats: '.xlsx, .xls, .ods, .csv',
  source: 'Fen İşleri / elektrik birimi veya elektrik dağıtım şirketinden alınan armatür listesi.',
  variants: ['Her satırda bir armatür ya da “adet” sütunlu gruplanmış liste', 'Güç ayrı sütunda ya da tip adının içinde (ör. “150W SON”)', 'W veya kW', 'Sökülmüş/arızalı/pasif kayıtları ayıklama', 'İsteğe bağlı balast kaybı ekleme'],
  cols: {
    power: h => /\bguc\b|guc w|watt|^w$|^gucu|lamba gucu|kw$/.test(h) && !/toplam/.test(h),
    count: h => /^adet|adedi|^sayi|armatur sayisi|^miktar/.test(h) && !/tutar/.test(h),
    type: h => /tip|cins|armatur|lamba|model|aciklama/.test(h) && !/guc|adet|sayi/.test(h),
    status: h => /durum/.test(h),
  },
  typeHasPower(sheet, h) {
    if (h.cols.type == null) return false;
    const vals = dataRows(sheet.rows, h.index).map(r => text(r[h.cols.type])).filter(Boolean);
    return vals.length > 0 && vals.filter(v => /\d+\s*w\b/i.test(v)).length / vals.length >= 0.3;
  },
  locate(file) {
    for (const s of file.sheets) {
      const h = findHeader(s.rows, this.cols);
      if (h && (h.cols.power != null || this.typeHasPower(s, h))) return { sheet: s, h };
    }
    return null;
  },
  detect(file) {
    const loc = this.locate(file);
    if (!loc) return 0;
    const names = norm(file.name + ' ' + loc.sheet.name + ' ' + (loc.sheet.rows[loc.h.index] || []).map(c => c?.v).join(' '));
    return /armatur|aydinlatma|direk|lamba/.test(names) ? 0.85 : 0.6;
  },
  extract([file], opts = {}) {
    const loc = this.locate(file);
    if (!loc) return { summary: 'Güç bilgisi bulunamadı', proposals: [], warnings: [], options: [] };
    const { sheet, h } = loc;
    const rows = dataRows(sheet.rows, h.index);
    const excludeStatus = opts.excludeStatus ?? true;
    const ballast = opts.ballast ?? false;
    const powerOf = row => {
      const n = h.cols.power != null ? toNumber(row[h.cols.power]) : null;
      if (n) return n.value;
      const m = /(\d+(?:[.,]\d+)?)\s*w\b/i.exec(text(row[h.cols.type]));
      return m ? Number(m[1].replace(',', '.')) : null;
    };
    const powers = rows.map(powerOf).filter(x => x != null).sort((a, b) => a - b);
    const median = powers[Math.floor(powers.length / 2)] ?? 0;
    const autoUnit = median > 0 && median < 5 ? 'kw' : 'w';
    const unit = opts.unit || autoUnit;
    let n = 0, sumW = 0, skipped = 0, excluded = 0;
    for (const row of rows) {
      if (excludeStatus && h.cols.status != null && /sokul|ariza|pasif|iptal|kaldiril/.test(norm(text(row[h.cols.status])))) { excluded++; continue; }
      const p = powerOf(row);
      if (p == null) { skipped++; continue; }
      const cnt = h.cols.count != null ? (toNumber(row[h.cols.count])?.value ?? 1) : 1;
      n += cnt;
      sumW += cnt * p * (unit === 'kw' ? 1000 : 1);
    }
    const warnings = [];
    if (skipped) warnings.push(`${skipped} satırda güç bilgisi okunamadı ve hesaba katılmadı.`);
    if (excluded) warnings.push(`${excluded} satır sökülmüş/arızalı/pasif olduğu için ayıklandı.`);
    const options = [
      { id: 'ballast', label: 'Güçlere balast kaybı ekle (+%10)', type: 'checkbox', value: ballast, help: 'Envanterde yalnız lamba gücü yazıyorsa işaretleyin; sodyum buharlı ve metal halide armatürlerde balast kaybı yaklaşık %8–15’tir.' },
      { id: 'unit', label: 'Güç birimi', type: 'select', value: unit, choices: [['w', 'W'], ['kw', 'kW']] },
    ];
    if (h.cols.status != null) options.push({ id: 'excludeStatus', label: 'Sökülmüş, arızalı ve pasif kayıtları ayıkla', type: 'checkbox', value: excludeStatus });
    if (!n) return { summary: 'Armatür bulunamadı', proposals: [], warnings, options };
    const avg = sumW / n * (ballast ? 1.1 : 1);
    const where = `${sheet.name} · ${rows.length} satır`;
    return {
      summary: `${fmt(n)} armatür · ortalama ${fmt(avg, 1)} W${h.cols.count != null ? ' · adet sütunu kullanıldı' : ''}`,
      proposals: [
        { model: 'aydinlatma', key: 'n', value: n, where },
        { model: 'aydinlatma', key: 'w', value: avg, where, note: ballast ? 'Balast kaybı (+%10) dahil' : 'Balast kaybı eklenmedi' },
      ],
      warnings, options,
    };
  },
};

const FLEET = {
  id: 'yakit',
  title: 'Taşıt Tanıma / araç takip dökümü',
  fills: 'Atık: araç sayısı, yıllık km, yakıt tüketimi, motorin fiyatı',
  formats: '.xlsx, .xls, .ods, .csv',
  source: 'Akaryakıt dağıtım şirketinin Taşıt Tanıma Sistemi dökümü veya araç takip sistemi raporu (Makine İkmal / Temizlik İşleri).',
  variants: ['Her yakıt alımı bir satır (km sayacı ile)', 'Araç başına özet satırı (katedilen mesafe ile)', 'Araç türü veya müdürlük sütununa göre yalnız çöp araçlarını seçme', 'Bir yıldan kısa dönemi yıllığa çevirme'],
  cols: {
    plate: h => /plaka/.test(h),
    litre: h => /litre|\blt\b|yakit miktari|^miktar/.test(h) && !/tutar|fiyat|km/.test(h),
    amount: h => /tutar|^toplam$|toplam tl/.test(h) && !/birim|fiyat|litre|\blt\b/.test(h),
    odo: h => /^km$|km sayac|kilometre|odometre|^km /.test(h) && !/mesafe|katedilen|toplam km/.test(h),
    dist: h => /mesafe|katedilen|gidilen|toplam km|yol km/.test(h),
    date: h => /tarih/.test(h),
    type: h => /(arac )?(turu|tipi|cinsi)|mudurluk|birim adi|^birim$|departman|^cins/.test(h),
  },
  locate(file) {
    for (const s of file.sheets) {
      const h = findHeader(s.rows, this.cols, { required: ['plate'] });
      if (h && (h.cols.litre != null || h.cols.odo != null || h.cols.dist != null)) return { sheet: s, h };
    }
    return null;
  },
  detect(file) { return this.locate(file) ? 0.85 : 0; },
  extract([file], opts = {}) {
    const loc = this.locate(file);
    if (!loc) return { summary: 'Plaka sütunu bulunamadı', proposals: [], warnings: [], options: [] };
    const { sheet, h } = loc;
    const rows = dataRows(sheet.rows, h.index);
    const options = [];
    const warnings = [];

    let allowed = null;
    if (h.cols.type != null) {
      const types = [...new Set(rows.map(r => text(r[h.cols.type]).trim()).filter(Boolean))].slice(0, 40);
      const guess = types.filter(t => /cop|sikistir|temizlik|atik/.test(norm(t)));
      const value = opts.types ?? (guess.length ? guess : types);
      allowed = new Set(value);
      options.push({ id: 'types', label: `Hesaba katılacak ${norm(sheet.rows[h.index][h.cols.type].v) || 'tür'} değerleri`, type: 'multi', value, choices: types.map(t => [t, t]), help: 'Taşıt Tanıma dökümleri belediyenin tüm araçlarını içerir; yalnız çöp toplama araçlarını seçin.' });
    }
    const modes = [];
    if (h.cols.odo != null) modes.push(['odo', 'Km sayacı: her aracın son − ilk değeri']);
    if (h.cols.dist != null) modes.push(['dist', 'Mesafe sütunu: satırlardaki km’ler toplanır']);
    const mode = modes.some(([m]) => m === opts.kmMode) ? opts.kmMode : (h.cols.dist != null ? 'dist' : 'odo');
    if (modes.length > 1) options.push({ id: 'kmMode', label: 'Kilometre nasıl hesaplansın?', type: 'select', value: mode, choices: modes });
    const per = new Map();
    let minD = null, maxD = null;
    for (const row of rows) {
      const plate = text(row[h.cols.plate]).replace(/\s+/g, ' ').trim().toUpperCase();
      if (!plate) continue;
      if (allowed && !allowed.has(text(row[h.cols.type]).trim())) continue;
      const v = per.get(plate) || { litre: 0, amount: 0, min: Infinity, max: -Infinity, dist: 0 };
      if (h.cols.litre != null) v.litre += toNumber(row[h.cols.litre])?.value ?? 0;
      if (h.cols.amount != null) v.amount += toNumber(row[h.cols.amount])?.value ?? 0;
      const odo = h.cols.odo != null ? toNumber(row[h.cols.odo])?.value : null;
      if (odo) { v.min = Math.min(v.min, odo); v.max = Math.max(v.max, odo); }
      if (h.cols.dist != null) v.dist += toNumber(row[h.cols.dist])?.value ?? 0;
      per.set(plate, v);
      const d = h.cols.date != null ? toDate(row[h.cols.date]) : null;
      if (d) { if (!minD || d < minD) minD = d; if (!maxD || d > maxD) maxD = d; }
    }
    const vehicles = per.size;
    if (!vehicles) return { summary: 'Seçilen ölçütlerle araç bulunamadı', proposals: [], warnings, options };
    let km = 0, litre = 0, amount = 0;
    for (const v of per.values()) {
      km += mode === 'dist' ? v.dist : (v.max > v.min ? v.max - v.min : 0);
      litre += v.litre; amount += v.amount;
    }
    const days = minD && maxD ? Math.round((maxD - minD) / 86400000) + 1 : null;
    const annualize = opts.annualize ?? (days != null && days < 330);
    if (days != null) options.push({ id: 'annualize', label: `Dönemi yıllığa çevir (${days} gün)`, type: 'checkbox', value: annualize });
    const factor = annualize && days ? 365 / days : 1;
    if (days == null) warnings.push('Tarih sütunu bulunamadı; dökümün bir yılı kapsadığı varsayıldı.');
    if (mode === 'odo') warnings.push('Km sayacı yönteminde dönemin ilk yakıt alımı önceki döneme ait olabilir; uzun dönemli dökümlerde etkisi küçüktür.');
    const where = `${sheet.name} · ${vehicles} araç, ${rows.length} satır`;
    const proposals = [{ model: 'atik', key: 'vehicles', value: vehicles, where }];
    if (km > 0) proposals.push({ model: 'atik', key: 'km', value: km * factor / vehicles, where, note: factor !== 1 ? `Yıllığa çevrildi (×${fmt(factor, 2)})` : '' });
    if (km > 0 && litre > 0) {
      const use = litre / km * 100;
      proposals.push({ model: 'atik', key: 'fuelUse', value: use, where, note: `${fmt(litre)} L ÷ ${fmt(km)} km` });
      if (use < 20 || use > 120) warnings.push(`Hesaplanan tüketim ${fmt(use, 1)} L/100 km; çöp araçları için olağan aralığın dışında. Araç seçimini ve km yöntemini kontrol edin.`);
    }
    if (litre > 0 && amount > 0) proposals.push({ model: 'atik', key: 'fuelPrice', value: amount / litre, where, note: `${fmt(amount)} TL ÷ ${fmt(litre)} L` });
    const period = minD && maxD ? ` · ${fmtDate(minD)} – ${fmtDate(maxD)}` : '';
    return { summary: `${vehicles} araç · ${fmt(km)} km · ${fmt(litre)} L${period}`, proposals, warnings, options };
  },
};

export const EXTRACTORS = [TEMPLATE, EINVOICE, WATER, LUMINAIRES, FLEET, BILL_TABLE];

export const MANUAL = {
  id: 'elle',
  title: 'Diğer tablolar (sütun eşleştirme)',
  fills: 'Seçtiğiniz herhangi bir alan',
  formats: '.xlsx, .xls, .ods, .csv',
  source: 'Yukarıdakilere uymayan dökümler: trafik sayımları, bakım giderleri, personel özetleri vb.',
  variants: ['Sütunu ve işlemi (toplam, ortalama, satır sayısı…) siz seçersiniz', 'Başlık satırı otomatik bulunur, gerekirse değiştirilebilir'],
};

export function detectType(file) {
  let best = null;
  for (const ex of EXTRACTORS) {
    const score = ex.detect(file);
    if (score >= 0.5 && (!best || score > best.score)) best = { id: ex.id, score };
  }
  return best ? best.id : 'elle';
}

export const extractorById = id => EXTRACTORS.find(e => e.id === id);

// ---------- Elle eşleştirme ----------

export const OPERATIONS = [
  ['sum', 'Toplam'], ['avg', 'Ortalama'], ['count', 'Dolu satır sayısı'], ['distinct', 'Farklı değer sayısı'], ['max', 'En büyük'], ['min', 'En küçük'], ['first', 'İlk değer'],
];

// En çok metin hücresi içeren ve altında veri bulunan satır başlık sayılır.
export function guessHeader(rows) {
  let best = 0, bestScore = -1;
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r] || [];
    const texts = row.filter(c => c && c.t === 's' && !toNumber(c)).length;
    const below = (rows[r + 1] || []).filter(Boolean).length;
    const score = texts * 2 + (below ? 1 : 0);
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

export function columnsOf(sheet, headerIndex) {
  return (sheet.rows[headerIndex] || []).map((c, i) => [i, c ? String(c.v) : `Sütun ${String.fromCharCode(65 + i)}`]).filter(([, l]) => l);
}

export function applyOperation(sheet, headerIndex, col, op) {
  const cells = dataRows(sheet.rows, headerIndex).map(r => r[col]).filter(Boolean);
  if (op === 'count') return cells.length;
  if (op === 'distinct') return new Set(cells.map(c => String(c.v).trim().toUpperCase())).size;
  const nums = cells.map(toNumber).filter(Boolean).map(n => n.value);
  if (!nums.length) return null;
  if (op === 'sum') return nums.reduce((a, b) => a + b, 0);
  if (op === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (op === 'max') return Math.max(...nums);
  if (op === 'min') return Math.min(...nums);
  return nums[0];
}
