// Arayüz (v2 – Kontrol Merkezi): kenar menü, sonuç paneli, sekmeli analiz, karşılaştırma ve kayıt/yükleme.
// Hesaplar engine.js ve models.js'te; bu dosya yalnızca sunumdan sorumludur.

import { MODELS, GLOBAL_INPUTS, defaultValues } from './models.js';
import { evaluate, monteCarlo, tornado, breakEven, uncertainParams } from './engine.js';
import { lineChart, hbarChart, histogram, gauge, installTooltips } from './charts.js';
import { SOURCES } from './sources.js';
import * as F from './format.js';

const STORAGE_KEY = 'akilli-sehir-analizi-v1';
const THEME_KEY = 'akilli-sehir-tema';
const BASIS_LABEL = { fin: 'Mali (belediye kasası)', eco: 'Toplumsal' };
const KIND_LABEL = { cash: 'Belediye kasası', transfer: 'Belediye kasası (transfer)', social: 'Toplumsal' };

const GROUPS = [
  { id: 'data', title: 'Mevcut durum', hint: 'Belediye kayıtları', sub: 'Belediyenin kendi kayıtlarından girilecek veriler.' },
  { id: 'cost', title: 'Yatırım ve işletme maliyetleri', hint: 'Teklif ve keşif bedelleri', sub: 'Teklif, keşif bedeli veya benzer ihalelerden alınacak maliyetler.' },
  { id: 'assumption', title: 'Etki varsayımları', hint: 'Literatüre dayalı', sub: 'Literatüre dayalı başlangıç değerleri. Kaydırıcıdaki yeşil bant literatür aralığını gösterir; belirsizlik analizi bu aralıkta çalışır. Pilot ölçümle güncelleyin.' },
];

const ANALYSIS_TABS = [
  { id: 'akis', label: 'Nakit akışı' },
  { id: 'belirsizlik', label: 'Belirsizlik' },
  { id: 'duyarlilik', label: 'Duyarlılık' },
  { id: 'dokum', label: 'Etki dökümü' },
  { id: 'yorum', label: 'Özet yorum' },
];

const P = {
  compare: 'M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z',
  method: 'M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5zM8 12v2h8v-2zm0 4v2h8v-2z',
  wallet: 'M3 7a3 3 0 0 1 3-3h12v3H6a1 1 0 0 0 0 2h15v11H6a3 3 0 0 1-3-3zm14 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  trend: 'M2.3 16.3 9 9.6l4 4 5.6-5.6H15V6h7v7h-2V9.4l-7 7-4-4-5.3 5.3z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.4l4 2.3-1 1.7-5-2.9V7z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1 20c0-3.3 3.6-6 8-6s8 2.7 8 6v1H1zm16.5-5.9c2.9.4 5.5 2.2 5.5 4.9v1h-4.5v-1c0-1.9-.4-3.5-1-4.9z',
  leaf: 'M20 3C10 3 4 8 4 15c0 1.6.4 3 1 4.2L3.3 21l1.4 1.4 2-2C7.9 21.3 9.4 22 11 22c7 0 11-7 9-19zM8.5 17.5C10 14 13 11 16 9.5 13.5 12 11.5 14.5 10 18z',
  spark: 'M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z',
};
const STATUS_ICON = {
  good: '<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L21.1 7.4 19.7 6z"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M11 5h2v9h-2zm0 11h2v2h-2z"/></svg>',
  bad: '<svg viewBox="0 0 24 24"><path d="M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7 10.6 12l-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z"/></svg>',
};
const SHORT_NAV = { aydinlatma: 'Işık', su: 'Su', atik: 'Atık', trafik: 'Trafik', karsilastirma: 'Kıyas', yontem: 'Yöntem' };

// ---------- Durum ----------

