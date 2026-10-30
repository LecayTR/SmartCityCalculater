// Arayüz: sayfa yönlendirme, form, sonuç kartları, karşılaştırma ve kayıt/yükleme.

import { MODELS, GLOBAL_INPUTS, defaultValues } from './models.js';
import { evaluate, monteCarlo, tornado, breakEven, uncertainParams } from './engine.js';
import { lineChart, hbarChart, histogram, installTooltips } from './charts.js';
import { SOURCES } from './sources.js';
import * as F from './format.js';

const STORAGE_KEY = 'akilli-sehir-analizi-v1';
const THEME_KEY = 'akilli-sehir-tema';
const BASIS_LABEL = { fin: 'Mali (belediye kasası)', eco: 'Toplumsal' };
const KIND_LABEL = { cash: 'Belediye kasası', transfer: 'Belediye kasası (transfer)', social: 'Toplumsal' };

const GROUPS = [
  { id: 'data', title: '1. Mevcut durum', sub: 'Belediyenin kendi kayıtlarından girilecek veriler.' },
  { id: 'cost', title: '2. Yatırım ve işletme maliyetleri', sub: 'Teklif, keşif bedeli veya benzer ihalelerden alınacak maliyetler.' },
  { id: 'assumption', title: '3. Etki varsayımları', sub: 'Literatüre dayalı başlangıç değerleri. Pilot uygulama ölçümleriyle güncelleyin; belirsizlik analizinde gösterilen aralıkta değiştirilir.' },
];

const ICONS = {
  info: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>',
  good: '<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L21.1 7.4 19.7 6z"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M11 5h2v9h-2zm0 11h2v2h-2z"/></svg>',
  bad: '<svg viewBox="0 0 24 24"><path d="M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7 10.6 12l-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z"/></svg>',
  compare: 'M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z',
  method: 'M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5zM8 12v2h8v-2zm0 4v2h8v-2z',
};

// ---------- Durum ----------

function freshState() {
  return {
    municipality: '',
    preparer: '',
    globals: defaultValues(GLOBAL_INPUTS),
    values: Object.fromEntries(MODELS.map(m => [m.id, defaultValues(m.inputs)])),
    include: Object.fromEntries(MODELS.map(m => [m.id, true])),
    basis: Object.fromEntries(MODELS.map(m => [m.id, m.primary])),
  };
}

// Kayıtlı veriyi yalnızca bilinen ve geçerli alanlarla birleştirir.
function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const pick = (target, src, inputs) => {
    for (const i of inputs) if (src && Number.isFinite(src[i.key])) target[i.key] = src[i.key];
  };
  if (typeof saved.municipality === 'string') base.municipality = saved.municipality.slice(0, 120);
  if (typeof saved.preparer === 'string') base.preparer = saved.preparer.slice(0, 120);
  pick(base.globals, saved.globals, GLOBAL_INPUTS);
  for (const m of MODELS) {
    pick(base.values[m.id], saved.values?.[m.id], m.inputs);
    if (typeof saved.include?.[m.id] === 'boolean') base.include[m.id] = saved.include[m.id];
    if (saved.basis?.[m.id] === 'fin' || saved.basis?.[m.id] === 'eco') base.basis[m.id] = saved.basis[m.id];
  }
  return base;
}

function load() {
  try { return merge(freshState(), JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return freshState(); }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* gizli sekme vb. */ }
}

let state = load();

// ---------- Yardımcılar ----------

