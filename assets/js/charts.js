// Bağımlılıksız SVG grafikler. Renkler CSS değişkenlerinden gelir (style.css → grafik renkleri),
// böylece açık/koyu tema tek yerden değişir. Fare/dokunma ipuçları `data-tip` özniteliğiyle verilir.

import { escapeHtml } from './format.js';

const NS = 'http://www.w3.org/2000/svg';

export function niceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return { lo, hi, ticks };
}

const scale = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0);

// Veri ucu yuvarlatılmış, taban ucu düz yatay çubuk.
function hbarPath(x0, x1, y, h) {
  const r = Math.min(4, Math.abs(x1 - x0), h / 2);
  if (Math.abs(x1 - x0) < 0.5) return '';
  if (x1 > x0) return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
  return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`;
}

// Üst ucu yuvarlatılmış dikey çubuk.
function vbarPath(x, w, y0, y1) {
  const r = Math.min(4, w / 2, Math.abs(y0 - y1));
  if (Math.abs(y0 - y1) < 0.5) return '';
  return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
}

// Etiketi kelime sınırlarından en fazla iki satıra böler; sığmayan kısım "…" ile kısaltılır.
function wrap(text, maxChars) {
  const lines = [''];
  for (const word of text.split(' ')) {
    const cur = lines[lines.length - 1];
    if (!cur || cur.length + 1 + word.length <= maxChars) lines[lines.length - 1] = cur ? `${cur} ${word}` : word;
    else lines.push(word);
  }
  const out = lines.slice(0, 2);
  if (lines.length > 2) out[1] = `${lines.slice(1).join(' ')}`;
  return out.map(l => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l));
}

const tipAttr = html => `data-tip="${escapeHtml(html)}"`;

// Çizgi grafiği: yıllara göre birden fazla seri (ör. kümülatif nakit akışı).
export function lineChart({ width, height = 260, series, xLabel = t => `${t}. yıl`, fmt }) {
  const m = { l: 64, r: 16, t: 12, b: 30 };
  const n = series[0].values.length;
  const all = series.flatMap(s => s.values).concat(0);
  const { lo, hi, ticks } = niceTicks(Math.min(...all), Math.max(...all), 5);
  const x = scale(0, n - 1, m.l, width - m.r);
  const y = scale(lo, hi, height - m.b, m.t);
  const xStep = Math.max(1, Math.ceil((n - 1) / Math.max(2, Math.floor((width - m.l - m.r) / 44))));

  let g = '';
  for (const t of ticks) {
    g += `<line class="grid${t === 0 ? ' zero' : ''}" x1="${m.l}" x2="${width - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    g += `<text class="tick" x="${m.l - 8}" y="${y(t)}" dy="0.32em" text-anchor="end">${fmt.axis(t)}</text>`;
  }
  for (let t = 0; t < n; t += xStep) g += `<text class="tick" x="${x(t)}" y="${height - 8}" text-anchor="middle">${t}</text>`;

  for (const s of series) {
    const d = s.values.map((v, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
    g += `<path class="line ${s.cls}" d="${d}"/>`;
    const last = s.values.length - 1;
    g += `<circle class="dot ${s.cls}" cx="${x(last)}" cy="${y(s.values[last])}" r="4"/>`;
  }

  // Yıl sütunları: dikey kılavuz ve ipucu
  const colW = (width - m.l - m.r) / Math.max(1, n - 1);
  g += `<line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${height - m.b}" style="display:none"/>`;
  for (let t = 0; t < n; t++) {
    const rows = series.map(s => `<div class="tip-row"><span class="key ${s.cls}"></span>${escapeHtml(s.name)}<b>${fmt.value(s.values[t])}</b></div>`).join('');
    const tip = `<div class="tip-title">${xLabel(t)}</div>${rows}`;
    g += `<rect class="hit" x="${Math.max(m.l, x(t) - colW / 2)}" y="${m.t}" width="${colW}" height="${height - m.t - m.b}" data-x="${x(t)}" ${tipAttr(tip)}/>`;
  }
  return `<svg xmlns="${NS}" class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${g}</svg>`;
}

// Yatay çubuk grafiği: her satırda etiket ve bir veya daha fazla çubuk (from → to).
// Tornado ve karşılaştırma grafiklerinde kullanılır.
export function hbarChart({ width, rows, refLines = [], fmt, barH = 14 }) {
  const m = { l: 8, r: 16, t: 4, b: 28 };
  const gap = 4, rowGap = 14, lineH = 15;
  const maxChars = Math.max(12, Math.floor((width - m.l - m.r) / 6.4));
  const wrapped = rows.map(r => wrap(r.label, maxChars));
  const values = rows.flatMap(r => r.bars.flatMap(b => [b.from, b.to])).concat(refLines.map(r => r.value));
  const { lo, hi, ticks } = niceTicks(Math.min(...values), Math.max(...values), Math.max(3, Math.floor((width - 40) / 90)));
  const x = scale(lo, hi, m.l, width - m.r);
  const labelH = i => wrapped[i].length * lineH + 6;
  const rowH = (r, i) => labelH(i) + r.bars.length * barH + (r.bars.length - 1) * gap + rowGap;
  const plotH = rows.reduce((s, r, i) => s + rowH(r, i), 0);
  const height = m.t + plotH + m.b;

  let g = '';
  for (const t of ticks) {
    g += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${m.t + plotH}"/>`;
    g += `<text class="tick" x="${x(t)}" y="${height - 8}" text-anchor="middle">${fmt.axis(t)}</text>`;
  }
  for (const ref of refLines) {
    g += `<line class="ref ${ref.cls || ''}" x1="${x(ref.value)}" x2="${x(ref.value)}" y1="${m.t}" y2="${m.t + plotH}"/>`;
  }
  let yy = m.t;
  rows.forEach((r, i) => {
    const spans = wrapped[i].map((ln, k) => `<tspan x="${m.l}" dy="${k ? lineH : 0}">${escapeHtml(ln)}</tspan>`).join('');
    g += `<text class="row-label" x="${m.l}" y="${yy + 12}">${spans}</text>`;
    let by = yy + labelH(i);
    for (const b of r.bars) {
      const d = hbarPath(x(b.from), x(b.to), by, barH);
      if (d) g += `<path class="bar ${b.cls}" d="${d}"/>`;
      g += `<rect class="hit" x="${m.l}" y="${by - gap / 2}" width="${width - m.l - m.r}" height="${barH + gap}" ${tipAttr(b.tip)}/>`;
      by += barH + gap;
    }
    yy += rowH(r, i);
  });
  return `<svg xmlns="${NS}" class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${g}</svg>`;
}

// Histogram: Monte Carlo NBD dağılımı; sıfırın altı ve üstü farklı renkte.
export function histogram({ width, height = 220, samples, bins = 30, fmt }) {
  const m = { l: 44, r: 16, t: 12, b: 30 };
  let min = samples[0], max = samples[samples.length - 1];
  if (min === max) { min -= 1; max += 1; }
  const { lo, hi, ticks } = niceTicks(min, max, Math.max(3, Math.floor((width - 60) / 90)));
  const bw = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const s of samples) counts[Math.min(bins - 1, Math.floor((s - lo) / bw))]++;
  const share = counts.map(c => c / samples.length);
  const yMax = niceTicks(0, Math.max(...share), 4);
  const x = scale(lo, hi, m.l, width - m.r);
  const y = scale(0, yMax.hi, height - m.b, m.t);

  let g = '';
  for (const t of yMax.ticks) {
    g += `<line class="grid${t === 0 ? ' zero' : ''}" x1="${m.l}" x2="${width - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    g += `<text class="tick" x="${m.l - 8}" y="${y(t)}" dy="0.32em" text-anchor="end">%${String(+(t * 100).toFixed(1)).replace('.', ',')}</text>`;
  }
  for (const t of ticks) g += `<text class="tick" x="${x(t)}" y="${height - 8}" text-anchor="middle">${fmt.axis(t)}</text>`;
  for (let i = 0; i < bins; i++) {
    const a = lo + i * bw, b = a + bw;
    const x0 = x(a) + 1, w = Math.max(1, x(b) - x(a) - 2);
    const cls = (a + b) / 2 < 0 ? 'neg' : 'pos';
    const d = vbarPath(x0, w, y(0), y(share[i]));
    if (d) g += `<path class="bar ${cls}" d="${d}"/>`;
    const tip = `<div class="tip-title">${fmt.value(a)} – ${fmt.value(b)}</div><div class="tip-row">Simülasyonların<b>%${(share[i] * 100).toFixed(1).replace('.', ',')}</b></div>`;
    g += `<rect class="hit" x="${x(a)}" y="${m.t}" width="${x(b) - x(a)}" height="${height - m.t - m.b}" ${tipAttr(tip)}/>`;
  }
  if (lo < 0 && hi > 0) {
    g += `<line class="ref" x1="${x(0)}" x2="${x(0)}" y1="${m.t}" y2="${height - m.b}"/>`;
  }
  return `<svg xmlns="${NS}" class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${g}</svg>`;
}

// Belge genelinde tek bir ipucu kutusu; [data-tip] taşıyan öğelerin üzerine gelindiğinde gösterilir.
export function installTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let activeCross = null;

  const hide = () => {
    tip.classList.remove('show');
    if (activeCross) activeCross.style.display = 'none';
    activeCross = null;
  };

  const show = e => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) return hide();
    tip.innerHTML = el.getAttribute('data-tip');
    tip.classList.add('show');
    const svg = el.ownerSVGElement;
    const cross = svg?.querySelector('.crosshair');
    if (activeCross && activeCross !== cross) activeCross.style.display = 'none';
    if (cross && el.dataset.x) {
      cross.setAttribute('x1', el.dataset.x);
      cross.setAttribute('x2', el.dataset.x);
      cross.style.display = '';
      activeCross = cross;
    }
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let left = e.clientX + pad, top = e.clientY + pad;
    if (left + r.width > window.innerWidth - 8) left = e.clientX - r.width - pad;
    if (top + r.height > window.innerHeight - 8) top = e.clientY - r.height - pad;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };

  document.addEventListener('pointermove', show);
  document.addEventListener('pointerdown', show);
  document.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('pointerleave', hide);
}