function freshState() {
  return {
    municipality: '',
    preparer: '',
    globals: defaultValues(GLOBAL_INPUTS),
    values: Object.fromEntries(MODELS.map(m => [m.id, defaultValues(m.inputs)])),
    include: Object.fromEntries(MODELS.map(m => [m.id, true])),
    basis: Object.fromEntries(MODELS.map(m => [m.id, m.primary])),
    tab: Object.fromEntries(MODELS.map(m => [m.id, 'akis'])),
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
    if (ANALYSIS_TABS.some(t => t.id === saved.tab?.[m.id])) base.tab[m.id] = saved.tab[m.id];
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

const state = load();

// ---------- Yardımcılar ----------

const $ = (sel, root = document) => root.querySelector(sel);
const esc = F.escapeHtml;
const modelById = id => MODELS.find(m => m.id === id);
const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function rangeText(i) {
  const [a, b] = i.unc;
  return i.unit === '%' ? `${F.pct(a, a % 1 ? 1 : 0)} – ${F.pct(b, b % 1 ? 1 : 0)}` : `${F.inputNum(a)} – ${F.inputNum(b)} ${i.unit}`;
}

function paramValueText(p, x) {
  if (p.scope === 'cost') return `${x >= 1 ? '+' : '−'}%${F.num(Math.abs(x - 1) * 100, 0)}`;
  if (p.unit === '%') return F.pct(x, Math.abs(x % 1) < 0.05 ? 0 : 1);
  return `${F.num(x, 2)} ${p.unit}`;
}

function paybackInfo(res, basis = 'fin') {
  const s = res[basis];
  if (s.payback != null) return { value: F.years(s.payback), years: s.payback, sub: s.dpayback != null ? `İskontolu: ${F.years(s.dpayback)}` : 'İskontolu: ömür içinde ödemiyor' };
  const annual = basis === 'fin' ? res.year1.cashNet : res.year1.ecoNet;
  const inv = basis === 'fin' ? res.netInvestment : res.investment;
  if (annual > 0) return { value: 'Ömür içinde ödemiyor', years: inv / annual, sub: `≈ ${F.years(inv / annual)} gerekir (ömür ${res.life} yıl)` };
  return { value: 'Geri ödemiyor', years: null, sub: 'Yıllık net etki sıfır veya negatif' };
}

const fmtTL = { axis: F.axisTL, value: F.tlShort };

// Sayının eski değerinden yenisine yumuşak geçişle yazılması.
const shown = new Map();
function countUp(el, key, to, format) {
  const from = shown.get(key);
  shown.set(key, to);
  if (from == null || from === to || reduceMotion()) { el.textContent = format(to); return; }
  const start = performance.now(), dur = 650;
  const step = now => {
    const k = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = format(from + (to - from) * e);
    if (k < 1 && shown.get(key) === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- Analiz (girdi değişmedikçe önbellekten) ----------

const cache = new Map();
function analyse(model) {
  const v = state.values[model.id];
  const key = JSON.stringify([v, state.globals]);
  const hit = cache.get(model.id);
  if (hit && hit.key === key) return hit.result;
  const result = { res: evaluate(model, v, state.globals), mc: monteCarlo(model, v, state.globals) };
  cache.set(model.id, { key, result });
  return result;
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
  const notes = [];
  const cost = uncertainParams(model).find(p => p.scope === 'cost');
  if (tor.base > 0) {
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
    const x = breakEven(model, v, g, p, basis, p.min ?? 0, p.max ?? Math.max(p.unc[1], v[p.key]) * 10);
    notes.push(x != null
      ? `Sonucu en çok etkileyen varsayım <b>${esc(p.label.toLowerCase())}</b>. Yatırımın kendini karşılaması için bu değerin ${increasing ? 'en az' : 'en fazla'} <b>${paramValueText(p, x)}</b> olması gerekir (girilen: ${paramValueText(p, v[p.key])}).`
      : `Sonucu en çok etkileyen varsayım <b>${esc(p.label.toLowerCase())}</b>; bu varsayımın makul her değerinde sonucun işareti değişmiyor.`);
  }
  return notes;
}

// ---------- Gezinme ----------

let currentPage = null;

function renderNav() {
  const items = MODELS.map(m => {
    const { res, mc } = analyse(m);
    const vd = verdict(m, res, mc);
    return `<a class="nav-item" href="#${m.id}" ${m.id === currentPage ? 'aria-current="page"' : ''} title="${esc(vd.label)}">
      <span class="nav-icon">${svg(m.icon)}</span>
      <span class="nav-text"><b>${m.name}</b><small>${m.primary === 'fin' ? 'Mali' : 'Toplumsal'} NBD ${F.tlShort(res[m.primary].npv)}</small></span>
      <span class="status-dot ${vd.level}" role="img" aria-label="${esc(vd.label)}"></span>
    </a>`;
  }).join('');
  const link = (id, label, path) => `<a class="nav-item" href="#${id}" ${id === currentPage ? 'aria-current="page"' : ''}><span class="nav-icon">${svg(path)}</span><span class="nav-text"><b>${label}</b></span><span></span></a>`;
  $('#side-nav').innerHTML = `<div class="group-label">Yatırımlar</div>${items}<div class="group-label">Analiz</div>${link('karsilastirma', 'Karşılaştırma', P.compare)}${link('yontem', 'Yöntem ve Kaynaklar', P.method)}`;

  const bottom = [...MODELS.map(m => [m.id, m.icon]), ['karsilastirma', P.compare], ['yontem', P.method]];
  $('#bottom-nav').innerHTML = bottom.map(([id, path]) => `<a href="#${id}" ${id === currentPage ? 'aria-current="page"' : ''}>${svg(path)}${SHORT_NAV[id]}</a>`).join('');

  const muni = $('[data-bind="municipality"]');
  muni.hidden = !state.municipality;
  muni.textContent = state.municipality;
  $('[data-bind="municipality-short"]').textContent = state.municipality || 'Yatırım Analizi';
}

function route() {
  const [page, anchor] = decodeURIComponent(location.hash.slice(1)).split('/');
  const id = page || MODELS[0].id;
  const target = modelById(id) || id === 'karsilastirma' || id === 'yontem' ? id : MODELS[0].id;
  const changed = target !== currentPage;
  currentPage = target;
  $('#live-bar').classList.remove('show');
  heroObserver?.disconnect();
  if (modelById(target)) renderModelPage(modelById(target));
  else if (target === 'karsilastirma') renderCompare();
  else renderMethod(anchor);
  renderNav();
  if (changed && !anchor) window.scrollTo(0, 0);
}

function printMeta() {
  const date = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const parts = [state.municipality || 'Belediye adı girilmedi', state.preparer, date].filter(Boolean);
  return `<div class="print-only panel panel-pad" style="margin-bottom:12px"><strong>Akıllı Şehir Yatırım Analizi – Ön Fizibilite Raporu</strong><br>${parts.map(esc).join(' · ')}</div>`;
}

// ---------- Form ----------

function rangeVars(i, x) {
  const min = i.min ?? 0, max = i.max ?? 100;
  const pos = v => `${Math.max(0, Math.min(100, (v - min) / (max - min) * 100))}%`;
  const vars = [`--val:${pos(x)}`];
  if (i.unc) vars.push(`--lo:${pos(i.unc[0])}`, `--hi:${pos(i.unc[1])}`);
  return vars.join(';');
}

function fieldHtml(i, value, prefix) {
  const id = `f-${prefix}-${i.key}`;
  const changed = value !== i.value;
  const srcs = (i.src || []).map(s => `<a class="chip" href="#yontem/${s}" title="${esc(SOURCES[s].short)}">${s}</a>`).join('');
  const meta = (i.unc ? `<span class="band-key">Literatür aralığı: ${rangeText(i)}</span>` : '') + srcs;
  const box = `<div class="input-wrap"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${F.inputNum(value)}" data-key="${i.key}"><span class="unit">${esc(i.unit)}</span></div>`;
  const control = i.pct
    ? `<div class="slider-row"><input type="range" min="${i.min ?? 0}" max="${i.max ?? 100}" step="${i.step ?? 1}" value="${value}" data-key="${i.key}" style="${rangeVars(i, value)}" aria-label="${esc(i.label)}">${box}</div>`
    : box;
  return `<div class="field${changed ? ' changed' : ''}" data-key="${i.key}">
    <div class="field-top">
      <label for="${id}">${esc(i.label)}</label>
      ${i.help ? `<button type="button" class="info-btn" aria-expanded="false" aria-controls="${id}-help" aria-label="Açıklamayı göster">?</button>` : ''}
    </div>
    ${control}
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

// Bir form kapsayıcısındaki girdileri (sayı kutusu ve kaydırıcı) durum nesnesine bağlar.
function bindFields(root, inputs, target, onChange) {
  root.addEventListener('input', e => {
    const el = e.target.closest('input[data-key]');
    if (!el) return;
    const i = inputs.find(x => x.key === el.dataset.key);
    const field = el.closest('.field');
    let x = el.type === 'range' ? Number(el.value) : F.parseNum(el.value);
    if (i.step === 1 && Number.isFinite(x)) x = Math.round(x);
    const err = validate(i, x);
    field.classList.toggle('invalid', !!err);
    const box = field.querySelector('.error');
    box.hidden = !err;
    box.textContent = err || '';
    if (err) return;
    target[i.key] = x;
    field.classList.toggle('changed', x !== i.value);
    const range = field.querySelector('input[type="range"]');
    if (range) {
      range.setAttribute('style', rangeVars(i, x));
      if (el === range) field.querySelector('input[type="text"]').value = F.inputNum(x);
      else range.value = x;
    }
    save();
    onChange();
  });
  root.addEventListener('focusout', e => {
    const el = e.target.closest('input[type="text"][data-key]');
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

let heroObserver = null;
let current = null; // son hesaplanan analiz; sekme değişince grafikleri yeniden çizmek için

function renderModelPage(model) {
  const v = state.values[model.id];
  const steps = GROUPS.map((gr, k) => {
    const fields = model.inputs.filter(i => i.group === gr.id).map(i => fieldHtml(i, v[i.key], model.id)).join('');
    return `<details class="step" ${k === 0 || window.innerWidth > 1100 ? 'open' : ''}>
      <summary><span class="step-no">${k + 1}</span><span class="step-title"><b>${gr.title}</b><small>${gr.hint}</small></span><span class="chev" aria-hidden="true">›</span></summary>
      <div class="step-body"><p class="sub">${gr.sub}</p>${fields}</div>
    </details>`;
  }).join('');

  const tabs = ANALYSIS_TABS.map(t => `<button type="button" class="atab" role="tab" id="tab-${t.id}" aria-controls="panel-${t.id}" data-tab="${t.id}">${t.label}</button>`).join('');

  $('#view').innerHTML = `
    ${printMeta()}
    <section class="hero panel" id="hero">
      <div>
        <div class="hero-tag">${svg(model.icon)}${model.name}</div>
        <h1 data-ref="title"></h1>
        <p data-ref="text"></p>
        <div class="pill" data-ref="pill"></div>
      </div>
      <div class="hero-figures">
        <div class="big-figure">
          <div class="eyebrow">${model.primary === 'fin' ? 'Mali' : 'Toplumsal'} net bugünkü değer</div>
          <div class="value" data-ref="npv"></div>
          <div class="caption" data-ref="caption"></div>
        </div>
        <div class="gauge-box">
          <div data-ref="gauge"></div>
          <div class="gauge-center"><div><b data-ref="prob"></b><small>olumlu sonuç<br>olasılığı</small></div></div>
        </div>
      </div>
    </section>
    <section class="kpis reveal" id="kpis"></section>
    <div class="notice no-print">${svg(P.info)}<span>${model.summary} Varsayılan değerler <strong>örnektir</strong>; kendi verilerinizi girdikçe tüm sonuçlar anında güncellenir. İskonto oranı, fiyat artışı ve karbon değeri <a href="#" data-action="settings">genel ayarlardadır</a>.</span></div>
    <div class="workspace">
      <form class="inputs panel" id="model-form" autocomplete="off" onsubmit="return false">
        <div class="inputs-head"><h2>Veri girişi</h2><small id="edited-count"></small></div>
        <h2 class="print-only" style="padding:0 12px">Ek: Hesaplamada kullanılan girdiler</h2>
        ${steps}
        <div class="reset-row no-print"><button type="button" class="btn" id="btn-reset-model">Varsayılan değerlere dön</button></div>
      </form>
      <section class="analysis panel" id="analysis">
        <div class="atabs" role="tablist" aria-label="Analiz görünümleri">${tabs}</div>
        <div id="apanels"></div>
      </section>
    </div>`;

  bindFields($('#model-form'), model.inputs, v, debounce(() => { renderResults(model); renderNav(); }, 100));
  $('#btn-reset-model').addEventListener('click', () => {
    if (!confirm(`${model.name} girdileri varsayılan değerlere döndürülsün mü?`)) return;
    state.values[model.id] = defaultValues(model.inputs);
    save();
    renderModelPage(model);
    renderNav();
  });
  $('#analysis .atabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    state.tab[model.id] = b.dataset.tab;
    save();
    showTab(model, true);
  });

  heroObserver = new IntersectionObserver(([entry]) => {
    $('#live-bar').classList.toggle('show', !entry.isIntersecting && entry.boundingClientRect.top < 0);
  });
  heroObserver.observe($('#hero'));

  renderResults(model);
  setTimeout(() => $('#kpis')?.classList.remove('reveal'), 700);
}

function kpi(iconPath, label, value, caption, opts = {}) {
  return `<div class="kpi panel"><div class="kpi-head"><span class="kpi-icon">${svg(iconPath)}</span>${label}</div>
    <div class="value${opts.neg ? ' neg' : ''}">${value}</div>${opts.extra || ''}<div class="caption">${caption}</div></div>`;
}

function renderResults(model) {
  if (!$('#hero')) return;
  const { res, mc } = analyse(model);
  const basis = state.basis[model.id];
  const tor = tornado(model, state.values[model.id], state.globals, basis);
  const vd = verdict(model, res, mc);
  const primary = model.primary;
  const pb = paybackInfo(res, primary);
  current = { model, res, mc, tor, basis };

  // Hero yerinde güncellenir ki sayı ve gösterge yumuşak geçsin.
  const hero = $('#hero');
  hero.querySelector('[data-ref="title"]').textContent = vd.title;
  hero.querySelector('[data-ref="text"]').textContent = vd.text;
  const pill = hero.querySelector('[data-ref="pill"]');
  pill.className = `pill ${vd.level}`;
  pill.innerHTML = `<span class="pill-icon">${STATUS_ICON[vd.level]}</span>${vd.label}`;
  const npvEl = hero.querySelector('[data-ref="npv"]');
  npvEl.classList.toggle('neg', res[primary].npv < 0);
  countUp(npvEl, `${model.id}-npv`, res[primary].npv, F.tlShort);
  hero.querySelector('[data-ref="caption"]').textContent = `${res.life} yıllık ömür boyunca, bugünkü değerle · İVO ${res[primary].irr != null ? F.pct(res[primary].irr * 100) : '—'}`;
  const prob = mc[primary].pPositive;
  const gaugeBox = hero.querySelector('[data-ref="gauge"]');
  const arc = gaugeBox.querySelector('.gauge-arc');
  if (arc) {
    const c = 2 * Math.PI * Number(arc.getAttribute('r'));
    arc.style.transition = 'stroke-dasharray .7s cubic-bezier(.2,.8,.2,1)';
    arc.setAttribute('stroke-dasharray', `${(c * prob).toFixed(2)} ${c.toFixed(2)}`);
  } else {
    gaugeBox.innerHTML = gauge({ value: prob, label: 'Olumlu sonuç olasılığı' });
  }
  countUp(hero.querySelector('[data-ref="prob"]'), `${model.id}-prob`, prob * 100, x => F.pct(x, 0));

  // Göstergeler; geri ödeme kartında süre / ömür çizgisi
  const within = pb.years != null && res[primary].payback != null;
  const timeline = `<div class="timeline" title="Geri ödeme süresi / ekonomik ömür">${within ? `<div class="fill" style="width:${Math.min(1, pb.years / res.life) * 100}%"></div>` : '<div class="over"></div>'}</div>
    <div class="timeline-legend"><span>0</span><span>ömür ${res.life} yıl</span></div>`;
  const other = primary === 'fin' ? 'eco' : 'fin';
  $('#kpis').innerHTML = [
    kpi(P.wallet, 'Toplam yatırım', F.tlShort(res.investment), res.grant > 0 ? `Hibe sonrası belediye payı ${F.tlShort(res.netInvestment)}` : `${res.life} yıllık ekonomik ömür`),
    kpi(P.trend, 'Yıllık net nakit (1. yıl)', F.tlShort(res.year1.cashNet), `Tasarruf ${F.tlShort(res.year1.cashIn)} · gider ${F.tlShort(res.year1.cashOut)}`, { neg: res.year1.cashNet < 0 }),
    kpi(P.clock, `Geri ödeme${primary === 'eco' ? ' (toplumsal)' : ''}`, pb.value, pb.sub, { extra: timeline }),
    kpi(P.users, other === 'eco' ? 'Toplumsal NBD' : 'Mali NBD', F.tlShort(res[other].npv), other === 'eco' ? `F/M ${F.num(res.eco.bcr, 2)} · yıllık ${F.tlShort(res.year1.ecoNet)}` : `F/M ${F.num(res.fin.bcr, 2)} · belediye kasası`, { neg: res[other].npv < 0 }),
    kpi(P.leaf, 'CO₂ azaltımı', `${F.num(res.co2, 0)} ton/yıl`, `Ömür boyunca ${F.num(res.co2 * res.life, 0)} ton`),
  ].join('');

  const edited = model.inputs.filter(i => state.values[model.id][i.key] !== i.value).length;
  $('#edited-count').textContent = edited ? `${edited} alan düzenlendi` : 'Örnek değerler';

  renderPanels();
  renderLiveBar(model, res, mc, vd);
}

function renderPanels() {
  const { model, res, mc, tor, basis } = current;
  const sim = mc[basis];
  const seg = `<div class="seg no-print" role="group" aria-label="Analiz bakışı">${['fin', 'eco'].map(b => `<button type="button" data-basis="${b}" aria-pressed="${b === basis}">${b === 'fin' ? 'Mali' : 'Toplumsal'}</button>`).join('')}</div>`;
  const hasSocial = res.lines.some(l => l.kind === 'social') || res.co2Value > 0;
  const pbFin = paybackInfo(res, 'fin');
  const flowsTable = res.fin.flows.map((f, t) => `<tr><td>${t}</td><td class="num">${F.tl(f)}</td><td class="num">${F.tl(res.fin.cumulative[t])}</td><td class="num">${F.tl(res.eco.flows[t])}</td><td class="num">${F.tl(res.eco.cumulative[t])}</td></tr>`).join('');
  const lineRows = res.lines.map(l => `<tr><td>${esc(l.label)}<br><span class="kind ${l.kind}">${KIND_LABEL[l.kind]}${l.esc ? ' · fiyat artışına bağlı' : ''}</span></td><td class="num${l.value < 0 ? ' neg-text' : ''}">${F.tl(l.value)}</td></tr>`).join('');
  const co2Row = res.co2Value > 0 ? `<tr><td>Azaltılan CO₂’nin değeri<br><span class="kind social">Toplumsal</span></td><td class="num">${F.tl(res.co2Value)}</td></tr>` : '';
  const insight = html => `<div class="insight">${svg(P.spark)}<div>${html}</div></div>`;
  const neg = x => (x < 0 ? 'neg-text' : '');

  const panels = {
    akis: `
      <div class="apanel-head"><div><h2>Kümülatif net değer</h2><p class="sub">Bugünkü değerle. Eğrinin sıfırı kestiği nokta iskontolu geri ödeme süresi, son noktası net bugünkü değerdir.</p></div></div>
      <div class="legend"><span><i class="line fin"></i>Mali (belediye kasası)</span><span><i class="line eco"></i>Toplumsal</span><span><i class="mark"></i>Geri ödeme noktası</span></div>
      <div class="chart-box" data-chart="cum"></div>
      <details class="more"><summary>Yıllık nakit akışı tablosu</summary>
        <div class="table-wrap"><table><thead><tr><th>Yıl</th><th class="num">Mali akış</th><th class="num">Mali kümülatif (BD)</th><th class="num">Toplumsal akış</th><th class="num">Toplumsal kümülatif (BD)</th></tr></thead><tbody>${flowsTable}</tbody></table></div>
      </details>`,
    belirsizlik: `
      <div class="apanel-head"><p class="sub">${F.num(mc.runs, 0)} simülasyon: etki varsayımları literatür aralığında, fiyat artışı ve yatırım maliyeti sapmasıyla birlikte rastgele değiştirildi. ${BASIS_LABEL[basis]} net bugünkü değerin dağılımı.</p>${seg}</div>
      <div class="stat-chips">
        <div class="stat-chip hl"><small>Olumlu sonuç olasılığı</small><b>${F.pct(sim.pPositive * 100, 0)}</b></div>
        <div class="stat-chip"><small>Kötümser (P10)</small><b class="${neg(sim.p10)}">${F.tlShort(sim.p10)}</b></div>
        <div class="stat-chip"><small>Ortanca (P50)</small><b class="${neg(sim.p50)}">${F.tlShort(sim.p50)}</b></div>
        <div class="stat-chip"><small>İyimser (P90)</small><b class="${neg(sim.p90)}">${F.tlShort(sim.p90)}</b></div>
      </div>
      <div class="legend"><span><i class="neg"></i>NBD &lt; 0</span><span><i class="pos"></i>NBD ≥ 0</span><span><i class="ref"></i>Sıfır çizgisi</span></div>
      <div class="chart-box" data-chart="hist"></div>
      ${insight(`${oddsText(sim.pPositive)} yatırım ${basis === 'fin' ? 'belediye bütçesi' : 'toplum'} açısından kendini karşılıyor. Kötümser senaryoda (P10) sonuç ${F.tlShort(sim.p10)}.`)}`,
    duyarlilik: `
      <div class="apanel-head"><p class="sub">Her varsayım tek tek aralığının alt ve üst ucuna çekildiğinde ${BASIS_LABEL[basis].toLowerCase()} net bugünkü değer. Dikey gri çizgi mevcut sonuç (${F.tlShort(tor.base)}).</p>${seg}</div>
      <div class="legend"><span><i class="lo"></i>Aralığın alt ucu</span><span><i class="hi"></i>Aralığın üst ucu</span></div>
      <div class="chart-box" data-chart="tornado"></div>
      ${breakEvenNotes(model, basis, tor).map(insight).join('')}`,
    dokum: `
      <div class="apanel-head"><div><h2>1. yılın etki dökümü</h2><p class="sub">Pozitif değerler tasarruf veya gelir, negatif değerler ek giderdir.</p></div></div>
      <div class="legend"><span><i class="pos"></i>Tasarruf / gelir</span><span><i class="neg"></i>Ek gider</span></div>
      <div class="chart-box" data-chart="lines"></div>
      <div class="table-wrap"><table>
        <tbody>${lineRows}${co2Row}</tbody>
        <tfoot>
          <tr><td>Belediye kasasına net etki</td><td class="num">${F.tl(res.year1.cashNet)}</td></tr>
          <tr><td>Toplumsal net etki <span class="kind">(transferler hariç)</span></td><td class="num">${F.tl(res.year1.ecoNet)}</td></tr>
        </tfoot>
      </table></div>
      <dl class="phys">${res.physical.map(p => `<div><dt>${esc(p.label)}</dt><dd>${F.unitValue(p.value, p.unit)}</dd></div>`).join('')}<div><dt>Yıllık CO₂ azaltımı</dt><dd>${F.num(res.co2, 1)} ton</dd></div></dl>`,
    yorum: `
      <div class="narrative">
        <h2>Belediye bu sonuçtan ne anlamalı?</h2>
        <ul>
          <li>Yatırım maliyeti<b>${F.tlShort(res.investment)}</b></li>
          <li>Yıllık brüt tasarruf / gelir<b>${F.tlShort(res.year1.cashIn)}</b></li>
          <li>Yıllık ek işletme gideri<b>${F.tlShort(res.year1.cashOut)}</b></li>
          <li>Yıllık net etki (belediye)<b>${F.tlShort(res.year1.cashNet)}</b></li>
          <li>Basit geri ödeme süresi<b>${esc(pbFin.value)}</b></li>
          ${hasSocial ? `<li>Yıllık toplumsal fayda (CO₂ dahil)<b>${F.tlShort(res.year1.ecoNet)}</b></li>` : ''}
        </ul>
        <p>${res.fin.payback != null
          ? `Bu varsayımlar altında yatırım ilk maliyetini yaklaşık ${F.years(res.fin.payback)} içinde karşılar.`
          : 'Bu varsayımlar altında yatırım, ekonomik ömrü içinde belediye bütçesine ilk maliyetini geri kazandırmaz.'}
          Bu, yatırımın kesinlikle kârlı ya da kârsız olacağı anlamına gelmez; gerçek sonuç ölçülen tasarrufa, sistemin ömrüne ve maliyet değişimlerine bağlıdır. Belirsizlik ve duyarlılık sekmeleri sonucun bu değişimlere ne kadar dayanıklı olduğunu gösterir.</p>
      </div>`,
  };

  $('#apanels').innerHTML = ANALYSIS_TABS.map(t => `<div class="apanel" role="tabpanel" id="panel-${t.id}" aria-labelledby="tab-${t.id}" data-panel="${t.id}">${panels[t.id]}</div>`).join('');
  $('#apanels').querySelectorAll('[data-basis]').forEach(b => b.addEventListener('click', () => {
    state.basis[model.id] = b.dataset.basis;
    save();
    renderResults(model);
  }));
  showTab(model, false);
}

function oddsText(p) {
  const n = Math.round(p * 10);
  if (n >= 10) return 'Senaryoların neredeyse tamamında';
  if (n <= 0) return 'Senaryoların neredeyse hiçbirinde';
  return `Her 10 senaryodan yaklaşık <b>${n}</b> tanesinde`;
}

function showTab(model, animate) {
  const active = state.tab[model.id];
  document.querySelectorAll('#analysis .atab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === active)));
  document.querySelectorAll('#apanels .apanel').forEach(p => {
    const on = p.dataset.panel === active;
    p.hidden = !on;
    p.classList.toggle('enter', on && animate);
  });
  drawCharts($(`#panel-${active}`));
}

// Yalnızca görünür panellerin grafikleri çizilir (gizli kapsayıcının genişliği 0'dır).
// Yazdırmada sayfa genişliğine uygun sabit bir genişlik verilir.
const PRINT_WIDTH = 640;
function drawCharts(scope, fixedWidth) {
  if (!scope || !current) return;
  const { model, res, mc, tor, basis } = current;
  const w = el => fixedWidth || Math.max(260, Math.floor(el.clientWidth));
  scope.querySelectorAll('[data-chart]').forEach(box => {
    const kind = box.dataset.chart;
    if (kind === 'cum') {
      const p = model.primary;
      const d = res[p].dpayback;
      const markers = d != null && d > 0 ? [{ t: d, value: 0, label: `${p === 'fin' ? 'Mali' : 'Toplumsal'} geri ödeme · ${F.years(d)}` }] : [];
      box.innerHTML = lineChart({
        width: w(box), height: 280, area: true, markers, fmt: fmtTL,
        series: [{ name: 'Mali', cls: 'fin', values: res.fin.cumulative }, { name: 'Toplumsal', cls: 'eco', values: res.eco.cumulative }],
      });
    } else if (kind === 'hist') {
      box.innerHTML = histogram({ width: w(box), samples: mc[basis].samples, fmt: fmtTL });
    } else if (kind === 'tornado') {
      box.innerHTML = hbarChart({
        width: w(box), fmt: fmtTL, refLines: [{ value: tor.base, cls: 'base' }, { value: 0 }],
        rows: tor.rows.map(r => ({
          label: `${r.param.label} (${paramValueText(r.param, r.lo)} … ${paramValueText(r.param, r.hi)})`,
          bars: [
            { from: tor.base, to: r.loNpv, cls: 'lo', tip: `<div class="tip-title">${esc(r.param.label)}</div><div class="tip-row"><span class="key lo"></span>${paramValueText(r.param, r.lo)} olursa<b>${F.tlShort(r.loNpv)}</b></div>` },
            { from: tor.base, to: r.hiNpv, cls: 'hi', tip: `<div class="tip-title">${esc(r.param.label)}</div><div class="tip-row"><span class="key hi"></span>${paramValueText(r.param, r.hi)} olursa<b>${F.tlShort(r.hiNpv)}</b></div>` },
          ],
        })),
      });
    } else if (kind === 'lines') {
      const lines = res.co2Value > 0 ? [...res.lines, { label: 'Azaltılan CO₂’nin değeri', value: res.co2Value, kind: 'social' }] : res.lines;
      box.innerHTML = hbarChart({
        width: w(box), fmt: fmtTL, refLines: [{ value: 0 }],
        rows: lines.map(l => ({
          label: l.label,
          bars: [{ from: 0, to: l.value, cls: l.value < 0 ? 'neg' : 'pos', tip: `<div class="tip-title">${esc(l.label)}</div><div class="tip-row">${KIND_LABEL[l.kind]}<b>${F.tlShort(l.value)}</b></div>` }],
        })),
      });
    }
  });
}

function renderLiveBar(model, res, mc, vd) {
  const p = model.primary;
  $('#live-bar').innerHTML = `
    <div class="lb-name"><span class="status-dot ${vd.level}"></span><span>${model.short}</span></div>
    <div class="lb-item">${p === 'fin' ? 'Mali' : 'Toplumsal'} NBD<b class="${res[p].npv < 0 ? 'neg' : ''}">${F.tlShort(res[p].npv)}</b></div>
    <div class="lb-item">Geri ödeme<b>${res[p].payback != null ? F.years(res[p].payback) : '—'}</b></div>
    <div class="lb-item opt">Olasılık<b>${F.pct(mc[p].pPositive * 100, 0)}</b></div>
    <button type="button" class="btn" data-scroll-top>Özet ↑</button>`;
}

// ---------- Karşılaştırma ----------

function annuity(npvValue, rate, n) {
  return rate === 0 ? npvValue / n : npvValue * rate / (1 - Math.pow(1 + rate, -n));
}

function renderCompare() {
  const rows = MODELS.map(m => ({ m, ...analyse(m) }));
  const inc = rows.filter(r => state.include[r.m.id]);
  const finRate = state.globals.finRate / 100, ecoRate = state.globals.ecoRate / 100;
  const sum = f => inc.reduce((s, r) => s + f(r), 0);

  const cards = rows.map(({ m, res, mc }) => {
    const vd = verdict(m, res, mc);
    const npv = res[m.primary].npv;
    return `<article class="inv-card panel${state.include[m.id] ? '' : ' off'}">
      <div class="inv-card-head"><span class="nav-icon">${svg(m.icon)}</span><b>${m.name}</b>
        <label class="switch" title="Portföye dahil et"><input type="checkbox" data-include="${m.id}" ${state.include[m.id] ? 'checked' : ''} aria-label="${m.name} portföye dahil"><span></span></label></div>
      <span class="status-text ${vd.level}"><span class="status-dot ${vd.level}"></span>${vd.label}</span>
      <div class="value-label">${m.primary === 'fin' ? 'Mali' : 'Toplumsal'} net bugünkü değer</div>
      <div class="value${npv < 0 ? ' neg' : ''}">${F.tlShort(npv)}</div>
      <div class="mini">
        <div>Yatırım<b>${F.tlShort(res.investment)}</b></div>
        <div>Geri ödeme<b>${res[m.primary].payback != null ? F.years(res[m.primary].payback) : '—'}</b></div>
        <div>Olumlu olasılık<b>${F.pct(mc[m.primary].pPositive * 100, 0)}</b></div>
        <div>CO₂<b>${F.num(res.co2, 0)} t/yıl</b></div>
      </div>
      <a class="more" href="#${m.id}">Ayrıntılı analiz →</a>
    </article>`;
  }).join('');

  const ranked = [...inc].sort((a, b) => b.res.eco.npv / b.res.investment - a.res.eco.npv / a.res.investment);
  const maxPi = Math.max(...ranked.map(r => r.res.eco.npv / r.res.investment), 0.0001);
  const rankHtml = ranked.map(({ m, res }, k) => {
    const pi = res.eco.npv / res.investment;
    const fi = res.fin.npv / Math.max(res.netInvestment, 1);
    return `<li><span class="medal">${k + 1}</span><div>
      <div class="r-name">${m.name}</div>
      <div class="r-bar"><i style="width:${Math.max(0, pi / maxPi) * 100}%"></i></div>
      <div class="r-meta">1 TL yatırım başına toplumsal değer <b>${F.num(pi, 2)} TL</b> · belediye kasası <b>${F.num(fi, 2)} TL</b> · yıllık eşdeğer mali değer ${F.tlShort(annuity(res.fin.npv, finRate, res.life))}</div>
    </div></li>`;
  }).join('');

  const table = rows.map(({ m, res, mc }) => `<tr>
      <td><a href="#${m.id}">${m.name}</a></td>
      <td class="num">${F.tlShort(res.investment)}</td>
      <td class="num${res.year1.cashNet < 0 ? ' neg-text' : ''}">${F.tlShort(res.year1.cashNet)}</td>
      <td class="num">${res.fin.payback != null ? F.years(res.fin.payback) : esc(paybackInfo(res).value)}</td>
      <td class="num${res.fin.npv < 0 ? ' neg-text' : ''}">${F.tlShort(res.fin.npv)}</td>
      <td class="num">${res.fin.irr != null ? F.pct(res.fin.irr * 100) : '—'}</td>
      <td class="num">${F.pct(mc.fin.pPositive * 100, 0)}</td>
      <td class="num${res.eco.npv < 0 ? ' neg-text' : ''}">${F.tlShort(res.eco.npv)}</td>
      <td class="num">${F.num(res.eco.bcr, 2)}</td>
      <td class="num">${F.tlShort(annuity(res.eco.npv, ecoRate, res.life))}</td>
      <td class="num">${F.num(res.co2, 0)}</td>
    </tr>`).join('');

  const cash = sum(r => r.res.year1.cashNet), pf = sum(r => r.res.fin.npv), pe = sum(r => r.res.eco.npv);
  $('#view').innerHTML = `
    ${printMeta()}
    <section class="page-hero panel">
      <div class="eyebrow">Portföy görünümü</div>
      <h1>Yatırımların karşılaştırılması</h1>
      <p>Dört yatırım, her birinin sayfasında girilen verilerle aynı ekonomik ölçütlere göre yan yana. Belediyeye yalnızca tek bir yatırımın geri ödeme süresini değil, farklı yatırımları aynı terazide tartma imkânı verir.</p>
      <div class="portfolio">
        <div><small>Portföy yatırımı (${inc.length} yatırım)</small><b>${F.tlShort(sum(r => r.res.investment))}</b></div>
        <div><small>Yıllık net nakit etkisi</small><b class="${cash < 0 ? 'neg' : ''}">${F.tlShort(cash)}</b></div>
        <div><small>Toplam mali NBD</small><b class="${pf < 0 ? 'neg' : ''}">${F.tlShort(pf)}</b></div>
        <div><small>Toplam toplumsal NBD</small><b class="${pe < 0 ? 'neg' : ''}">${F.tlShort(pe)}</b></div>
      </div>
    </section>
    <div class="inv-cards reveal">${cards}</div>
    <div class="compare-grid">
      <section class="panel panel-pad">
        <h2>Net bugünkü değer</h2>
        <p class="sub">Mali analiz belediye bütçesini, toplumsal analiz şehrin bütününü gösterir.</p>
        <div class="legend"><span><i class="fin"></i>Mali NBD</span><span><i class="eco"></i>Toplumsal NBD</span><span><i class="ref"></i>Sıfır çizgisi</span></div>
        <div class="chart-box" id="chart-compare"></div>
      </section>
      <section class="panel panel-pad">
        <h2>Bütçe kısıtlıysa öncelik sırası</h2>
        <p class="sub">Yatırılan her 1 TL’nin yarattığı toplumsal net değere (kârlılık endeksi) göre. Bütçe sınırlıyken toplam NBD’den çok bu oran belirleyicidir.</p>
        ${ranked.length ? `<ol class="rank">${rankHtml}</ol>` : '<p class="sub">Sıralama için en az bir yatırımı portföye dahil edin.</p>'}
      </section>
    </div>
    <section class="panel panel-pad">
      <h2>Ayrıntılı tablo</h2>
      <p class="sub">Ömürleri farklı yatırımlar için yıllık eşdeğer değer daha adil bir kıyas sağlar.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Yatırım</th><th class="num">Yatırım</th><th class="num">Yıllık net nakit</th><th class="num">Geri ödeme</th><th class="num">Mali NBD</th><th class="num">Mali İVO</th><th class="num">Olumlu olasılık (mali)</th><th class="num">Toplumsal NBD</th><th class="num">Toplumsal F/M</th><th class="num">Yıllık eşdeğer (toplumsal)</th><th class="num">CO₂ ton/yıl</th></tr></thead>
        <tbody>${table}</tbody>
      </table></div>
    </section>`;

  $('#view').querySelectorAll('[data-include]').forEach(cb => cb.addEventListener('change', () => {
    state.include[cb.dataset.include] = cb.checked;
    save();
    renderCompare();
    $('.inv-cards')?.classList.remove('reveal');
  }));
  setTimeout(() => $('.inv-cards')?.classList.remove('reveal'), 700);

  const box = $('#chart-compare');
  box.innerHTML = hbarChart({
    width: Math.max(260, box.clientWidth), fmt: fmtTL, refLines: [{ value: 0 }], barH: 18,
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
  $('#view .prose').classList.add('panel');
  $('#source-list').innerHTML = Object.entries(SOURCES).map(([k, s]) =>
    `<li id="kaynak-${k}"><b>[${k}]</b> ${esc(s.full)}<span class="use">Kullanım: ${esc(s.use)}</span></li>`).join('');
  if (anchor) {
    const el = document.getElementById(`kaynak-${anchor}`) || document.getElementById(anchor);
    if (el) {
      el.classList.add('hl');
      el.scrollIntoView({ block: 'center' });
    }
  }
}

// ---------- Genel ayarlar, kayıt, yazdırma, tema ----------

function rerenderCurrent() {
  const m = modelById(currentPage);
  if (m) renderResults(m);
  else if (currentPage === 'karsilastirma') renderCompare();
  renderNav();
}

function setupSettings() {
  const dlg = $('#settings-dialog');
  const fields = $('#global-fields');
  const fill = () => {
    fields.innerHTML = GLOBAL_INPUTS.map(i => fieldHtml(i, state.globals[i.key], 'g')).join('');
    $('#g-municipality').value = state.municipality;
    $('#g-preparer').value = state.preparer;
  };
  // Girdiler state.globals nesnesine bağlıdır; sıfırlama ve yükleme bu nesneyi yerinde günceller.
  bindFields(fields, GLOBAL_INPUTS, state.globals, debounce(rerenderCurrent, 150));
  $('#g-municipality').addEventListener('input', e => { state.municipality = e.target.value.slice(0, 120); save(); renderNav(); });
  $('#g-preparer').addEventListener('input', e => { state.preparer = e.target.value.slice(0, 120); save(); });
  $('#btn-reset-all').addEventListener('click', () => {
    if (!confirm('Tüm yatırımların ve genel ayarların girdileri varsayılan değerlere döndürülsün mü?')) return;
    const fresh = freshState();
    Object.assign(state.globals, fresh.globals);
    for (const m of MODELS) Object.assign(state.values[m.id], fresh.values[m.id]);
    state.municipality = '';
    state.preparer = '';
    save();
    fill();
    route();
  });
  return () => { fill(); dlg.showModal(); };
}

function saveFile() {
  const data = { app: 'akilli-sehir-yatirim-analizi', version: 1, savedAt: new Date().toISOString(), ...state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const slug = (state.municipality || 'belediye').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g, '-').replace(/^-|-$/g, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `akilli-sehir-analizi-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function loadFile(file) {
  try {
    const loaded = merge(freshState(), JSON.parse(await file.text()));
    Object.assign(state.globals, loaded.globals);
    for (const m of MODELS) Object.assign(state.values[m.id], loaded.values[m.id]);
    Object.assign(state.include, loaded.include);
    Object.assign(state.basis, loaded.basis);
    Object.assign(state.tab, loaded.tab);
    state.municipality = loaded.municipality;
    state.preparer = loaded.preparer;
    save();
    route();
  } catch {
    alert('Dosya okunamadı. Lütfen bu araçla kaydedilmiş bir .json dosyası seçin.');
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* yok say */ }
}

function setupActions(openSettings) {
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (a && a.tagName !== 'INPUT') {
      const act = a.dataset.action;
      if (act === 'settings') { e.preventDefault(); openSettings(); }
      else if (act === 'save') saveFile();
      else if (act === 'theme') toggleTheme();
      else if (act === 'print') window.print();
    }
    if (e.target.closest('[data-scroll-top]')) window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  });
  document.querySelectorAll('input[data-action="load"]').forEach(inp => inp.addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) loadFile(file);
  }));

  // Yazdırırken tüm analiz panelleri ve açılır bölümler görünür olur.
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('#view details').forEach(d => { d.dataset.wasOpen = d.open; d.open = true; });
    document.querySelectorAll('#apanels .apanel').forEach(p => { p.hidden = false; drawCharts(p, PRINT_WIDTH); });
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll('#view details').forEach(d => { if (d.dataset.wasOpen === 'false') d.open = false; });
    const m = modelById(currentPage);
    if (m) showTab(m, false);
  });
}

// ---------- Başlat ----------

setupActions(setupSettings());
installTooltips();
window.addEventListener('hashchange', route);
let lastWidth = window.innerWidth;
window.addEventListener('resize', debounce(() => {
  if (window.innerWidth === lastWidth) return; // mobilde adres çubuğu kaymasıyla gelen yükseklik değişimlerini yok say
  lastWidth = window.innerWidth;
  const m = modelById(currentPage);
  if (m) drawCharts($(`#panel-${state.tab[m.id]}`));
  else if (currentPage === 'karsilastirma') renderCompare();
}, 200));
route();