const $ = (sel, root = document) => root.querySelector(sel);
const esc = F.escapeHtml;
const modelById = id => MODELS.find(m => m.id === id);
const icon = (path, label = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>${label}`;

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function rangeText(i) {
  const [a, b] = i.unc;
  return i.unit === '%' ? `%${F.num(a, a % 1 ? 1 : 0)} – %${F.num(b, b % 1 ? 1 : 0)}` : `${F.inputNum(a)} – ${F.inputNum(b)} ${i.unit}`;
}

function paramValueText(p, x) {
  if (p.scope === 'cost') return `${x >= 1 ? '+' : '−'}%${F.num(Math.abs(x - 1) * 100, 0)}`;
  if (p.unit === '%') return F.pct(x, Math.abs(x % 1) < 0.05 ? 0 : 1);
  return `${F.num(x, 2)} ${p.unit}`;
}

function paybackText(res, basis = 'fin') {
  const s = res[basis];
  if (s.payback != null) return { value: F.years(s.payback), sub: s.dpayback != null ? `İskontolu: ${F.years(s.dpayback)}` : 'İskontolu: ömür içinde ödemiyor' };
  const annual = basis === 'fin' ? res.year1.cashNet : res.year1.ecoNet;
  const inv = basis === 'fin' ? res.netInvestment : res.investment;
  if (annual > 0) return { value: 'Ömür içinde ödemiyor', sub: `≈ ${F.years(inv / annual)} gerekir (ömür ${res.life} yıl)` };
  return { value: 'Geri ödemiyor', sub: 'Yıllık net etki sıfır veya negatif' };
}

const fmtTL = { axis: F.axisTL, value: F.tlShort };

// ---------- Analiz ----------

function analyse(model) {
  const v = state.values[model.id];
  const g = state.globals;
  return { res: evaluate(model, v, g), mc: monteCarlo(model, v, g) };
}

function verdict(model, res, mc) {
  const f = res.fin.npv, e = res.eco.npv;
  const pf = F.pct(mc.fin.pPositive * 100, 0), pe = F.pct(mc.eco.pPositive * 100, 0);
  if (f > 0 && mc.fin.pPositive >= 0.8) {
    return {
      level: 'good', label: 'Mali açıdan güçlü',
      title: 'Yatırım kendini amorti ediyor',
      text: `Mevcut varsayımlarla yatırım ${F.years(res.fin.payback)} içinde kendini geri ödüyor ve ${res.life} yıllık ömrü boyunca belediye bütçesine bugünkü değerle ${F.tlShort(f)} net katkı sağlıyor. Belirsizlik analizinde olumlu sonuç olasılığı ${pf}.`,
    };
  }
  if (f > 0) {
    return {
      level: 'warn', label: 'Olumlu ama belirsiz',
      title: 'Kârlı görünüyor, ancak varsayımlara duyarlı',
      text: `Beklenen değerlerle mali net bugünkü değer ${F.tlShort(f)}; fakat belirsizlik analizinde olumlu sonuç olasılığı ${pf}. Karardan önce sonucu en çok etkileyen varsayımın pilot uygulamayla doğrulanması önerilir.`,
    };
  }
  if (e > 0) {
    return {
      level: mc.eco.pPositive >= 0.8 ? 'good' : 'warn', label: 'Toplumsal fayda odaklı',
      title: 'Belediye kasasına geri dönmüyor, şehre değer katıyor',
      text: `Yatırım belediye bütçesi açısından kendini amorti etmiyor (mali NBD ${F.tlShort(f)}), ancak vatandaşa ve kamuya sağladığı faydalarla toplumsal net bugünkü değeri ${F.tlShort(e)}${res.eco.bcr ? `, fayda/maliyet oranı ${F.num(res.eco.bcr, 2)}` : ''}. Toplumsal açıdan olumlu sonuç olasılığı ${pe}. Gerekçe kamu yararı olmalı; hibe veya dış finansman belediyenin yükünü azaltabilir.`,
    };
  }
  return {
    level: 'bad', label: 'Ekonomik değil',
    title: 'Mevcut varsayımlarla yatırım kendini karşılamıyor',
    text: `Hem mali (${F.tlShort(f)}) hem toplumsal (${F.tlShort(e)}) net bugünkü değer negatif. Maliyetlerin düşürülmesi, kapsamın daraltılması veya hibe ile yeniden değerlendirilmesi önerilir.`,
  };
}

// Başabaş cümleleri: maliyet toleransı ve en etkili varsayımın eşik değeri.
function breakEvenNotes(model, basis, tor) {
  const v = state.values[model.id], g = state.globals;
  const params = uncertainParams(model);
  const notes = [];
  const base = tor.base;
  const cost = params.find(p => p.scope === 'cost');
  if (base > 0) {
    const x = breakEven(model, v, g, cost, basis, 1, 20);
    notes.push(x != null
      ? `Yatırım maliyeti <b>%${F.num((x - 1) * 100, 0)}</b> daha yüksek gerçekleşse bile net bugünkü değer sıfırın üzerinde kalır.`
      : 'Yatırım maliyeti 20 katına çıksa bile net bugünkü değer pozitif kalır.');
  } else {
    const x = breakEven(model, v, g, cost, basis, 0.001, 1);
    notes.push(x != null
      ? `Net bugünkü değerin sıfıra ulaşması için yatırım maliyetinin <b>%${F.num((1 - x) * 100, 0)}</b> düşmesi gerekir.`
      : 'Yatırım maliyeti sıfıra inse bile yıllık net etki negatif olduğu için yatırım kendini karşılamaz.');
  }
  const top = tor.rows.find(r => r.param.scope === 'model' && r.swing > 0);
  if (top) {
    const p = top.param;
    const increasing = top.hiNpv > top.loNpv;
    const lo = p.min ?? 0, hi = p.max ?? Math.max(p.unc[1], v[p.key]) * 10;
    const x = breakEven(model, v, g, p, basis, lo, hi);
    const cur = paramValueText(p, v[p.key]);
    if (x != null) {
      notes.push(`Sonucu en çok etkileyen varsayım <b>${esc(p.label.toLowerCase())}</b>. Yatırımın kendini karşılaması için bu değerin ${increasing ? 'en az' : 'en fazla'} <b>${paramValueText(p, x)}</b> olması gerekir (girilen: ${cur}).`);
    } else {
      notes.push(`Sonucu en çok etkileyen varsayım <b>${esc(p.label.toLowerCase())}</b>; bu varsayımın makul her değerinde sonucun işareti değişmiyor.`);
    }
  }
  return notes;
}

// ---------- Sekmeler ve yönlendirme ----------

function renderTabs(active) {
  const tab = (id, label, path) => `<a class="tab" href="#${id}" ${id === active ? 'aria-current="page"' : ''}>${icon(path)}${label}</a>`;
  $('#tabs').innerHTML =
    MODELS.map(m => tab(m.id, m.name, m.icon)).join('') +
    '<span class="tab-sep" aria-hidden="true"></span>' +
    tab('karsilastirma', 'Karşılaştırma', ICONS.compare) +
    tab('yontem', 'Yöntem ve Kaynaklar', ICONS.method);
}

let currentPage = null;

function route() {
  const [page, anchor] = decodeURIComponent(location.hash.slice(1)).split('/');
  const id = page || MODELS[0].id;
  const known = modelById(id) || id === 'karsilastirma' || id === 'yontem';
  const target = known ? id : MODELS[0].id;
  const changed = target !== currentPage;
  currentPage = target;
  renderTabs(target);
  if (modelById(target)) renderModelPage(modelById(target));
  else if (target === 'karsilastirma') renderCompare();
  else renderMethod(anchor);
  if (changed && !anchor) window.scrollTo(0, 0);
  bindHeader();
}

function bindHeader() {
  document.querySelectorAll('[data-bind="municipality"]').forEach(el => {
    el.textContent = state.municipality ? `${state.municipality} · ` : '';
  });
}

function printMeta() {
  const date = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const parts = [state.municipality || 'Belediye adı girilmedi', state.preparer, date].filter(Boolean);
  return `<div class="print-only card"><strong>Akıllı Şehir Yatırım Analizi – Ön Fizibilite Raporu</strong><br>${parts.map(esc).join(' · ')}</div>`;
}

// ---------- Form ----------

function fieldHtml(i, value, prefix) {
  const id = `f-${prefix}-${i.key}`;
  const changed = value !== i.value;
  const srcs = (i.src || []).map(s => `<a class="chip" href="#yontem/${s}" title="${esc(SOURCES[s].short)}">${s}</a>`).join('');
  const meta = (i.unc ? `<span>Literatür aralığı: ${rangeText(i)}</span>` : '') + srcs;
  return `<div class="field${changed ? ' changed' : ''}" data-key="${i.key}">
    <div class="field-top">
      <label for="${id}">${esc(i.label)}</label>
      ${i.help ? `<button type="button" class="info-btn" aria-expanded="false" aria-controls="${id}-help" aria-label="Açıklamayı göster">?</button>` : ''}
    </div>
    <div class="input-wrap"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${F.inputNum(value)}" data-key="${i.key}"><span class="unit">${esc(i.unit)}</span></div>
    ${i.help ? `<div class="help" id="${id}-help" hidden>${esc(i.help)}</div>` : ''}
    ${meta ? `<div class="meta">${meta}</div>` : ''}
    <div class="error" hidden></div>
  </div>`;
}

function validate(i, x) {
  if (!Number.isFinite(x)) return 'Geçerli bir sayı girin.';
  if (i.min != null && x < i.min) return i.max != null ? `${F.inputNum(i.min)} ile ${F.inputNum(i.max)} arasında olmalı.` : `En az ${F.inputNum(i.min)} olmalı.`;
  if (i.max != null && x > i.max) return `${F.inputNum(i.min ?? 0)} ile ${F.inputNum(i.max)} arasında olmalı.`;
  return null;
}

// Bir form kapsayıcısındaki girdileri durum nesnesine bağlar.
function bindFields(root, inputs, target, onChange) {
  root.addEventListener('input', e => {
    const el = e.target.closest('input[data-key]');
    if (!el) return;
    const i = inputs.find(x => x.key === el.dataset.key);
    const field = el.closest('.field');
    let x = F.parseNum(el.value);
    if (i.step === 1 && Number.isFinite(x)) x = Math.round(x);
    const err = validate(i, x);
    field.classList.toggle('invalid', !!err);
    const box = field.querySelector('.error');
    box.hidden = !err;
    box.textContent = err || '';
    if (err) return;
    target[i.key] = x;
    field.classList.toggle('changed', x !== i.value);
    save();
    onChange();
  });
  root.addEventListener('focusout', e => {
    const el = e.target.closest('input[data-key]');
    if (el && !el.closest('.field').classList.contains('invalid')) el.value = F.inputNum(target[el.dataset.key]);
  });
  root.addEventListener('click', e => {
    const btn = e.target.closest('.info-btn');
    if (!btn) return;
    const help = document.getElementById(btn.getAttribute('aria-controls'));
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    help.hidden = !open;
  });
}

// ---------- Yatırım sayfası ----------

function renderModelPage(model) {
  const v = state.values[model.id];
  const groups = GROUPS.map(gr => {
    const fields = model.inputs.filter(i => i.group === gr.id).map(i => fieldHtml(i, v[i.key], model.id)).join('');
    return `<details class="card form-section" open>
      <summary><h2>${gr.title}</h2><span class="chev" aria-hidden="true">›</span></summary>
      <p class="sub">${gr.sub}</p>${fields}
    </details>`;
  }).join('');

  $('#view').innerHTML = `
    <div class="page-head"><h1>${model.name}</h1><p>${model.summary}</p></div>
    ${printMeta()}
    <div class="notice no-print">${ICONS.info}<span>Varsayılan değerler <strong>örnektir</strong>, gerçek belediye verisi değildir. Kendi verilerinizi girdikçe sonuçlar anında güncellenir; genel parametreler (iskonto oranı, fiyat artışı, karbon değeri) <a href="#" data-open-settings>Genel ayarlar</a> bölümündedir.</span></div>
    <div class="layout">
      <form class="inputs" id="model-form" autocomplete="off" onsubmit="return false">
        <h2 class="print-only">Ek: Hesaplamada kullanılan girdiler</h2>
        ${groups}
        <button type="button" class="btn no-print" id="btn-reset-model">Bu yatırımın girdilerini varsayılana döndür</button>
      </form>
      <div class="results" id="results" aria-live="polite"></div>
    </div>
    <div class="mobile-summary on no-print" id="mobile-summary"></div>`;

  const form = $('#model-form');
  bindFields(form, model.inputs, v, debounce(() => renderResults(model), 120));
  $('#btn-reset-model').addEventListener('click', () => {
    if (!confirm(`${model.name} girdileri varsayılan değerlere döndürülsün mü?`)) return;
    state.values[model.id] = defaultValues(model.inputs);
    save();
    renderModelPage(model);
  });
  renderResults(model);
}

function tile(label, value, sub, opts = {}) {
  return `<div class="tile${opts.emph ? ' emph' : ''}"><div class="t-label">${label}</div><div class="t-value${opts.neg ? ' neg' : ''}">${value}</div>${sub ? `<div class="t-sub">${sub}</div>` : ''}</div>`;
}

function renderResults(model) {
  const box = $('#results');
  if (!box) return;
  const { res, mc } = analyse(model);
  const basis = state.basis[model.id];
  const tor = tornado(model, state.values[model.id], state.globals, basis);
  const vd = verdict(model, res, mc);
  const pb = paybackText(res);
  const primary = model.primary;
  const hasSocial = res.lines.some(l => l.kind === 'social') || res.co2Value > 0;

  const tiles = [
    tile('Toplam yatırım', F.tlShort(res.investment), res.grant > 0 ? `Hibe sonrası belediye payı: ${F.tlShort(res.netInvestment)}` : `${res.life} yıllık ekonomik ömür`),
    tile('Yıllık net nakit etkisi (1. yıl)', F.tlShort(res.year1.cashNet), `Tasarruf/gelir ${F.tlShort(res.year1.cashIn)} − ek gider ${F.tlShort(res.year1.cashOut)}`, { neg: res.year1.cashNet < 0 }),
    tile('Geri ödeme süresi', pb.value, pb.sub),
    tile('Mali net bugünkü değer', F.tlShort(res.fin.npv), `İVO ${res.fin.irr != null ? F.pct(res.fin.irr * 100) : '—'} · F/M ${F.num(res.fin.bcr, 2)}`, { neg: res.fin.npv < 0, emph: primary === 'fin' }),
    tile('Toplumsal net bugünkü değer', F.tlShort(res.eco.npv), `F/M ${F.num(res.eco.bcr, 2)} · yıllık ${F.tlShort(res.year1.ecoNet)}`, { neg: res.eco.npv < 0, emph: primary === 'eco' }),
    tile('CO₂ azaltımı', `${F.num(res.co2, 0)} ton/yıl`, `Ömür boyunca ${F.num(res.co2 * res.life, 0)} ton`),
  ].join('');

  const lineRows = res.lines.map(l => `<tr><td>${esc(l.label)}<br><span class="kind ${l.kind}">${KIND_LABEL[l.kind]}${l.esc ? ' · fiyat artışına bağlı' : ''}</span></td><td class="num${l.value < 0 ? ' neg-text' : ''}">${F.tl(l.value)}</td></tr>`).join('');
  const co2Row = res.co2Value > 0 ? `<tr><td>Azaltılan CO₂’nin değeri<br><span class="kind social">Toplumsal</span></td><td class="num">${F.tl(res.co2Value)}</td></tr>` : '';

  const narrative = `
    <ul>
      <li>Yatırım maliyeti: <b>${F.tlShort(res.investment)}</b>${res.grant > 0 ? ` (hibe sonrası ${F.tlShort(res.netInvestment)})` : ''}</li>
      <li>Belediyeye yıllık brüt tasarruf / gelir: <b>${F.tlShort(res.year1.cashIn)}</b></li>
      <li>Yıllık ek işletme gideri: <b>${F.tlShort(res.year1.cashOut)}</b></li>
      <li>Yıllık net etki: <b>${F.tlShort(res.year1.cashNet)}</b></li>
      <li>Basit geri ödeme süresi: <b>${pb.value === 'Geri ödemiyor' || pb.value === 'Ömür içinde ödemiyor' ? `${pb.value.toLowerCase()} (${pb.sub.toLowerCase()})` : `yaklaşık ${pb.value}`}</b></li>
      ${hasSocial ? `<li>Vatandaş ve kamu için yıllık toplumsal fayda (CO₂ dahil): <b>${F.tlShort(res.year1.ecoNet)}</b></li>` : ''}
    </ul>
    <p>${res.fin.payback != null
      ? `Bu varsayımlar altında yatırım ilk maliyetini yaklaşık ${F.years(res.fin.payback)} içinde karşılar.`
      : 'Bu varsayımlar altında yatırım, ekonomik ömrü içinde belediye bütçesine ilk maliyetini geri kazandırmaz.'}
      Bu, yatırımın kesinlikle kârlı ya da kârsız olacağı anlamına gelmez; gerçek sonuç ölçülen tasarrufa, sistemin ömrüne ve maliyet değişimlerine bağlıdır. Aşağıdaki belirsizlik ve duyarlılık analizleri, sonucun bu değişimlere ne kadar dayanıklı olduğunu gösterir.</p>`;

  const sim = mc[basis];
  const notes = breakEvenNotes(model, basis, tor);
  const flowsTable = res.fin.flows.map((f, t) => `<tr><td>${t}</td><td class="num">${F.tl(f)}</td><td class="num">${F.tl(res.fin.cumulative[t])}</td><td class="num">${F.tl(res.eco.flows[t])}</td><td class="num">${F.tl(res.eco.cumulative[t])}</td></tr>`).join('');
  const seg = `<div class="seg no-print" role="group" aria-label="Analiz bakışı">${['fin', 'eco'].map(b => `<button type="button" data-basis="${b}" aria-pressed="${b === basis}">${b === 'fin' ? 'Mali' : 'Toplumsal'}</button>`).join('')}</div>`;

  box.innerHTML = `
    <div class="card verdict ${vd.level}">
      <div class="v-icon">${ICONS[vd.level]}</div>
      <div><div class="v-label">${vd.label}</div><h2>${vd.title}</h2><p>${vd.text}</p></div>
    </div>
    <div class="tiles">${tiles}</div>

    <div class="card narrative">
      <h2>Belediye bu sonuçtan ne anlamalı?</h2>
      ${narrative}
    </div>

    <div class="card">
      <h2>Kümülatif net değer (bugünkü değerle)</h2>
      <p class="sub">Eğrinin sıfır çizgisini kestiği yıl iskontolu geri ödeme süresi, son noktası ise net bugünkü değerdir.</p>
      <div class="legend"><span><i class="line fin"></i>Mali (belediye kasası)</span><span><i class="line eco"></i>Toplumsal</span></div>
      <div class="chart-box" id="chart-cum"></div>
      <details class="more"><summary>Yıllık nakit akışı tablosu</summary>
        <div class="table-wrap"><table><thead><tr><th>Yıl</th><th class="num">Mali akış</th><th class="num">Mali kümülatif (BD)</th><th class="num">Toplumsal akış</th><th class="num">Toplumsal kümülatif (BD)</th></tr></thead><tbody>${flowsTable}</tbody></table></div>
      </details>
    </div>

    <div class="card">
      <h2>Yıllık etki dökümü (1. yıl)</h2>
      <p class="sub">Pozitif değerler tasarruf veya gelir, negatif değerler ek giderdir.</p>
      <div class="table-wrap"><table>
        <tbody>${lineRows}${co2Row}</tbody>
        <tfoot>
          <tr><td>Belediye kasasına net etki</td><td class="num">${F.tl(res.year1.cashNet)}</td></tr>
          <tr><td>Toplumsal net etki <span class="kind">(transferler hariç)</span></td><td class="num">${F.tl(res.year1.ecoNet)}</td></tr>
        </tfoot>
      </table></div>
      <h3 style="font-size:14px;margin:16px 0 4px">Fiziksel göstergeler</h3>
      <dl class="phys">${res.physical.map(p => `<div><dt>${esc(p.label)}</dt><dd>${F.unitValue(p.value, p.unit)}</dd></div>`).join('')}<div><dt>Yıllık CO₂ azaltımı</dt><dd>${F.num(res.co2, 1)} ton</dd></div></dl>
    </div>

    <div class="card">
      <div class="card-head"><h2>Belirsizlik analizi</h2>${seg}</div>
      <p class="sub">${F.num(mc.runs, 0)} simülasyon: etki varsayımları literatür aralığında, fiyat artışı ve yatırım maliyeti sapmasıyla birlikte rastgele değiştirildi. ${BASIS_LABEL[basis]} net bugünkü değerin dağılımı.</p>
      <div class="stats">
        <span>Olumlu sonuç olasılığı <b>${F.pct(sim.pPositive * 100, 0)}</b></span>
        <span>Kötümser (P10) <b>${F.tlShort(sim.p10)}</b></span>
        <span>Ortanca (P50) <b>${F.tlShort(sim.p50)}</b></span>
        <span>İyimser (P90) <b>${F.tlShort(sim.p90)}</b></span>
      </div>
      <div class="legend"><span><i class="neg"></i>NBD &lt; 0</span><span><i class="pos"></i>NBD ≥ 0</span><span><i class="ref"></i>Sıfır çizgisi</span></div>
      <div class="chart-box" id="chart-hist"></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Duyarlılık: sonucu en çok ne etkiliyor?</h2>${seg}</div>
      <p class="sub">Her varsayım tek tek aralığının alt ve üst ucuna çekildiğinde ${BASIS_LABEL[basis].toLowerCase()} net bugünkü değer (dikey gri çizgi: mevcut sonuç ${F.tlShort(tor.base)}).</p>
      <div class="legend"><span><i class="lo"></i>Aralığın alt ucu</span><span><i class="hi"></i>Aralığın üst ucu</span></div>
      <div class="chart-box" id="chart-tornado"></div>
      <div class="narrative">${notes.map(n => `<p>${n}</p>`).join('')}</div>
    </div>`;

  box.querySelectorAll('[data-basis]').forEach(b => b.addEventListener('click', () => {
    state.basis[model.id] = b.dataset.basis;
    save();
    renderResults(model);
  }));

  drawModelCharts(res, sim, tor);

  const ms = $('#mobile-summary');
  if (ms) {
    const p = res[primary];
    ms.innerHTML = `
      <div class="ms-item">${primary === 'fin' ? 'Mali NBD' : 'Toplumsal NBD'}<b class="${p.npv < 0 ? 'neg-text' : ''}">${F.tlShort(p.npv)}</b></div>
      <div class="ms-item">Geri ödeme<b>${res[primary].payback != null ? F.years(res[primary].payback) : '—'}</b></div>
      <div class="ms-item">Olumlu olasılık<b>${F.pct(mc[primary].pPositive * 100, 0)}</b></div>
      <a class="btn" href="#results" data-scroll-results>Sonuçlar</a>`;
  }
}

function drawModelCharts(res, sim, tor) {
  const w = el => Math.max(260, Math.floor(el.clientWidth));
  const cum = $('#chart-cum');
  cum.innerHTML = lineChart({
    width: w(cum),
    series: [
      { name: 'Mali', cls: 'fin', values: res.fin.cumulative },
      { name: 'Toplumsal', cls: 'eco', values: res.eco.cumulative },
    ],
    fmt: fmtTL,
  });
  const hist = $('#chart-hist');
  hist.innerHTML = histogram({ width: w(hist), samples: sim.samples, fmt: fmtTL });
  const tc = $('#chart-tornado');
  tc.innerHTML = hbarChart({
    width: w(tc),
    fmt: fmtTL,
    refLines: [{ value: tor.base, cls: 'base' }, { value: 0 }],
    rows: tor.rows.map(r => ({
      label: `${r.param.label} (${paramValueText(r.param, r.lo)} … ${paramValueText(r.param, r.hi)})`,
      bars: [
        { from: tor.base, to: r.loNpv, cls: 'lo', tip: `<div class="tip-title">${esc(r.param.label)}</div><div class="tip-row"><span class="key lo"></span>${paramValueText(r.param, r.lo)} olursa<b>${F.tlShort(r.loNpv)}</b></div>` },
        { from: tor.base, to: r.hiNpv, cls: 'hi', tip: `<div class="tip-title">${esc(r.param.label)}</div><div class="tip-row"><span class="key hi"></span>${paramValueText(r.param, r.hi)} olursa<b>${F.tlShort(r.hiNpv)}</b></div>` },
      ],
    })),
  });
}

// ---------- Karşılaştırma ----------

function annuity(npvValue, rate, n) {
  return rate === 0 ? npvValue / n : npvValue * rate / (1 - Math.pow(1 + rate, -n));
}

function renderCompare() {
  const rows = MODELS.map(m => ({ m, ...analyse(m) }));
  const inc = rows.filter(r => state.include[r.m.id]);
  const finRate = state.globals.finRate / 100, ecoRate = state.globals.ecoRate / 100;

  const table = rows.map(({ m, res, mc }) => {
    const pb = paybackText(res);
    return `<tr>
      <td><label><input type="checkbox" data-include="${m.id}" ${state.include[m.id] ? 'checked' : ''}><a href="#${m.id}">${m.name}</a></label></td>
      <td class="num">${F.tlShort(res.investment)}</td>
      <td class="num${res.year1.cashNet < 0 ? ' neg-text' : ''}">${F.tlShort(res.year1.cashNet)}</td>
      <td class="num">${res.fin.payback != null ? F.years(res.fin.payback) : esc(pb.value)}</td>
      <td class="num${res.fin.npv < 0 ? ' neg-text' : ''}">${F.tlShort(res.fin.npv)}</td>
      <td class="num">${res.fin.irr != null ? F.pct(res.fin.irr * 100) : '—'}</td>
      <td class="num">${F.pct(mc.fin.pPositive * 100, 0)}</td>
      <td class="num${res.eco.npv < 0 ? ' neg-text' : ''}">${F.tlShort(res.eco.npv)}</td>
      <td class="num">${F.num(res.eco.bcr, 2)}</td>
      <td class="num">${F.tlShort(annuity(res.eco.npv, ecoRate, res.life))}</td>
      <td class="num">${F.num(res.co2, 0)}</td>
    </tr>`;
  }).join('');

  const sum = f => inc.reduce((s, r) => s + f(r), 0);
  const ranked = [...inc].sort((a, b) => b.res.eco.npv / b.res.investment - a.res.eco.npv / a.res.investment);
  const rankHtml = ranked.map(({ m, res }) => {
    const pi = res.eco.npv / res.investment;
    const fi = res.fin.npv / Math.max(res.netInvestment, 1);
    return `<li><div><b>${m.name}</b> — yatırılan her 1 TL için toplumsal net değer <b>${F.num(pi, 2)} TL</b>, belediye kasası için <b>${F.num(fi, 2)} TL</b>.
      <br><span class="kind">Yıllık eşdeğer mali değer: ${F.tlShort(annuity(res.fin.npv, finRate, res.life))} · ömür ${res.life} yıl</span></div></li>`;
  }).join('');

  $('#view').innerHTML = `
    <div class="page-head"><h1>Yatırımların karşılaştırılması</h1>
      <p>Dört yatırım, her birinin sayfasında girilen verilerle aynı ekonomik ölçütlere göre yan yana. Belediyeye yalnızca tek bir yatırımın geri ödeme süresini değil, farklı yatırımları aynı terazide tartma imkânı verir.</p></div>
    ${printMeta()}
    <div class="card">
      <h2>Özet tablo</h2>
      <p class="sub">İşaretli yatırımlar portföy toplamına ve öncelik sıralamasına dahil edilir.</p>
      <div class="table-wrap"><table class="compare-table">
        <thead><tr><th>Yatırım</th><th class="num">Yatırım</th><th class="num">Yıllık net nakit</th><th class="num">Geri ödeme</th><th class="num">Mali NBD</th><th class="num">Mali İVO</th><th class="num">Olumlu olasılık (mali)</th><th class="num">Toplumsal NBD</th><th class="num">Toplumsal F/M</th><th class="num">Yıllık eşdeğer (toplumsal)</th><th class="num">CO₂ ton/yıl</th></tr></thead>
        <tbody>${table}</tbody>
      </table></div>
    </div>

    <div class="tiles">
      ${tile('Portföy toplam yatırımı', F.tlShort(sum(r => r.res.investment)), `${inc.length} yatırım`)}
      ${tile('Yıllık net nakit etkisi', F.tlShort(sum(r => r.res.year1.cashNet)), 'Belediye kasası, 1. yıl')}
      ${tile('Toplam mali NBD', F.tlShort(sum(r => r.res.fin.npv)), '', { neg: sum(r => r.res.fin.npv) < 0 })}
      ${tile('Toplam toplumsal NBD', F.tlShort(sum(r => r.res.eco.npv)), '', { neg: sum(r => r.res.eco.npv) < 0 })}
      ${tile('Toplam CO₂ azaltımı', `${F.num(sum(r => r.res.co2), 0)} ton/yıl`, '')}
    </div>

    <div class="card">
      <h2>Net bugünkü değer karşılaştırması</h2>
      <p class="sub">Mali analiz belediye bütçesini, toplumsal analiz şehrin bütününü gösterir. Ömürleri farklı yatırımlar için tablodaki yıllık eşdeğer değer daha adil bir kıyas sağlar.</p>
      <div class="legend"><span><i class="fin"></i>Mali NBD</span><span><i class="eco"></i>Toplumsal NBD</span><span><i class="ref"></i>Sıfır çizgisi</span></div>
      <div class="chart-box" id="chart-compare"></div>
    </div>

    <div class="card">
      <h2>Bütçe kısıtlıysa öncelik sıralaması</h2>
      <p class="sub">Yatırılan her 1 TL’nin yarattığı toplumsal net değere (kârlılık endeksi) göre sıralanmıştır. Bütçe sınırlı olduğunda, toplam NBD’den çok bu oran belirleyicidir.</p>
      ${ranked.length ? `<ol class="rank">${rankHtml}</ol>` : '<p>Sıralama için en az bir yatırım seçin.</p>'}
    </div>`;

  $('#view').querySelectorAll('[data-include]').forEach(cb => cb.addEventListener('change', () => {
    state.include[cb.dataset.include] = cb.checked;
    save();
    renderCompare();
  }));

  const box = $('#chart-compare');
  box.innerHTML = hbarChart({
    width: Math.max(260, box.clientWidth),
    fmt: fmtTL,
    refLines: [{ value: 0 }],
    barH: 18,
    rows: rows.map(({ m, res }) => ({
      label: m.name,
      bars: [
        { from: 0, to: res.fin.npv, cls: 'fin', tip: `<div class="tip-title">${m.name}</div><div class="tip-row"><span class="key fin"></span>Mali NBD<b>${F.tlShort(res.fin.npv)}</b></div>` },
        { from: 0, to: res.eco.npv, cls: 'eco', tip: `<div class="tip-title">${m.name}</div><div class="tip-row"><span class="key eco"></span>Toplumsal NBD<b>${F.tlShort(res.eco.npv)}</b></div>` },
      ],
    })),
  });
}

// ---------- Yöntem ----------

function renderMethod(anchor) {
  $('#view').innerHTML = $('#tpl-yontem').innerHTML;
  $('#source-list').innerHTML = Object.entries(SOURCES).map(([k, s]) =>
    `<li id="kaynak-${k}"><b>[${k}]</b> ${esc(s.full)}<span class="use">Kullanım: ${esc(s.use)}</span></li>`).join('');
  if (anchor) {
    const el = document.getElementById(`kaynak-${anchor}`) || document.getElementById(anchor);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      document.querySelectorAll('.sources li').forEach(li => li.style.background = '');
      el.style.background = 'var(--accent-weak)';
    }
  }
}

// ---------- Genel ayarlar, kayıt, yazdırma, tema ----------

function rerenderCurrent() {
  const m = modelById(currentPage);
  if (m) renderResults(m);
  else if (currentPage === 'karsilastirma') renderCompare();
}

function setupSettings() {
  const dlg = $('#settings-dialog');
  const fields = $('#global-fields');
  const fill = () => {
    fields.innerHTML = GLOBAL_INPUTS.map(i => fieldHtml(i, state.globals[i.key], 'g')).join('');
    $('#g-municipality').value = state.municipality;
    $('#g-preparer').value = state.preparer;
  };
  bindFields(fields, GLOBAL_INPUTS, state.globals, debounce(rerenderCurrent, 150));
  $('#g-municipality').addEventListener('input', e => { state.municipality = e.target.value.slice(0, 120); save(); bindHeader(); });
  $('#g-preparer').addEventListener('input', e => { state.preparer = e.target.value.slice(0, 120); save(); });
  const open = () => { fill(); dlg.showModal(); };
  $('#btn-settings').addEventListener('click', open);
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-settings]')) { e.preventDefault(); open(); }
    if (e.target.closest('[data-scroll-results]')) { e.preventDefault(); $('#results')?.scrollIntoView({ behavior: 'smooth' }); }
  });
  // Ayarlar penceresindeki girdiler bindFields'a state.globals referansıyla bağlı; nesneyi koru.
  $('#btn-reset-all').addEventListener('click', () => {
    if (!confirm('Tüm yatırımların ve genel ayarların girdileri varsayılan değerlere döndürülsün mü?')) return;
    const fresh = freshState();
    Object.assign(state.globals, fresh.globals);
    for (const m of MODELS) Object.assign(state.values[m.id], fresh.values[m.id]);
    state.municipality = '';
    state.preparer = '';
    save();
    fill();
    bindHeader();
    route();
  });
}

function setupFileActions() {
  $('#btn-save').addEventListener('click', () => {
    const data = { app: 'akilli-sehir-yatirim-analizi', version: 1, savedAt: new Date().toISOString(), ...state };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const slug = (state.municipality || 'belediye').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g, '-').replace(/^-|-$/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `akilli-sehir-analizi-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#file-load').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const loaded = merge(freshState(), JSON.parse(await file.text()));
      Object.assign(state.globals, loaded.globals);
      for (const m of MODELS) Object.assign(state.values[m.id], loaded.values[m.id]);
      Object.assign(state.include, loaded.include);
      Object.assign(state.basis, loaded.basis);
      state.municipality = loaded.municipality;
      state.preparer = loaded.preparer;
      save();
      route();
    } catch {
      alert('Dosya okunamadı. Lütfen bu araçla kaydedilmiş bir .json dosyası seçin.');
    }
  });
  $('#btn-print').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => document.querySelectorAll('#view details').forEach(d => { d.dataset.wasOpen = d.open; d.open = true; }));
  window.addEventListener('afterprint', () => document.querySelectorAll('#view details').forEach(d => { if (d.dataset.wasOpen === 'false') d.open = false; }));
}

function setupTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* yok say */ }
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  $('#btn-theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* yok say */ }
  });
}

// ---------- Başlat ----------

setupTheme();
setupSettings();
setupFileActions();
installTooltips();
window.addEventListener('hashchange', route);
let lastWidth = window.innerWidth;
window.addEventListener('resize', debounce(() => {
  if (window.innerWidth === lastWidth) return; // mobilde adres çubuğu kaymasıyla gelen yükseklik değişimlerini yok say
  lastWidth = window.innerWidth;
  rerenderCurrent();
}, 200));
route();
