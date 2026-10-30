// Türkçe sayı biçimlendirme yardımcıları.

const nf = d => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const nfMax = d => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d });

export function num(x, d = 0) {
  if (x == null || !Number.isFinite(x)) return '—';
  return nf(d).format(x);
}

// Girdi alanlarında kullanılan biçim: gereksiz ondalık göstermez.
export function inputNum(x) {
  if (x == null || !Number.isFinite(x)) return '';
  return nfMax(4).format(x);
}

export function tl(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${nf(0).format(x)} TL`;
}

// Kısa gösterim: 56,5 milyon TL / 1,2 milyar TL
export function tlShort(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e9) return `${nf(2).format(x / 1e9)} milyar TL`;
  if (a >= 1e6) return `${nf(1).format(x / 1e6)} milyon TL`;
  if (a >= 1e4) return `${nf(0).format(x / 1e3)} bin TL`;
  return `${nf(0).format(x)} TL`;
}

// Eksen etiketleri için en kısa gösterim: 50 mn, 1,2 mr
export function axisTL(x) {
  const a = Math.abs(x);
  if (a >= 1e9) return `${nfMax(1).format(x / 1e9)} mr`;
  if (a >= 1e6) return `${nfMax(1).format(x / 1e6)} mn`;
  if (a >= 1e3) return `${nfMax(0).format(x / 1e3)} bin`;
  return nfMax(0).format(x);
}

export function pct(x, d = 1) {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x < 0 ? '−' : ''}%${nf(d).format(Math.abs(x))}`;
}

export function years(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${nf(1).format(x)} yıl`;
}

export function unitValue(value, unit) {
  if (unit === 'TL') return tl(value);
  if (unit === '%') return pct(value);
  const d = Math.abs(value) < 100 && value % 1 ? 1 : 0;
  return `${num(value, d)} ${unit}`;
}

// Hem "5.000" hem "0,44" hem "0.44" yazımını kabul eder.
export function parseNum(str) {
  let s = String(str).trim().replace(/\s|TL|%/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
