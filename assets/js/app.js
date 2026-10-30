// Arayüz (v3 – Sakin): başlangıç sayfası, rehberli veri girişi, soru-cevap düzeninde sonuçlar,
// sade dilli karşılaştırma ve kayıt/yükleme. Hesaplar engine.js ve models.js'tedir.

import { MODELS, GLOBAL_INPUTS, defaultValues } from './models.js';
import { evaluate, monteCarlo, tornado, breakEven, uncertainParams } from './engine.js';
import { lineChart, hbarChart, histogram, installTooltips } from './charts.js';
import { SOURCES } from './sources.js';
import { HINTS, COST_HINT } from './hints.js';
import { readFile, ReadError } from './sheets.js';
import { EXTRACTORS, MANUAL, TARGETS, OPERATIONS, detectType, extractorById, check, inputOf, guessHeader, columnsOf, applyOperation } from './importer.js';
import { buildTemplate } from './template.js';
import * as F from './format.js';

const STORAGE_KEY = 'akilli-sehir-analizi-v1';
const THEME_KEY = 'akilli-sehir-tema-v3';
const KIND_LABEL = { cash: 'Belediye bütçesi', transfer: 'Belediye bütçesi (transfer)', social: 'Toplum' };
const WHO = { fin: 'belediye bütçesi', eco: 'şehir geneli' };

const GROUPS = [
  { id: 'data', title: 'Mevcut durum', hint: 'Belediye kayıtlarınızdan', sub: 'Bugünkü durumu anlatan veriler. Her alanın altında verinin nereden bulunacağı yazar.' },
  { id: 'cost', title: 'Yatırım ve işletme maliyetleri', hint: 'Teklif ve ihalelerden', sub: 'Yatırımın kuruluş ve yıllık işletme maliyetleri.' },
  { id: 'assumption', title: 'Etki varsayımları', hint: 'Bilimsel kaynaklardan', sub: 'Yatırımın ne kadar tasarruf sağlayacağına dair kaynaklara dayalı başlangıç değerleri. Sarı bant kaynaklardaki aralığı gösterir. Pilot uygulamanız varsa ölçtüğünüz değeri girin.' },
];

const P = {
  home: 'M12 3 2 12h3v8h6v-6h2v6h6v-8h3z',
  compare: 'M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z',
  method: 'M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5zM8 12v2h8v-2zm0 4v2h8v-2z',
  settings: 'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.7a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.4l4 2.3-1 1.7-5-2.9V7z',
  wallet: 'M3 7a3 3 0 0 1 3-3h12v3H6a1 1 0 0 0 0 2h15v11H6a3 3 0 0 1-3-3zm14 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.6 8 11 4.6-1.4 8-6 8-11V5zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4z',
  sliders: 'M3 17v2h6v-2zm0-12v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2z',
  upload: 'M12 3 6.5 8.5l1.4 1.4L11 6.8V16h2V6.8l3.1 3.1 1.4-1.4zM4 18v3h16v-3h-2v1H6v-1z',
  doc: 'M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5zM8 12v2h8v-2zm0 4v2h5v-2z',
  leaf: 'M20 3C10 3 4 8 4 15c0 1.6.4 3 1 4.2L3.3 21l1.4 1.4 2-2C7.9 21.3 9.4 22 11 22c7 0 11-7 9-19zM8.5 17.5C10 14 13 11 16 9.5 13.5 12 11.5 14.5 10 18z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z',
  bulb: 'M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zm-3 18h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
  alert: 'M12 2 1 21h22zm1 15h-2v-2h2zm0-4h-2V9h2z',
};
const STATUS_ICON = {
  good: '<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L21.1 7.4 19.7 6z"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M11 5h2v9h-2zm0 11h2v2h-2z"/></svg>',
  bad: '<svg viewBox="0 0 24 24"><path d="M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7 10.6 12l-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z"/></svg>',
};
const STATUS_COLOR = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' };
const NAV_SHORT = { aydinlatma: 'Aydınlatma', su: 'Su', atik: 'Atık', trafik: 'Trafik' };
// Her yatırım sayfasında önerilen belge türleri
const DOCS_FOR = { aydinlatma: ['efatura', 'fatura-tablosu', 'armatur', 'sablon'], su: ['su-dengesi', 'sablon'], atik: ['yakit', 'sablon'], trafik: ['sablon', 'elle'] };

// ---------- Durum ----------

