// Hesap motoru: nakit akışları, net bugünkü değer, iç verim oranı, geri ödeme süreleri,
// Monte Carlo belirsizlik analizi, duyarlılık (tornado) ve başabaş analizi.
// Arayüzden bağımsızdır; tests/ altındaki testler doğrudan bu modülü çalıştırır.

import { GLOBAL_INPUTS, COST_OVERRUN } from './models.js';

const pct = x => x / 100;

export function npv(rate, flows) {
  let sum = 0;
  for (let t = 0; t < flows.length; t++) sum += flows[t] / Math.pow(1 + rate, t);
  return sum;
}

// İç verim oranı: NBD'yi sıfırlayan iskonto oranı (ikiye bölme yöntemi).
// İşaret değişimi yoksa (ör. hiç pozitif akış yoksa) null döner.
export function irr(flows) {
  const f = r => npv(r, flows);
  let lo = -0.99, hi = 1;
  let flo = f(lo), fhi = f(hi);
  while (flo * fhi > 0 && hi < 1e3) { hi *= 2; fhi = f(hi); }
  if (!(flo * fhi <= 0)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-10) return mid;
    if (flo * fm < 0) hi = mid;
    else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

// Kümülatif (iskontolu) nakit akışının sıfırı geçtiği yıl, yıl içinde doğrusal ara değerle.
// Analiz süresi içinde geri ödenmiyorsa null döner.
export function payback(flows, rate = 0) {
  let cum = flows[0];
  if (cum >= 0) return 0;
  for (let t = 1; t < flows.length; t++) {
    const d = flows[t] / Math.pow(1 + rate, t);
    const prev = cum;
    cum += d;
    if (cum >= 0) return t - 1 + (-prev / d);
  }
  return null;
}

export function cumulative(flows, rate = 0) {
  let cum = 0;
  return flows.map((f, t) => (cum += f / Math.pow(1 + rate, t)));
}

// Tek bir yatırımın tam değerlendirmesi.
// opts.costFactor yatırım maliyetini ölçekler (belirsizlik analizinde maliyet aşımı için).
export function evaluate(model, values, globals, opts = {}) {
  const costFactor = opts.costFactor ?? 1;
  const r = model.compute(values, globals);
  const investment = r.investment * costFactor;
  const grant = Math.min(Math.max(values.grant || 0, 0), investment);
  const life = Math.max(1, Math.round(values.life));
  const esc = pct(globals.esc);
  const finRate = pct(globals.finRate);
  const ecoRate = pct(globals.ecoRate);
  const co2Value = r.co2 * globals.carbon;

  const fin = [-(investment - grant)];
  const eco = [-investment];
  let finPvIn = 0, finPvOut = investment - grant;
  let ecoPvIn = 0, ecoPvOut = investment;

  for (let t = 1; t <= life; t++) {
    const growth = Math.pow(1 + esc, t - 1);
    let f = 0, e = 0, fIn = 0, fOut = 0, eIn = 0, eOut = 0;
    for (const line of r.lines) {
      const v = line.value * (line.esc ? growth : 1);
      if (line.kind !== 'social') { f += v; v >= 0 ? (fIn += v) : (fOut -= v); }
      if (line.kind !== 'transfer') { e += v; v >= 0 ? (eIn += v) : (eOut -= v); }
    }
    e += co2Value;
    eIn += Math.max(co2Value, 0);
    fin.push(f);
    eco.push(e);
    finPvIn += fIn / Math.pow(1 + finRate, t);
    finPvOut += fOut / Math.pow(1 + finRate, t);
    ecoPvIn += eIn / Math.pow(1 + ecoRate, t);
    ecoPvOut += eOut / Math.pow(1 + ecoRate, t);
  }

  const summarize = (flows, rate, pvIn, pvOut) => ({
    flows,
    npv: npv(rate, flows),
    irr: irr(flows),
    payback: payback(flows),
    dpayback: payback(flows, rate),
    bcr: pvOut > 0 ? pvIn / pvOut : null,
    cumulative: cumulative(flows, rate),
  });

  const sumLines = pred => r.lines.filter(pred).reduce((s, l) => s + l.value, 0);

  return {
    investment,
    grant,
    netInvestment: investment - grant,
    life,
    lines: r.lines,
    physical: r.physical,
    co2: r.co2,
    co2Value,
    year1: {
      cashIn: sumLines(l => l.kind !== 'social' && l.value > 0),
      cashOut: -sumLines(l => l.kind !== 'social' && l.value < 0),
      cashNet: sumLines(l => l.kind !== 'social'),
      ecoNet: sumLines(l => l.kind !== 'transfer') + co2Value,
    },
    fin: summarize(fin, finRate, finPvIn, finPvOut),
    eco: summarize(eco, ecoRate, ecoPvIn, ecoPvOut),
  };
}

// Belirsizlik altına alınan parametrelerin listesi: modelin varsayımları,
// fiyat artış oranı ve yatırım maliyeti sapması.
export function uncertainParams(model) {
  const params = model.inputs.filter(i => i.unc).map(i => ({ ...i, scope: 'model' }));
  for (const g of GLOBAL_INPUTS.filter(i => i.unc)) params.push({ ...g, scope: 'global' });
  params.push({ key: 'costFactor', scope: 'cost', label: COST_OVERRUN.label, unc: COST_OVERRUN.unc, src: COST_OVERRUN.src, value: 1 });
  return params;
}

function withParam(param, x, values, globals, opts) {
  if (param.scope === 'model') return [{ ...values, [param.key]: x }, globals, opts];
  if (param.scope === 'global') return [values, { ...globals, [param.key]: x }, opts];
  return [values, globals, { ...opts, costFactor: x }];
}

function currentValue(param, values, globals) {
  if (param.scope === 'model') return values[param.key];
  if (param.scope === 'global') return globals[param.key];
  return 1;
}

// Tekrarlanabilir sonuçlar için tohumlu sözde rastgele sayı üreteci (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Üçgen dağılımdan örnek: en düşük a, en olası c, en yüksek b.
export function triangular(u, a, c, b) {
  if (b <= a) return c;
  const fc = (c - a) / (b - a);
  return u < fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Monte Carlo: belirsiz her parametre, kullanıcının girdiği değer en olası değer olacak şekilde
// literatür aralığında üçgen dağılımla örneklenir. Kullanıcı değeri aralık dışındaysa aralık genişletilir.
export function monteCarlo(model, values, globals, { runs = 2000, seed = 20261030 } = {}) {
  const params = uncertainParams(model);
  const rand = rng(seed);
  const finNpv = new Float64Array(runs);
  const ecoNpv = new Float64Array(runs);
  for (let k = 0; k < runs; k++) {
    let v = values, g = globals, o = {};
    for (const p of params) {
      const c = currentValue(p, v, g);
      const x = triangular(rand(), Math.min(p.unc[0], c), c, Math.max(p.unc[1], c));
      [v, g, o] = withParam(p, x, v, g, o);
    }
    const res = evaluate(model, v, g, o);
    finNpv[k] = res.fin.npv;
    ecoNpv[k] = res.eco.npv;
  }
  const stats = arr => {
    const s = Array.from(arr).sort((a, b) => a - b);
    return {
      samples: s,
      pPositive: s.filter(x => x > 0).length / s.length,
      p10: quantile(s, 0.1),
      p50: quantile(s, 0.5),
      p90: quantile(s, 0.9),
    };
  };
  return { runs, fin: stats(finNpv), eco: stats(ecoNpv) };
}

// Duyarlılık (tornado): her parametre tek tek aralığının alt ve üst ucuna çekilir,
// diğerleri sabit tutulur. Sonuç, NBD üzerindeki etki genişliğine göre sıralanır.
export function tornado(model, values, globals, basis = 'fin') {
  const base = evaluate(model, values, globals)[basis].npv;
  const rows = uncertainParams(model).map(p => {
    const [lo, hi] = p.unc;
    const npvAt = x => evaluate(model, ...withParam(p, x, values, globals, {}))[basis].npv;
    const loNpv = npvAt(lo), hiNpv = npvAt(hi);
    return { param: p, lo, hi, loNpv, hiNpv, swing: Math.abs(hiNpv - loNpv) };
  });
  rows.sort((a, b) => b.swing - a.swing);
  return { base, rows };
}

// Başabaş: diğer her şey sabitken NBD'yi sıfırlayan parametre değeri.
// Aralık [lo, hi] içinde işaret değişimi yoksa null döner.
export function breakEven(model, values, globals, param, basis, lo, hi) {
  const f = x => evaluate(model, ...withParam(param, x, values, globals, {}))[basis].npv;
  let flo = f(lo), fhi = f(hi);
  if (flo === 0) return lo;
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}