function freshState() {
  return {
    municipality: '',
    preparer: '',
    globals: defaultValues(GLOBAL_INPUTS),
    values: Object.fromEntries(MODELS.map(m => [m.id, defaultValues(m.inputs)])),
    include: Object.fromEntries(MODELS.map(m => [m.id, true])),
    basis: Object.fromEntries(MODELS.map(m => [m.id, m.primary])),
    // Kullanıcının kendi verisiyle doldurduğu veya "doğru" diye onayladığı alanlar
    confirmed: Object.fromEntries(MODELS.map(m => [m.id, []])),
    // Belgeden gelen değerlerin kaynağı: { yatırım: { alan: { file, where, at } } }; "genel" genel ayarlar içindir
    sources: Object.fromEntries(TARGETS.map(t => [t.id, {}])),
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
    const keys = new Set(m.inputs.map(i => i.key));
    if (Array.isArray(saved.confirmed?.[m.id])) base.confirmed[m.id] = saved.confirmed[m.id].filter(k => keys.has(k));
  }
  for (const t of TARGETS) {
    for (const [k, src] of Object.entries(saved.sources?.[t.id] || {})) {
      if (t.inputs.some(i => i.key === k) && src && typeof src.file === 'string') {
        base.sources[t.id][k] = { file: src.file.slice(0, 300), where: String(src.where || '').slice(0, 300), at: String(src.at || '').slice(0, 30) };
      }
    }
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
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// "10 senaryodan 7'sinde" gibi ifadeler için Türkçe ek.
const LOC = ['hiçbirinde', '1’inde', '2’sinde', '3’ünde', '4’ünde', '5’inde', '6’sında', '7’sinde', '8’inde', '9’unda', '10’unda'];
const outOfTen = p => Math.max(0, Math.min(10, Math.round(p * 10)));

function rangeText(i) {
  const [a, b] = i.unc;
  return i.unit === '%' ? `${F.pct(a, a % 1 ? 1 : 0)} – ${F.pct(b, b % 1 ? 1 : 0)}` : `${F.inputNum(a)} – ${F.inputNum(b)} ${i.unit}`;
}

function paramValueText(p, x) {
  if (p.scope === 'cost') return `${x >= 1 ? '+' : '−'}%${F.num(Math.abs(x - 1) * 100, 0)}`;
  if (p.unit === '%') return F.pct(x, Math.abs(x % 1) < 0.05 ? 0 : 1);
  return `${F.num(x, 2)} ${p.unit}`;
}

const fmtTL = { axis: F.axisTL, value: F.tlShort };

// Belediyenin kendi verisiyle doldurması beklenen alanlar (hibe isteğe bağlıdır).
const ownDataInputs = model => model.inputs.filter(i => (i.group === 'data' || i.group === 'cost') && i.key !== 'grant');
const isFilled = (model, key) => state.confirmed[model.id].includes(key) || state.values[model.id][key] !== model.inputs.find(i => i.key === key).value;
function completeness(model) {
  const list = ownDataInputs(model);
  return { done: list.filter(i => isFilled(model, i.key)).length, total: list.length };
}
function confirm(model, key) {
  if (!state.confirmed[model.id].includes(key)) state.confirmed[model.id].push(key);
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

// Sade dilli karar: kısa cevap başlığı ve açıklaması.
function verdict(model, res, mc) {
  const f = res.fin.npv, e = res.eco.npv;
  if (f > 0 && mc.fin.pPositive >= 0.8) {
    return {
      level: 'good', label: 'Kendini öder',
      title: 'Evet, yatırım kendini öder.',
      text: `Yaklaşık ${F.years(res.fin.payback)} içinde ilk maliyetini karşılar; ${res.life} yıllık ömrü boyunca belediye bütçesine bugünkü değerle ${F.tlShort(f)} net kazanç sağlar.`,
    };
  }
  if (f > 0) {
    return {
      level: 'warn', label: 'Öder ama belirsiz',
      title: 'Muhtemelen öder, ama sonuç varsayımlara duyarlı.',
      text: `Beklenen değerlerle ${F.years(res.fin.payback)} içinde kendini öder ve bugünkü değerle ${F.tlShort(f)} kazandırır. Ancak varsayımlar değiştiğinde 10 senaryodan yalnızca ${LOC[outOfTen(mc.fin.pPositive)]} kendini öder; karardan önce küçük bir pilot uygulama önerilir.`,
    };
  }
  if (e > 0) {
    return {
      level: mc.eco.pPositive >= 0.8 ? 'good' : 'warn', label: 'Şehre değer katar',
      title: 'Belediye kasasına geri dönmez, ama şehre değer katar.',
      text: `Belediye bütçesi açısından ömrü içinde kendini ödemez. Vatandaşa ve kamuya sağladığı faydalarla şehre bugünkü değerle ${F.tlShort(e)} net değer kazandırır${res.eco.bcr ? ` (her 1 TL maliyete ${F.num(res.eco.bcr, 2)} TL fayda)` : ''}. Hibe veya dış finansman belediyenin yükünü azaltabilir.`,
    };
  }
  return {
    level: 'bad', label: 'Kendini ödemez',
    title: 'Mevcut verilerle yatırım kendini ödemez.',
    text: `Hem belediye bütçesi (${F.tlShort(f)}) hem şehir geneli (${F.tlShort(e)}) için net değer negatif. Maliyeti düşürmek, kapsamı daraltmak veya hibe bulmak sonucu değiştirebilir; “Sonucu en çok ne değiştirir?” bölümüne bakın.`,
  };
}

function statusChip(vd) {
  return `<span class="status-chip ${vd.level}"><span class="ic">${STATUS_ICON[vd.level]}</span>${vd.label}</span>`;
}

// Kısa bir "ne zaman öder" ifadesi (başlangıç kartları ve mobil çubuk için).
function shortAnswer(model, res) {
  if (model.primary === 'eco' && res.fin.npv <= 0) return `Şehre ${F.tlShort(res.eco.npv)} net değer`;
  if (res.fin.payback != null) return `${F.years(res.fin.payback)} içinde kendini öder`;
  return 'Ömrü içinde kendini ödemez';
}

// Başabaş ve en etkili varsayımlara dair sade cümleler.
function driverNotes(model, basis, tor) {
  const v = state.values[model.id], g = state.globals;
  const notes = [];
  const cost = uncertainParams(model).find(p => p.scope === 'cost');
  const top = tor.rows.find(r => r.param.scope === 'model' && r.swing > 0);
  if (top) {
    const p = top.param;
    const increasing = top.hiNpv > top.loNpv;
    const x = breakEven(model, v, g, p, basis, p.min ?? 0, p.max ?? Math.max(p.unc[1], v[p.key]) * 10);
    notes.push(x != null
      ? `En belirleyici varsayım <b>${esc(p.label.toLowerCase())}</b>. Yatırımın kendini ödemesi için bu değerin ${increasing ? 'en az' : 'en fazla'} <b>${paramValueText(p, x)}</b> olması gerekir; şu an ${paramValueText(p, v[p.key])} girili.`
      : `En belirleyici varsayım <b>${esc(p.label.toLowerCase())}</b>; ancak bu varsayımın makul her değerinde sonuç aynı yönde kalıyor.`);
  }
  if (tor.base > 0) {
    const x = breakEven(model, v, g, cost, basis, 1, 20);
    notes.push(x != null
      ? `Yatırım maliyeti öngörülenden <b>%${F.num((x - 1) * 100, 0)}</b> fazla çıksa bile yatırım kendini öder.`
      : 'Yatırım maliyeti birkaç katına çıksa bile yatırım kendini öder.');
  } else {
    const x = breakEven(model, v, g, cost, basis, 0.001, 1);
    notes.push(x != null
      ? `Kendini ödemesi için yatırım maliyetinin <b>%${F.num((1 - x) * 100, 0)}</b> düşmesi gerekir.`
      : 'Yıllık net etki negatif olduğu için maliyet düşse bile yatırım kendini ödemez.');
  }
  const names = tor.rows.slice(0, 3).map(r => r.param.label.toLowerCase());
  notes.push(`Sonucu en çok etkileyen üç etken: ${names.map(esc).join(', ')}. Bunları küçük bir pilot uygulamayla ölçmek, kararın güvenilirliğini en çok artıracak adımdır.`);
  return notes;
}

// ---------- Gezinme ----------

let currentPage = null;
let answerObserver = null;

function renderNav() {
  const link = (id, label, path, extra = '') => `<a class="nav-link" href="#${id}" ${id === currentPage ? 'aria-current="page"' : ''}>${path ? svg(path) : ''}${label}${extra}</a>`;
  const models = MODELS.map(m => {
    const { res, mc } = analyse(m);
    const vd = verdict(m, res, mc);
    return link(m.id, NAV_SHORT[m.id], m.icon, ` <span class="dot" style="background:${STATUS_COLOR[vd.level]}" title="${esc(vd.label)}"></span>`);
  }).join('');
  $('#main-nav').innerHTML = link('baslangic', 'Başlangıç', P.home) + '<span class="nav-sep" aria-hidden="true"></span>' + models +
    '<span class="nav-sep" aria-hidden="true"></span>' + link('belgeler', 'Belge yükle', P.upload) + link('karsilastirma', 'Karşılaştır', P.compare) + link('yontem', 'Yöntem', P.method);
  $('[data-bind="municipality"]').textContent = state.municipality || 'Yatırım Rehberi';
  // Dar ekranda etkin sekme görünür alana kaydırılır.
  const nav = $('#main-nav'), active = nav.querySelector('[aria-current="page"]');
  if (active && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.clientWidth) / 2;
}

function route() {
  const [page, anchor] = decodeURIComponent(location.hash.slice(1)).split('/');
  const id = page || 'baslangic';
  const target = modelById(id) || ['baslangic', 'belgeler', 'karsilastirma', 'yontem'].includes(id) ? id : 'baslangic';
  const changed = target !== currentPage;
  currentPage = target;
  answerObserver?.disconnect();
  $('#answer-dock').hidden = true;
  if (modelById(target)) renderModelPage(modelById(target));
  else if (target === 'karsilastirma') renderCompare();
  else if (target === 'belgeler') renderImport();
  else if (target === 'yontem') renderMethod(anchor);
  else renderStart();
  renderNav();
  if (changed && !anchor) window.scrollTo(0, 0);
}

function printMeta() {
  const date = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const parts = [state.municipality || 'Belediye adı girilmedi', state.preparer, date].filter(Boolean);
  return `<div class="print-only card pad" style="margin-bottom:14px"><strong>Akıllı Şehir Yatırım Rehberi – Ön Fizibilite Raporu</strong><br>${parts.map(esc).join(' · ')}</div>`;
}

// ---------- Başlangıç ----------

function renderStart() {
  const cards = MODELS.map(m => {
    const { res, mc } = analyse(m);
    const vd = verdict(m, res, mc);
    const c = completeness(m);
    return `<a class="choice card" href="#${m.id}">
      <div class="choice-head"><span class="choice-icon">${svg(m.icon)}</span><h3>${m.name}</h3></div>
      <p>${m.summary}</p>
      <div>${statusChip(vd)}</div>
      <div class="choice-answer">${shortAnswer(m, res)}</div>
      <div class="choice-foot"><span>Belediye verisi: <b>${c.done} / ${c.total}</b> alan</span><span class="go">${c.done ? 'Devam et' : 'Hesapla'} →</span></div>
    </a>`;
  }).join('');

  $('#view').innerHTML = `
    <section class="welcome card">
      <div>
        <p class="kicker">Belediyeler için ön fizibilite aracı</p>
        <h1>Akıllı şehir yatırımınız kendini öder mi?</h1>
        <p class="lead">Belediyenizin verilerini girin; araç yatırımın ne zaman kendini ödeyeceğini, bütçeye ve şehre ne kazandıracağını ve bu sonuçtan ne kadar emin olabileceğinizi sade bir dille göstersin.</p>
      </div>
      <ol class="how">
        <li><div><b>Yatırımı seçin</b><span>Aşağıdaki dört akıllı şehir yatırımından birini açın.</span></div></li>
        <li><div><b>Verilerinizi girin ya da belge yükleyin</b><span>“Örnek” etiketli alanları elle değiştirin veya e-Fatura, su kayıpları raporu, envanter gibi belgelerinizi yükleyin.</span></div></li>
        <li><div><b>Cevabı okuyun, rapor alın</b><span>Sonuç, yöneticilerin sorduğu sorulara göre özetlenir. “Rapor al” ile PDF olarak saklayabilirsiniz.</span></div></li>
      </ol>
    </section>
    <h2 class="section-title">Yatırımlar</h2>
    <p class="section-sub">Kartlardaki sonuçlar şu an girili değerlere göredir; örnek değerlerle başlar.</p>
    <div class="choice-grid">${cards}</div>
    <div class="quick">
      <a class="card" href="#belgeler">${svg(P.upload)}<div><b>Belgeden doldurun</b><span>Excel, CSV veya e-Fatura dosyalarınızdaki değerleri alanlara aktarın.</span></div></a>
      <a class="card" href="#karsilastirma">${svg(P.compare)}<div><b>Yatırımları karşılaştırın</b><span>Bütçe kısıtlıysa hangi yatırımın önce yapılacağını görün.</span></div></a>
      <a class="card" href="#" data-action="settings">${svg(P.settings)}<div><b>Genel ayarlar</b><span>Belediye adı, iskonto oranı, fiyat artışı ve karbon değeri.</span></div></a>
      <a class="card" href="#yontem">${svg(P.method)}<div><b>Yöntem ve kaynaklar</b><span>Hesaplamaların nasıl yapıldığı ve dayandığı kaynaklar.</span></div></a>
    </div>`;
}

// ---------- Form ----------

function rangeVars(i, x) {
  const min = i.min ?? 0, max = i.max ?? 100;
  const pos = v => `${Math.max(0, Math.min(100, (v - min) / (max - min) * 100))}%`;
  const vars = [`--val:${pos(x)}`];
  if (i.unc) vars.push(`--lo:${pos(i.unc[0])}`, `--hi:${pos(i.unc[1])}`);
  return vars.join(';');
}

function fieldHtml(i, value, prefix, model) {
  const id = `f-${prefix}-${i.key}`;
  const tracked = model && ownDataInputs(model).includes(i);
  const example = tracked && !isFilled(model, i.key);
  const where = model && (i.group === 'data' || i.group === 'cost') ? (HINTS[model.id]?.[i.key] || (i.group === 'cost' && i.key !== 'grant' ? COST_HINT : null)) : null;
  const srcs = (i.src || []).map(s => `<a class="chip" href="#yontem/${s}" title="${esc(SOURCES[s].short)}">${s}</a>`).join('');
  const meta = (i.unc ? `<span class="band-key">Kaynaklardaki aralık: ${rangeText(i)}</span>` : '') + srcs;
  const box = `<div class="input-wrap"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${F.inputNum(value)}" data-key="${i.key}"><span class="unit">${esc(i.unit)}</span></div>`;
  const control = i.pct
    ? `<div class="slider-row"><input type="range" min="${i.min ?? 0}" max="${i.max ?? 100}" step="${i.step ?? 1}" value="${value}" data-key="${i.key}" style="${rangeVars(i, value)}" aria-label="${esc(i.label)}">${box}</div>`
    : box;
  const src = state.sources[model ? model.id : 'genel']?.[i.key];
  return `<div class="field${example ? ' is-example' : ''}" data-key="${i.key}">
    <div class="field-top">
      <label for="${id}">${esc(i.label)}</label>
      <span class="field-tags">
        ${tracked ? `<span class="tag-example">Örnek<button type="button" data-confirm="${i.key}" title="Bu değer belediyemiz için doğru">Doğru</button></span>` : ''}
        ${i.help ? `<button type="button" class="info-btn" aria-expanded="false" aria-controls="${id}-help" aria-label="Açıklamayı göster">?</button>` : ''}
      </span>
    </div>
    ${control}
    ${src ? sourceNote(src) : ''}
    ${where ? `<p class="where">${svg(P.pin)}<span>${esc(where)}</span></p>` : ''}
    ${i.help ? `<div class="help" id="${id}-help" hidden>${esc(i.help)}</div>` : ''}
    ${meta ? `<div class="meta">${meta}</div>` : ''}
    <div class="error" hidden></div>
  </div>`;
}

function sourceNote(src) {
  return `<p class="source-note">${svg(P.doc)}<span>Belgeden: <b>${esc(src.file)}</b> · ${esc(src.where)}</span></p>`;
}

// Alan elle değiştirildiğinde belge kaynağı artık geçerli değildir.
function dropSource(target, key, field) {
  if (state.sources[target]?.[key]) { delete state.sources[target][key]; save(); }
  field?.querySelector('.source-note')?.remove();
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
    const range = field.querySelector('input[type="range"]');
    if (range) {
      range.setAttribute('style', rangeVars(i, x));
      if (el === range) field.querySelector('input[type="text"]').value = F.inputNum(x);
      else range.value = x;
    }
    save();
    onChange(i.key, field);
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

const openDetails = new Set(); // yeniden çizimde açık kalması gereken ayrıntı bölümleri
let current = null;

function renderModelPage(model) {
  const v = state.values[model.id];
  const groups = GROUPS.map((gr, k) => {
    const fields = model.inputs.filter(i => i.group === gr.id).map(i => fieldHtml(i, v[i.key], model.id, model)).join('');
    return `<details class="group card" ${k < 2 || window.innerWidth > 1080 ? 'open' : ''}>
      <summary><span class="group-no">${k + 1}</span><span class="group-title"><b>${gr.title}</b><small>${gr.hint}</small></span><span class="chev" aria-hidden="true">›</span></summary>
      <div class="group-body"><p class="sub">${gr.sub}</p>${fields}</div>
    </details>`;
  }).join('');

  $('#view').innerHTML = `
    ${printMeta()}
    <div class="page-title">
      <a class="back no-print" href="#baslangic">← Tüm yatırımlar</a>
      <div class="title-row"><span class="title-icon">${svg(model.icon)}</span><div><h1>${model.name}</h1><p>${model.summary}</p></div></div>
    </div>
    <div class="layout">
      <form class="data-col" id="model-form" autocomplete="off" onsubmit="return false" aria-label="Veri girişi">
        <section class="data-head card">
          <h2>Verileriniz</h2>
          <div class="meter"><div class="meter-bar"><i id="meter-fill"></i></div><div class="meter-text"><span>Belediye verisi</span><span id="meter-label"></span></div></div>
          <p class="hint">“Örnek” etiketli alanlar henüz varsayılan değerde. Kendi kaydınızla değiştirin ya da değer doğruysa “Doğru”ya basın.</p>
        </section>
        <section class="card import-hint no-print">
          <div class="import-hint-head">${svg(P.upload)}<div><b>Elle girmek zorunda değilsiniz</b><span>Belgelerinizi yükleyin; ilgili alanlar kontrolünüzden sonra dolsun.</span></div></div>
          <ul>${(DOCS_FOR[model.id] || []).map(id => `<li>${esc((extractorById(id) || MANUAL).title)}</li>`).join('')}</ul>
          <a class="btn" href="#belgeler">${svg(P.upload)}Belge yükle</a>
        </section>
        ${groups}
        <div class="reset-row no-print"><button type="button" class="btn quiet" id="btn-reset-model">Bu yatırımın verilerini sıfırla</button></div>
      </form>
      <div class="result-col" id="results" aria-live="polite"></div>
    </div>`;

  const form = $('#model-form');
  const refresh = debounce(() => { renderResults(model); renderNav(); }, 120);
  bindFields(form, model.inputs, v, (key, field) => {
    dropSource(model.id, key, field);
    if (ownDataInputs(model).some(i => i.key === key)) { confirm(model, key); field.classList.remove('is-example'); save(); }
    updateMeter(model);
    refresh();
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-confirm]');
    if (!b) return;
    confirm(model, b.dataset.confirm);
    save();
    b.closest('.field').classList.remove('is-example');
    updateMeter(model);
    renderResults(model);
    renderNav();
  });
  $('#btn-reset-model').addEventListener('click', () => {
    if (!window.confirm(`${model.name} için girdiğiniz tüm veriler örnek değerlere döndürülsün mü?`)) return;
    state.values[model.id] = defaultValues(model.inputs);
    state.confirmed[model.id] = [];
    state.sources[model.id] = {};
    save();
    renderModelPage(model);
    renderNav();
  });

  updateMeter(model);
  renderResults(model);
}

function updateMeter(model) {
  const c = completeness(model);
  $('#meter-fill').style.width = `${c.done / c.total * 100}%`;
  $('#meter-label').innerHTML = `<b>${c.done} / ${c.total}</b> alan`;
}

function renderResults(model) {
  const box = $('#results');
  if (!box) return;
  const { res, mc } = analyse(model);
  const basis = state.basis[model.id];
  const tor = tornado(model, state.values[model.id], state.globals, basis);
  const vd = verdict(model, res, mc);
  const p = model.primary;
  const c = completeness(model);
  current = { model, res, mc, tor, basis };

  const k = outOfTen(mc[p].pPositive);
  const facts = p === 'fin'
    ? [
      ['Geri ödeme süresi', res.fin.payback != null ? F.years(res.fin.payback) : 'Ömür içinde yok', `Ekonomik ömür ${res.life} yıl`],
      ['Net kazanç (bugünkü değerle)', F.tlShort(res.fin.npv), 'Belediye bütçesi için'],
      ['Güven', `10 senaryodan ${k}`, 'Kendini ödediği senaryo sayısı'],
    ]
    : [
      ['Şehre net değer', F.tlShort(res.eco.npv), 'Bugünkü değerle, ömür boyunca'],
      ['Her 1 TL’ye fayda', res.eco.bcr != null ? `${F.num(res.eco.bcr, 2)} TL` : '—', 'Fayda / maliyet oranı'],
      ['Güven', `10 senaryodan ${k}`, 'Olumlu sonuç veren senaryo sayısı'],
    ];
  const factHtml = facts.map(([l, v, s]) => `<div class="fact"><small>${l}</small><b class="${String(v).startsWith('-') ? 'neg-text' : ''}">${v}</b><span>${s}</span></div>`).join('');
  const caution = c.done / c.total < 0.5
    ? `<p class="caution">${svg(P.alert)}<span>Sonuç şu an büyük ölçüde örnek değerlere dayanıyor (belediye verisi: ${c.done} / ${c.total} alan). Kendi verilerinizi girdikçe sonuç netleşir.</span></p>`
    : '';

  const cards = { q1: qPayback(model, res), q2: qBudget(model, res), q3: qConfidence(model, mc, basis), q4: qDrivers(model, basis, tor), q5: qCity(model, res) };
  const order = p === 'fin' ? ['q1', 'q2', 'q3', 'q4', 'q5'] : ['q1', 'q5', 'q3', 'q4', 'q2'];

  box.innerHTML = `
    <section class="answer card ${vd.level}" id="answer">
      <div class="answer-head"><span class="kicker">Kısa cevap</span>${statusChip(vd)}</div>
      <h2>${vd.title}</h2>
      <p>${vd.text}</p>
      <div class="facts">${factHtml}</div>
      ${caution}
    </section>
    ${order.map(id => cards[id]).join('')}`;

  // Ayrıntı bölümleri: açık olanlar korunur, açıldıklarında grafikleri çizilir.
  box.querySelectorAll('details[data-id]').forEach(d => {
    if (openDetails.has(d.dataset.id)) d.open = true;
    d.addEventListener('toggle', () => {
      if (d.open) { openDetails.add(d.dataset.id); drawCharts(d); } else openDetails.delete(d.dataset.id);
    });
    if (d.open) drawCharts(d);
  });
  box.querySelectorAll('[data-basis]').forEach(b => b.addEventListener('click', () => {
    state.basis[model.id] = b.dataset.basis;
    save();
    renderResults(model);
  }));

  renderDock(model, res, mc, vd);
}

function qCard(id, icon, title, body, detailsTitle, detailsBody) {
  return `<section class="q card" id="${id}">
    <div class="q-head"><span class="q-icon">${svg(icon)}</span><h3>${title}</h3></div>
    ${body}
    ${detailsBody ? `<details data-id="${id}"><summary>${detailsTitle}</summary><div>${detailsBody}</div></details>` : ''}
  </section>`;
}

function qPayback(model, res) {
  const p = model.primary;
  const s = res[p];
  const N = res.life;
  let lines;
  if (res.fin.payback != null) {
    lines = `<p class="answer-line">Basit hesapla <b>${F.years(res.fin.payback)}</b> içinde kendini öder. Paranın zaman değeri hesaba katıldığında ${res.fin.dpayback != null ? `<b>${F.years(res.fin.dpayback)}</b> sürer` : 'ömrü içinde ödemez'}.</p>`;
  } else {
    const annual = res.year1.cashNet;
    lines = `<p class="answer-line">Belediye bütçesi açısından ${N} yıllık ömrü içinde kendini ödemez${annual > 0 ? `; bunun için yaklaşık <b>${F.years(res.netInvestment / annual)}</b> gerekirdi` : ', çünkü yıllık net etkisi negatif'}.</p>`;
    if (p === 'eco' && res.eco.payback != null) lines += `<p class="answer-line">Vatandaşın zaman ve yakıt kazançları dahil şehir geneli açısından ise <b>${F.years(res.eco.payback)}</b> içinde kendini öder.</p>`;
  }
  const pb = s.payback;
  const within = pb != null && pb <= N;
  const pos = within ? Math.min(100, pb / N * 100) : 0;
  const timeline = `
    <div class="timeline" role="img" aria-label="${within ? `${F.years(pb)} içinde geri ödeme, ömür ${N} yıl` : `Ömür içinde geri ödeme yok, ömür ${N} yıl`}">
      ${within ? `<div class="fill" style="width:${pos}%"></div><span class="pin" style="left:${Math.max(8, Math.min(92, pos))}%">${F.years(pb)}</span>` : '<div class="over"></div>'}
    </div>
    <div class="timeline-scale"><span>Bugün</span><span>${p === 'eco' ? 'Şehir geneli · ' : ''}ömür sonu: ${N}. yıl</span></div>`;
  const flowsTable = res.fin.flows.map((f, t) => `<tr><td>${t}</td><td class="num">${F.tl(f)}</td><td class="num">${F.tl(res.fin.cumulative[t])}</td><td class="num">${F.tl(res.eco.flows[t])}</td><td class="num">${F.tl(res.eco.cumulative[t])}</td></tr>`).join('');
  const details = `
    <div class="legend"><span><i class="line fin"></i>Belediye bütçesi</span><span><i class="line eco"></i>Şehir geneli</span><span><i class="mark"></i>Geri ödeme noktası</span></div>
    <p class="soft" style="font-size:14px;margin-bottom:6px">Bugünkü değerle kümülatif net değer. Eğrinin sıfırı kestiği yer iskontolu geri ödeme süresidir.</p>
    <div class="chart-box" data-chart="cum"></div>
    <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Yıl</th><th class="num">Bütçe akışı</th><th class="num">Bütçe kümülatif (BD)</th><th class="num">Şehir akışı</th><th class="num">Şehir kümülatif (BD)</th></tr></thead><tbody>${flowsTable}</tbody></table></div>`;
  return qCard('q1', P.clock, 'Kendini ne zaman öder?', lines + timeline, 'Yıllara göre grafik ve tablo', details);
}

function qBudget(model, res) {
  const y = res.year1;
  const rate = state.globals.finRate;
  let body = y.cashNet >= 0
    ? `<p class="answer-line">Her yıl yaklaşık <b>${F.tlShort(y.cashNet)}</b> net tasarruf: ${F.tlShort(y.cashIn)} tasarruf veya gelir, ${F.tlShort(y.cashOut)} ek gider.</p>`
    : `<p class="answer-line">Her yıl belediyeye yaklaşık <b class="neg-text">${F.tlShort(-y.cashNet)}</b> ek yük getirir (${F.tlShort(y.cashIn)} tasarruf, ${F.tlShort(y.cashOut)} ek gider).</p>`;
  body += `<p class="answer-line soft">Ömrü boyunca bugünkü değerle net etki <b class="${res.fin.npv < 0 ? 'neg-text' : ''}">${F.tlShort(res.fin.npv)}</b>.${res.fin.irr != null ? ` Yatırımın yıllık getirisi (İVO ${F.pct(res.fin.irr * 100)}), belediyenin ${F.pct(rate)} iskonto oranından ${res.fin.irr * 100 > rate ? 'yüksek' : 'düşük'}.` : ''}</p>`;
  if (res.grant > 0) body += `<p class="answer-line soft">${F.tlShort(res.grant)} hibe sayesinde belediyenin payı ${F.tlShort(res.netInvestment)}.</p>`;
  body += `<div class="mini-facts">
    <div>Yatırım<b>${F.tlShort(res.investment)}</b></div>
    <div>Yıllık net<b class="${y.cashNet < 0 ? 'neg-text' : ''}">${F.tlShort(y.cashNet)}</b></div>
    <div>İç verim oranı<b>${res.fin.irr != null ? F.pct(res.fin.irr * 100) : '—'}</b></div>
    <div>Fayda / maliyet<b>${F.num(res.fin.bcr, 2)}</b></div>
  </div>`;
  const rows = res.lines.map(l => `<tr><td>${esc(l.label)}<br><span class="kind ${l.kind}">${KIND_LABEL[l.kind]}${l.esc ? ' · fiyat artışına bağlı' : ''}</span></td><td class="num${l.value < 0 ? ' neg-text' : ''}">${F.tl(l.value)}</td></tr>`).join('');
  const co2Row = res.co2Value > 0 ? `<tr><td>Azaltılan CO₂’nin değeri<br><span class="kind social">Toplum</span></td><td class="num">${F.tl(res.co2Value)}</td></tr>` : '';
  const details = `
    <div class="legend"><span><i class="pos"></i>Tasarruf / gelir</span><span><i class="neg"></i>Ek gider</span></div>
    <div class="chart-box" data-chart="lines"></div>
    <div class="table-wrap" style="margin-top:12px"><table>
      <tbody>${rows}${co2Row}</tbody>
      <tfoot><tr><td>Belediye bütçesine net etki</td><td class="num">${F.tl(y.cashNet)}</td></tr><tr><td>Şehir geneline net etki</td><td class="num">${F.tl(y.ecoNet)}</td></tr></tfoot>
    </table></div>`;
  return qCard('q2', P.wallet, 'Belediye bütçesine ne kazandırır?', body, 'Kalem kalem döküm', details);
}

function qConfidence(model, mc, basis) {
  const sim = mc[basis];
  const k = outOfTen(sim.pPositive);
  const dots = Array.from({ length: 10 }, (_, i) => `<i class="${i < k ? 'on' : 'off'}"></i>`).join('');
  const body = `
    <p class="answer-line">Tasarruf oranları, fiyatlar ve maliyetler makul aralıklarda değiştirildiğinde <b>10 senaryodan ${LOC[k]}</b> yatırım ${WHO[basis]} açısından kendini öder.</p>
    <div class="dots" role="img" aria-label="10 senaryodan ${k} olumlu">${dots}</div>
    <div class="dots-key"><span><i class="on"></i>Kendini öder</span><span><i class="off"></i>Ödemez</span></div>
    <p class="answer-line soft" style="margin-top:12px">Büyük olasılıkla (10 senaryodan 8’inde) net değer <b>${F.tlShort(sim.p10)}</b> ile <b>${F.tlShort(sim.p90)}</b> arasında olur.</p>`;
  const seg = `<div class="seg" role="group" aria-label="Bakış açısı">${['fin', 'eco'].map(b => `<button type="button" data-basis="${b}" aria-pressed="${b === basis}">${b === 'fin' ? 'Belediye bütçesi' : 'Şehir geneli'}</button>`).join('')}</div>`;
  const details = `${seg}
    <p class="soft" style="font-size:14px">${F.num(mc.runs, 0)} simülasyonda net bugünkü değerin dağılımı. Varsayımlar kaynaklardaki aralıkta, yatırım maliyeti −%5 ile +%30 arasında değiştirildi.</p>
    <div class="legend"><span><i class="pos"></i>Kendini öder</span><span><i class="neg"></i>Ödemez</span><span><i class="ref"></i>Sıfır çizgisi</span></div>
    <div class="chart-box" data-chart="hist"></div>`;
  return qCard('q3', P.shield, 'Bu sonuçtan ne kadar emin olabiliriz?', body, 'Dağılım grafiği ve bakış açısı', details);
}

function qDrivers(model, basis, tor) {
  const notes = driverNotes(model, basis, tor);
  const body = `<ul class="drivers">${notes.map(n => `<li>${svg(P.bulb)}<span>${n}</span></li>`).join('')}</ul>`;
  const details = `
    <p class="soft" style="font-size:14px">Her varsayım tek tek kaynaklardaki aralığın alt ve üst ucuna çekildiğinde ${WHO[basis]} için net değer. Gri çizgi şu anki sonuç (${F.tlShort(tor.base)}).</p>
    <div class="legend"><span><i class="pos"></i>Sonucu iyileştirir</span><span><i class="neg"></i>Sonucu kötüleştirir</span></div>
    <div class="chart-box" data-chart="tornado"></div>`;
  return qCard('q4', P.sliders, 'Sonucu en çok ne değiştirir?', body, 'Duyarlılık grafiği', details);
}

function qCity(model, res) {
  const body = `
    <p class="answer-line">Vatandaşın ve kamunun kazançları dahil şehre bugünkü değerle <b class="${res.eco.npv < 0 ? 'neg-text' : ''}">${F.tlShort(res.eco.npv)}</b> net değer${res.eco.bcr != null ? `; her 1 TL maliyete karşılık <b>${F.num(res.eco.bcr, 2)} TL</b> fayda` : ''}.</p>
    <p class="answer-line soft">Yılda yaklaşık <b>${F.num(res.co2, 0)} ton</b> CO₂ salımı önlenir; ömür boyunca ${F.num(res.co2 * res.life, 0)} ton.</p>
    <dl class="phys">${res.physical.map(x => `<div><dt>${esc(x.label)}</dt><dd>${F.unitValue(x.value, x.unit)}</dd></div>`).join('')}</dl>`;
  return qCard('q5', P.leaf, 'Şehre ve çevreye etkisi ne?', body);
}

// Yalnızca açık ayrıntı bölümlerindeki grafikler çizilir (kapalı bölümün genişliği 0'dır).
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
      const markers = d != null && d > 0 ? [{ t: d, value: 0, label: `Geri ödeme · ${F.years(d)}` }] : [];
      box.innerHTML = lineChart({
        width: w(box), height: 260, markers, fmt: fmtTL,
        series: [{ name: 'Belediye bütçesi', cls: 'fin', values: res.fin.cumulative }, { name: 'Şehir geneli', cls: 'eco', values: res.eco.cumulative }],
      });
    } else if (kind === 'hist') {
      box.innerHTML = histogram({ width: w(box), samples: mc[basis].samples, fmt: fmtTL });
    } else if (kind === 'tornado') {
      const tip = (r, x, npv) => `<div class="tip-title">${esc(r.param.label)}</div><div class="tip-row"><span class="key ${npv >= tor.base ? 'pos' : 'neg'}"></span>${paramValueText(r.param, x)} olursa<b>${F.tlShort(npv)}</b></div>`;
      box.innerHTML = hbarChart({
        width: w(box), fmt: fmtTL, refLines: [{ value: tor.base, cls: 'base' }, { value: 0 }],
        rows: tor.rows.map(r => ({
          label: `${r.param.label} (${paramValueText(r.param, r.lo)} … ${paramValueText(r.param, r.hi)})`,
          bars: [
            { from: tor.base, to: r.loNpv, cls: r.loNpv >= tor.base ? 'pos' : 'neg', tip: tip(r, r.lo, r.loNpv) },
            { from: tor.base, to: r.hiNpv, cls: r.hiNpv >= tor.base ? 'pos' : 'neg', tip: tip(r, r.hi, r.hiNpv) },
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

// Mobilde kısa cevap kartı ekrandan çıkınca altta küçük bir özet görünür.
function renderDock(model, res, mc, vd) {
  const dock = $('#answer-dock');
  dock.innerHTML = `<span class="ad-dot" style="background:${STATUS_COLOR[vd.level]}"></span>
    <div class="ad-text"><b>${vd.label}</b>${shortAnswer(model, res)} · güven 10’da ${outOfTen(mc[model.primary].pPositive)}</div>
    <button type="button" class="btn" data-scroll-answer>Cevap ↑</button>`;
  answerObserver?.disconnect();
  answerObserver = new IntersectionObserver(([entry]) => { dock.hidden = entry.isIntersecting || entry.boundingClientRect.top > 0; });
  answerObserver.observe($('#answer'));
}

// ---------- Belge yükleme ----------
// Hibrit veri girişi: alanlar elle girilebilir ya da belgeler yüklenip önerilen değerler onaylanır.
// Dosyalar yalnızca tarayıcıda okunur; içerikleri kaydedilmez, yalnızca uygulanan değerin kaynağı saklanır.

const ACCEPT = '.xlsx,.xls,.ods,.csv,.txt,.xml,.htm,.html';

// Belgeden hesaplanan değerler anlamlı basamağa yuvarlanır (ör. 152,17 W → 152,2 W).
function tidy(input, v) {
  if (input.step === 1) return Math.round(v);
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return Math.round(v * 10 ** d) / 10 ** d;
}
const valueText = (input, v) => (input.unit === '%' ? F.pct(v, 1) : `${F.inputNum(tidy(input, v))} ${input.unit}`);
const TARGET_NAME = Object.fromEntries(TARGETS.map(t => [t.id, t.name]));
const session = { items: [], seq: 0, applied: null, busy: false };

function computeItem(item) {
  item.error = null;
  try {
    if (item.type === 'elle') item.result = manualResult(item);
    else item.result = extractorById(item.type).extract(item.files, item.opts, { values: state.values });
  } catch (e) {
    item.result = { summary: '', proposals: [], warnings: [], options: [] };
    item.error = `Belge işlenemedi: ${e.message}`;
  }
  item.selected = new Map(item.result.proposals.map(p => [`${p.model}.${p.key}`, check(p).level !== 'error']));
}

function manualResult(item) {
  const m = item.manual;
  const sheet = item.files[0].sheets[m.sheet];
  const proposals = [];
  for (const map of m.maps) {
    if (!map.target || map.col == null) continue;
    const [model, key] = map.target.split('.');
    const value = applyOperation(sheet, m.header, Number(map.col), map.op);
    const colName = columnsOf(sheet, m.header).find(([i]) => i === Number(map.col))?.[1] ?? '';
    if (value != null) proposals.push({ model, key, value, where: `${sheet.name} · “${colName}” · ${OPERATIONS.find(o => o[0] === map.op)[1].toLowerCase()}` });
  }
  return { summary: `${sheet.name} · başlık ${m.header + 1}. satır`, proposals, warnings: [], options: [] };
}

async function addFiles(fileList) {
  session.busy = true;
  session.applied = null;
  renderImport();
  for (const f of fileList) {
    let file;
    try {
      file = await readFile(f.name, await f.arrayBuffer());
    } catch (e) {
      session.items.push({ id: ++session.seq, files: [{ name: f.name }], type: null, error: e instanceof ReadError ? e.message : `“${f.name}” okunamadı: ${e.message}`, result: null });
      continue;
    }
    const type = detectType(file);
    const group = extractorById(type)?.group ? session.items.find(it => it.type === type) : null;
    if (group) {
      group.files.push(file);
      computeItem(group);
      continue;
    }
    const item = { id: ++session.seq, files: [file], type, opts: {}, manual: null };
    if (type === 'elle') initManual(item);
    computeItem(item);
    session.items.push(item);
  }
  session.busy = false;
  renderImport();
}

function initManual(item) {
  const sheets = item.files[0].sheets;
  const si = Math.max(0, sheets.findIndex(s => s.rows.length));
  item.manual = { sheet: si, header: guessHeader(sheets[si]?.rows || []), maps: [{ target: '', col: null, op: 'sum' }] };
}

function optionHtml(item, o) {
  const name = `opt-${item.id}-${o.id}`;
  let control;
  if (o.type === 'checkbox') control = `<label class="check"><input type="checkbox" id="${name}" data-item="${item.id}" data-opt="${o.id}" ${o.value ? 'checked' : ''}>${esc(o.label)}</label>`;
  else if (o.type === 'select') control = `<label for="${name}">${esc(o.label)}</label><select id="${name}" data-item="${item.id}" data-opt="${o.id}">${o.choices.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(o.value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else control = `<span class="opt-label">${esc(o.label)}</span><div class="multi">${o.choices.map(([v, l], k) => `<label class="check"><input type="checkbox" id="${name}-${k}" data-item="${item.id}" data-multi="${o.id}" value="${esc(v)}" ${o.value.includes(v) ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>`;
  return `<div class="opt">${control}${o.help ? `<p class="opt-help">${esc(o.help)}</p>` : ''}</div>`;
}

function manualHtml(item) {
  const m = item.manual;
  const file = item.files[0];
  const sheet = file.sheets[m.sheet];
  if (!sheet) return '<p class="soft">Dosyada tablo bulunamadı.</p>';
  const cols = columnsOf(sheet, m.header);
  const preview = sheet.rows.slice(m.header, m.header + 6).map((r, k) => `<tr>${cols.map(([i]) => `<${k ? 'td' : 'th'}>${esc(r?.[i]?.v instanceof Date ? r[i].v.toLocaleDateString('tr-TR') : r?.[i]?.v ?? '')}</${k ? 'td' : 'th'}>`).join('')}</tr>`).join('');
  const targets = TARGETS.map(t => `<optgroup label="${esc(t.name)}">${t.inputs.map(i => `<option value="${t.id}.${i.key}">${esc(i.label)} (${esc(i.unit)})</option>`).join('')}</optgroup>`).join('');
  const maps = m.maps.map((map, k) => {
    const value = map.target && map.col != null ? applyOperation(sheet, m.header, Number(map.col), map.op) : null;
    return `<div class="map-row">
      <select data-item="${item.id}" data-map="${k}" data-field="target" aria-label="Hedef alan"><option value="">Hedef alan seçin…</option>${targets.replace(`value="${map.target}"`, `value="${map.target}" selected`)}</select>
      <select data-item="${item.id}" data-map="${k}" data-field="col" aria-label="Sütun"><option value="">Sütun…</option>${cols.map(([i, l]) => `<option value="${i}" ${Number(map.col) === i && map.col != null ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select data-item="${item.id}" data-map="${k}" data-field="op" aria-label="İşlem">${OPERATIONS.map(([v, l]) => `<option value="${v}" ${map.op === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="map-value tnum">${value != null ? F.inputNum(Math.round(value * 1000) / 1000) : '—'}</span>
      <button type="button" class="tool" data-item="${item.id}" data-unmap="${k}" aria-label="Eşleştirmeyi sil">✕</button>
    </div>`;
  }).join('');
  return `
    <div class="manual">
      <div class="opt-grid">
        ${file.sheets.length > 1 ? `<div class="opt"><label for="ms-${item.id}">Sayfa</label><select id="ms-${item.id}" data-item="${item.id}" data-manual="sheet">${file.sheets.map((s, i) => `<option value="${i}" ${i === m.sheet ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
        <div class="opt"><label for="mh-${item.id}">Başlık satırı</label><input id="mh-${item.id}" type="number" min="1" max="${sheet.rows.length}" value="${m.header + 1}" data-item="${item.id}" data-manual="header"></div>
      </div>
      <div class="table-wrap preview"><table>${preview}</table></div>
      <p class="soft">Her satırda hangi sütundan hangi alanın hesaplanacağını seçin. Altındaki “Toplam” satırları otomatik ayıklanır.</p>
      ${maps}
      <button type="button" class="btn quiet" data-item="${item.id}" data-addmap>+ Eşleştirme ekle</button>
    </div>`;
}

function itemHtml(item) {
  const names = item.files.map(f => f.name);
  const title = names.length > 1 ? `${names.length} dosya` : names[0];
  if (!item.type) {
    return `<section class="card import-item error-item"><div class="ii-head">${svg(P.alert)}<div><b>${esc(title)}</b><span class="neg-text">${esc(item.error)}</span></div><button type="button" class="tool" data-remove="${item.id}" aria-label="Kaldır">✕</button></div></section>`;
  }
  const r = item.result;
  const typeSelect = `<select id="type-${item.id}" data-item="${item.id}" data-type aria-label="Belge türü">${[...EXTRACTORS, MANUAL].filter(x => !x.group || x.id === item.type).map(x => `<option value="${x.id}" ${x.id === item.type ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>`;
  const props = r.proposals.map(p => {
    const c = check(p);
    const input = inputOf(p.model, p.key);
    return `<li class="${c.level}"><span>${esc(TARGET_NAME[p.model])} · ${esc(input.label)}</span><b class="tnum">${valueText(input, p.value)}</b></li>`;
  }).join('');
  return `<section class="card import-item">
    <div class="ii-head">${svg(P.doc)}<div><b title="${esc(names.join(', '))}">${esc(title)}</b><span>${esc(item.files[0].format)}${names.length > 1 ? ` · ${esc(names.slice(0, 3).join(', '))}${names.length > 3 ? '…' : ''}` : ''}</span></div><button type="button" class="tool" data-remove="${item.id}" aria-label="Kaldır">✕</button></div>
    <div class="opt"><label for="type-${item.id}">Belge türü</label>${typeSelect}</div>
    ${item.error ? `<p class="caution">${svg(P.alert)}<span>${esc(item.error)}</span></p>` : ''}
    ${item.type === 'elle' ? manualHtml(item) : `
      ${r.summary ? `<p class="ii-summary">${esc(r.summary)}</p>` : ''}
      ${r.options.length ? `<div class="opt-grid">${r.options.map(o => optionHtml(item, o)).join('')}</div>` : ''}
      ${props ? `<ul class="ii-props">${props}</ul>` : '<p class="soft">Bu belgeden değer çıkarılamadı. Belge türünü değiştirmeyi ya da “Diğer tablolar” ile sütunları kendiniz eşleştirmeyi deneyin.</p>'}`}
    ${r.warnings.length ? `<ul class="ii-warn">${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function reviewHtml() {
  const rows = [];
  const seen = new Map();
  // Aynı alan için birden çok öneri varsa son yüklenen belge öncelikli; diğerleri çakışma olarak gösterilir.
  for (const item of [...session.items].reverse()) {
    if (!item.result) continue;
    for (const p of item.result.proposals) {
      const k = `${p.model}.${p.key}`;
      rows.push({ item, p, dup: seen.has(k) });
      seen.set(k, true);
    }
  }
  if (!rows.length) return '';
  rows.reverse();
  let count = 0;
  const body = rows.map(({ item, p, dup }) => {
    const input = inputOf(p.model, p.key);
    const c = check(p);
    const cur = p.model === 'genel' ? state.globals[p.key] : state.values[p.model][p.key];
    const on = !dup && item.selected.get(`${p.model}.${p.key}`) && c.level !== 'error';
    if (on) count++;
    const status = c.level === 'error' ? `<span class="neg-text">${esc(c.message)}</span>` : dup ? 'Başka belgede de var' : c.level === 'warn' ? `<span class="warn-text">${esc(c.message)}</span>` : 'Uygun';
    return `<tr class="${dup ? 'dup' : ''}">
      <td><input type="checkbox" aria-label="${esc(input.label)} uygulansın" data-item="${item.id}" data-pick="${p.model}.${p.key}" ${on ? 'checked' : ''} ${c.level === 'error' || dup ? 'disabled' : ''}></td>
      <td><b>${esc(input.label)}</b><br><span class="soft">${esc(TARGET_NAME[p.model])}</span></td>
      <td class="num" data-label="Şu anki">${valueText(input, cur)}</td>
      <td class="num" data-label="Belgeden"><b>${valueText(input, p.value)}</b></td>
      <td data-label="Kaynak"><span class="soft">${esc(item.files.map(f => f.name).join(', ').slice(0, 80))}<br>${esc(p.where)}${p.note ? ` · ${esc(p.note)}` : ''}</span></td>
      <td data-label="Durum">${status}</td>
    </tr>`;
  }).join('');
  return `<section class="card pad review">
    <h2>Uygulamadan önce kontrol edin</h2>
    <p class="soft">İşaretli değerler ilgili alanlara yazılır ve alanın altında hangi belgeden geldiği gösterilir. Uygulanan değerleri daha sonra elle de değiştirebilirsiniz.</p>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>Alan</th><th class="num">Şu anki</th><th class="num">Belgeden</th><th>Kaynak</th><th>Durum</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="review-foot"><button type="button" class="btn primary" id="btn-apply" ${count ? '' : 'disabled'}>${svg(STATUS_ICON.good.match(/d="([^"]+)"/)[1])}Seçilen ${count} değeri uygula</button></div>
  </section>`;
}

function applySelected() {
  const applied = [];
  const at = new Date().toISOString().slice(0, 10);
  const done = new Set();
  for (const item of [...session.items].reverse()) {
    if (!item.result) continue;
    for (const p of item.result.proposals) {
      const k = `${p.model}.${p.key}`;
      if (done.has(k)) continue;
      done.add(k);
      if (!item.selected.get(k) || check(p).level === 'error') continue;
      const input = inputOf(p.model, p.key);
      const value = tidy(input, p.value);
      if (p.model === 'genel') state.globals[p.key] = value;
      else {
        state.values[p.model][p.key] = value;
        if (!state.confirmed[p.model].includes(p.key)) state.confirmed[p.model].push(p.key);
      }
      state.sources[p.model][p.key] = { file: item.files.map(f => f.name).join(', ').slice(0, 300), where: p.where + (p.note ? ` · ${p.note}` : ''), at };
      applied.push({ model: p.model, label: input.label, value, unit: input.unit, step: input.step });
    }
  }
  save();
  session.items = [];
  session.applied = applied;
  renderImport();
  renderNav();
  window.scrollTo({ top: 0, behavior: smooth() });
}

function downloadTemplate(prefill) {
  const bytes = buildTemplate((m, k) => {
    if (!prefill) return null;
    if (m === 'genel') return state.globals[k];
    const model = modelById(m);
    return isFilled(model, k) ? state.values[m][k] : null;
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = prefill ? 'akilli-sehir-verileri.xlsx' : 'akilli-sehir-veri-sablonu.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function renderImport() {
  const docs = [...EXTRACTORS, MANUAL].map(x => `<article class="doc card">
    <h3>${esc(x.title)}</h3>
    <dl>
      <div><dt>Doldurduğu alanlar</dt><dd>${esc(x.fills)}</dd></div>
      <div><dt>Dosya biçimi</dt><dd>${esc(x.formats)}</dd></div>
      <div><dt>Nereden alınır</dt><dd>${esc(x.source)}</dd></div>
    </dl>
    <p class="doc-variants-title">Desteklenen yazım biçimleri</p>
    <ul>${x.variants.map(v => `<li>${esc(v)}</li>`).join('')}</ul>
  </article>`).join('');

  const appliedHtml = session.applied ? `<section class="card pad applied" role="status">
    <h2>${session.applied.length} değer uygulandı</h2>
    <ul>${session.applied.map(a => `<li><span>${esc(TARGET_NAME[a.model])} · ${esc(a.label)}</span><b class="tnum">${valueText(a, a.value)}</b></li>`).join('')}</ul>
    <div class="applied-links">${[...new Set(session.applied.map(a => a.model))].filter(m => m !== 'genel').map(m => `<a class="btn" href="#${m}">${esc(TARGET_NAME[m])} sonucunu gör →</a>`).join('')}</div>
  </section>` : '';

  $('#view').innerHTML = `
    <div class="intro">
      <p class="kicker">Belgeden doldur</p>
      <h1>Belgelerinizi yükleyin</h1>
      <p>Alanları elle girmek yerine belediyenizin elindeki dosyaları yükleyebilirsiniz. Araç belge türünü tanır, ilgili değerleri hesaplar ve uygulamadan önce size gösterir. İki yolu birlikte de kullanabilirsiniz: belgede olmayan alanları elle tamamlayın.</p>
    </div>
    ${appliedHtml}
    <section class="card pad upload">
      <label class="dropzone" id="dropzone" for="import-files">
        ${svg(P.upload)}
        <b>${session.busy ? 'Dosyalar okunuyor…' : 'Dosyaları buraya bırakın ya da seçin'}</b>
        <span>Excel (.xlsx, .xls), LibreOffice (.ods), CSV veya e-Fatura XML · birden çok dosya seçilebilir</span>
        <input id="import-files" type="file" multiple accept="${ACCEPT}" class="sr-only">
      </label>
      <p class="privacy">${svg(P.shield)}<span>Dosyalar bu bilgisayarda, tarayıcının içinde okunur; hiçbir sunucuya gönderilmez ve saklanmaz. Yalnızca uyguladığınız değerin hangi dosyadan geldiği not edilir.</span></p>
      <div class="template-row">
        <div><b>Belgeleriniz farklı biçimdeyse</b><span>Veri şablonunu indirip ilgili birimlere doldurtun; her alanın nereden bulunacağı şablonda yazar.</span></div>
        <div class="template-actions"><button type="button" class="btn" data-template="empty">${svg(P.doc)}Boş şablon (.xlsx)</button><button type="button" class="btn quiet" data-template="filled">Girili değerlerle şablon</button></div>
      </div>
    </section>
    ${session.items.length ? `<div class="import-items">${session.items.map(itemHtml).join('')}</div>` : ''}
    ${reviewHtml()}
    <h2 class="section-title" style="margin-top:32px">Desteklenen belgeler</h2>
    <p class="section-sub">Belediyeler aynı veriyi farklı biçimlerde tutabiliyor; her belge türünün yaygın yazım biçimleri ayrı ayrı tanınır. Tanınmayan tablolar için “Diğer tablolar” ile sütunları kendiniz eşleştirebilirsiniz. Eski ikili .xls dosyalarını Excel’de “Farklı Kaydet → .xlsx” ile, PDF’leri ise Excel dökümüyle değiştirin.</p>
    <div class="doc-grid">${docs}</div>`;

  bindImport();
}

function bindImport() {
  const input = $('#import-files');
  input.addEventListener('change', () => { if (input.files.length) addFiles([...input.files]); });
  const dz = $('#dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });

}

// Belge sayfasındaki seçimler #view üzerinden bir kez dinlenir (sayfa her çizimde yeniden kurulur).
function setupImportEvents() {
  const view = $('#view');
  const itemOf = el => session.items.find(it => it.id === Number(el.dataset.item));
  view.addEventListener('change', e => {
    if (currentPage !== 'belgeler') return;
    const el = e.target;
    const item = el.dataset.item && itemOf(el);
    if (el.dataset.pick && item) { item.selected.set(el.dataset.pick, el.checked); renderImport(); return; }
    if (!item) return;
    if (el.hasAttribute('data-type')) {
      item.type = el.value;
      item.opts = {};
      if (item.type === 'elle' && !item.manual) initManual(item);
    } else if (el.dataset.opt) {
      item.opts[el.dataset.opt] = el.type === 'checkbox' ? el.checked : el.value;
    } else if (el.dataset.multi) {
      item.opts[el.dataset.multi] = [...view.querySelectorAll(`[data-item="${item.id}"][data-multi="${el.dataset.multi}"]:checked`)].map(x => x.value);
    } else if (el.dataset.manual === 'sheet') {
      item.manual.sheet = Number(el.value);
      item.manual.header = guessHeader(item.files[0].sheets[item.manual.sheet].rows);
      item.manual.maps = [{ target: '', col: null, op: 'sum' }];
    } else if (el.dataset.manual === 'header') {
      item.manual.header = Math.max(0, Number(el.value) - 1);
    } else if (el.dataset.map != null) {
      const map = item.manual.maps[Number(el.dataset.map)];
      map[el.dataset.field] = el.dataset.field === 'col' ? (el.value === '' ? null : Number(el.value)) : el.value;
    } else return;
    computeItem(item);
    renderImport();
  });
  view.addEventListener('click', e => {
    if (currentPage !== 'belgeler') return;
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.remove) { session.items = session.items.filter(it => it.id !== Number(t.dataset.remove)); renderImport(); }
    else if (t.hasAttribute('data-addmap')) { itemOf(t).manual.maps.push({ target: '', col: null, op: 'sum' }); renderImport(); }
    else if (t.dataset.unmap != null) { const it = itemOf(t); it.manual.maps.splice(Number(t.dataset.unmap), 1); computeItem(it); renderImport(); }
    else if (t.dataset.template) downloadTemplate(t.dataset.template === 'filled');
    else if (t.id === 'btn-apply') applySelected();
  });
}

// ---------- Karşılaştırma ----------

function renderCompare() {
  const rows = MODELS.map(m => ({ m, ...analyse(m) }));
  const inc = rows.filter(r => state.include[r.m.id]);
  const sum = f => inc.reduce((s, r) => s + f(r), 0);
  const pi = r => r.res.eco.npv / r.res.investment;
  const ranked = [...inc].sort((a, b) => pi(b) - pi(a));
  const excluded = rows.filter(r => !state.include[r.m.id]);

  const item = (r, no) => {
    const { m, res, mc } = r;
    const vd = verdict(m, res, mc);
    const fi = res.fin.npv / Math.max(res.netInvestment, 1);
    const pay = res.fin.payback != null ? `Belediye bütçesine ${F.years(res.fin.payback)} içinde geri döner.` : 'Belediye bütçesine ömrü içinde geri dönmez.';
    const per = (x, whom) => (x >= 0 ? `${whom} <b>${F.num(x, 2)} TL</b> net değer kazandırır` : `${whom} <b>${F.num(-x, 2)} TL</b> net yük getirir`);
    return `<li class="rank-item card${state.include[m.id] ? '' : ' off'}">
      <span class="rank-no">${no ?? '–'}</span>
      <div>
        <h3><a href="#${m.id}" style="color:inherit;text-decoration:none">${m.name}</a> ${statusChip(vd)}</h3>
        <p>Yatırılan her 1 TL, ${per(pi(r), 'şehre')}; ${per(fi, 'belediye bütçesine')}. ${pay} Yatırım: ${F.tlShort(res.investment)}.</p>
      </div>
      <label class="toggle no-print"><input type="checkbox" data-include="${m.id}" ${state.include[m.id] ? 'checked' : ''}>Planda</label>
    </li>`;
  };

  const table = rows.map(({ m, res, mc }) => `<tr>
      <td><a href="#${m.id}">${m.name}</a></td>
      <td class="num">${F.tlShort(res.investment)}</td>
      <td class="num${res.year1.cashNet < 0 ? ' neg-text' : ''}">${F.tlShort(res.year1.cashNet)}</td>
      <td class="num">${res.fin.payback != null ? F.years(res.fin.payback) : '—'}</td>
      <td class="num${res.fin.npv < 0 ? ' neg-text' : ''}">${F.tlShort(res.fin.npv)}</td>
      <td class="num">${res.fin.irr != null ? F.pct(res.fin.irr * 100) : '—'}</td>
      <td class="num">10’da ${outOfTen(mc.fin.pPositive)}</td>
      <td class="num${res.eco.npv < 0 ? ' neg-text' : ''}">${F.tlShort(res.eco.npv)}</td>
      <td class="num">${F.num(res.eco.bcr, 2)}</td>
      <td class="num">${F.num(res.co2, 0)}</td>
    </tr>`).join('');

  const fact = (label, value, sub) => `<div class="fact"><small>${label}</small><b class="${value.startsWith('-') ? 'neg-text' : ''}">${value}</b><span>${sub}</span></div>`;
  $('#view').innerHTML = `
    ${printMeta()}
    <div class="intro">
      <p class="kicker">Karşılaştırma</p>
      <h1>Hangi yatırım önce yapılmalı?</h1>
      <p>Bütçe sınırlıyken en çok değeri yaratan yatırım öne alınır. Sıralama, yatırılan her 1 TL’nin şehre kazandırdığı net değere göredir. “Planda” kutusuyla yatırımları plana ekleyip çıkarabilirsiniz.</p>
    </div>
    <div class="summary-strip">
      ${fact('Plandaki toplam yatırım', F.tlShort(sum(r => r.res.investment)), `${inc.length} yatırım`)}
      ${fact('Bütçeye yıllık net etki', F.tlShort(sum(r => r.res.year1.cashNet)), '1. yıl')}
      ${fact('Bütçeye net kazanç', F.tlShort(sum(r => r.res.fin.npv)), 'Bugünkü değerle')}
      ${fact('Şehre net değer', F.tlShort(sum(r => r.res.eco.npv)), 'Bugünkü değerle')}
    </div>
    <ol class="rank-list">${ranked.map((r, i) => item(r, i + 1)).join('')}${excluded.map(r => item(r, null)).join('')}</ol>
    <section class="card pad">
      <h2 style="font-size:19px">Net değer karşılaştırması</h2>
      <p class="soft" style="color:var(--text-2);font-size:14.5px;margin:4px 0 10px">Belediye bütçesi ve şehir geneli için, bugünkü değerle.</p>
      <div class="legend"><span><i class="fin"></i>Belediye bütçesi</span><span><i class="eco"></i>Şehir geneli</span><span><i class="ref"></i>Sıfır çizgisi</span></div>
      <div class="chart-box" id="chart-compare"></div>
      <details style="margin-top:14px"><summary style="cursor:pointer;color:var(--primary);font-weight:600">Ayrıntılı tablo</summary>
        <div class="table-wrap" style="margin-top:10px"><table>
          <thead><tr><th>Yatırım</th><th class="num">Yatırım</th><th class="num">Yıllık net</th><th class="num">Geri ödeme</th><th class="num">Bütçe NBD</th><th class="num">İVO</th><th class="num">Güven (bütçe)</th><th class="num">Şehir NBD</th><th class="num">Fayda/maliyet</th><th class="num">CO₂ ton/yıl</th></tr></thead>
          <tbody>${table}</tbody>
        </table></div>
      </details>
    </section>`;

  $('#view').querySelectorAll('[data-include]').forEach(cb => cb.addEventListener('change', () => {
    state.include[cb.dataset.include] = cb.checked;
    save();
    renderCompare();
  }));

  const box = $('#chart-compare');
  box.innerHTML = hbarChart({
    width: Math.max(260, box.clientWidth), fmt: fmtTL, refLines: [{ value: 0 }], barH: 18,
    rows: rows.map(({ m, res }) => ({
      label: m.name,
      bars: [
        { from: 0, to: res.fin.npv, cls: 'fin', tip: `<div class="tip-title">${m.name}</div><div class="tip-row"><span class="key fin"></span>Belediye bütçesi<b>${F.tlShort(res.fin.npv)}</b></div>` },
        { from: 0, to: res.eco.npv, cls: 'eco', tip: `<div class="tip-title">${m.name}</div><div class="tip-row"><span class="key eco"></span>Şehir geneli<b>${F.tlShort(res.eco.npv)}</b></div>` },
      ],
    })),
  });
}

// ---------- Yöntem ----------

function renderMethod(anchor) {
  $('#view').innerHTML = $('#tpl-yontem').innerHTML;
  $('#view .prose').classList.add('card');
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
  else if (currentPage === 'baslangic') renderStart();
  else if (currentPage === 'belgeler') renderImport();
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
  const refreshGlobals = debounce(rerenderCurrent, 150);
  bindFields(fields, GLOBAL_INPUTS, state.globals, (key, field) => { dropSource('genel', key, field); refreshGlobals(); });
  $('#g-municipality').addEventListener('input', e => { state.municipality = e.target.value.slice(0, 120); save(); renderNav(); });
  $('#g-preparer').addEventListener('input', e => { state.preparer = e.target.value.slice(0, 120); save(); });
  $('#btn-reset-all').addEventListener('click', () => {
    if (!window.confirm('Tüm yatırımların ve genel ayarların girdileri örnek değerlere döndürülsün mü?')) return;
    const fresh = freshState();
    Object.assign(state.globals, fresh.globals);
    for (const m of MODELS) { Object.assign(state.values[m.id], fresh.values[m.id]); state.confirmed[m.id] = []; }
    for (const t of TARGETS) state.sources[t.id] = {};
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
    Object.assign(state.confirmed, loaded.confirmed);
    Object.assign(state.sources, loaded.sources);
    state.municipality = loaded.municipality;
    state.preparer = loaded.preparer;
    save();
    route();
  } catch {
    alert('Dosya okunamadı. Lütfen bu araçla kaydedilmiş bir .json dosyası seçin.');
  }
}

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch { /* yok say */ }
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
    if (e.target.closest('[data-scroll-answer]')) $('#answer')?.scrollIntoView({ behavior: smooth(), block: 'start' });
  });
  document.querySelectorAll('input[data-action="load"]').forEach(inp => inp.addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) loadFile(file);
  }));

  // Yazdırırken tüm ayrıntı bölümleri açılır ve grafikler sayfa genişliğinde çizilir.
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('#view details').forEach(d => { d.dataset.wasOpen = d.open; d.open = true; });
    document.querySelectorAll('#results details').forEach(d => drawCharts(d, PRINT_WIDTH));
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll('#view details').forEach(d => { if (d.dataset.wasOpen === 'false') d.open = false; });
    rerenderCurrent();
  });
}

// ---------- Başlat ----------

setupActions(setupSettings());
setupImportEvents();
installTooltips();
window.addEventListener('hashchange', route);
let lastWidth = window.innerWidth;
window.addEventListener('resize', debounce(() => {
  if (window.innerWidth === lastWidth) return; // mobilde adres çubuğu kaymasıyla gelen yükseklik değişimlerini yok say
  lastWidth = window.innerWidth;
  if (modelById(currentPage)) document.querySelectorAll('#results details[open]').forEach(d => drawCharts(d));
  else if (currentPage === 'karsilastirma') renderCompare();
}, 200));
route();
