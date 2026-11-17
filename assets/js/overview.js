// Genel bakışın görsel anlatımı. Bütün sayısal değerler mevcut hesap motorundan gelir.
import * as F from './format.js';

const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
const down = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6"/></svg>';
const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const sectors = {
  aydinlatma: { name: 'Aydınlatma', tag: 'ENERJİNİN DAHA İYİ BİR YOLU VAR', title: 'Sokaklar aydınlansın.\nEnerji boşa gitmesin.', copy: 'LED dönüşümü ve akıllı kontrolle enerjiyi gerçekten ihtiyaç duyulan yerde kullanın.', photo: 'lights', x: 76, y: 32, label: 'Tüketimde azalma', physical: 'Toplam tüketimde azalma' },
  su: { name: 'Su yönetimi', tag: 'HER DAMLA BİR GELECEK', title: 'Kaybolan suyu görün.\nŞehrin kaynağını koruyun.', copy: 'Şebekedeki kayıpları görünür kılın. Basınç yönetimi ve akıllı sayaçların etkisini ölçün.', photo: 'water', x: 57, y: 63, label: 'Önlenen su kaybı / yıl', physical: 'Önlenen fiziki kayıp' },
  atik: { name: 'Atık toplama', tag: 'DAHA TEMİZ BİR BAŞLANGIÇ', title: 'Daha akıllı rotalar.\nDaha temiz sokaklar.', copy: 'Doluluk verisiyle gereksiz yolculukları azaltın; yakıtı, zamanı ve bütçeyi koruyun.', photo: 'waste', x: 87, y: 58, label: 'Önlenen mesafe / yıl', physical: 'Önlenen mesafe' },
  trafik: { name: 'Trafik', tag: 'ŞEHRİN ZAMANINI GERİ KAZANIN', title: 'Trafik aksın.\nŞehir nefes alsın.', copy: 'Akıllı kavşaklarla beklemeyi azaltın; insanların zamanına ve şehrin havasına değer katın.', photo: 'traffic', x: 63, y: 24, label: 'Kazanılan kişi-saat / yıl', physical: 'Yıllık kazanılan kişi-saat' },
};
const compact = (v, unit) => {
  if (unit === '%') return F.pct(v, 0);
  if (Math.abs(v) >= 1e6) return `${F.num(v / 1e6, 2)} milyon <small>${unit}</small>`;
  return `${F.num(v, 0)} <small>${unit}</small>`;
};

export function renderOverview(rows) {
  const done = rows.reduce((n, r) => n + r.completion.done, 0);
  const budget = rows.reduce((n, r) => n + r.res.year1.cashNet, 0);
  const co2 = rows.reduce((n, r) => n + r.res.co2, 0);
  const traffic = rows.find(r => r.model.id === 'trafik');
  const cards = rows.map(({ model, res, completion }, i) => {
    const s = sectors[model.id];
    const p = res.physical.find(p => p.label === s.physical);
    return `<a class="city-project ${s.photo} city-reveal" href="#${model.id}" style="--delay:${i * 65}ms">
      <div class="project-photo" role="img" aria-label="${s.name} için kent altyapısı konsept görseli"><span class="project-photo-icon">${icon(model.icon)}</span><span class="project-number">0${i + 1}</span><span class="project-open">${arrow}</span></div>
      <div class="project-copy"><p class="project-tag">${s.tag}</p><h3>${s.name}</h3><p class="project-desc">${s.copy}</p><div class="project-fact"><small>${s.label}</small><b>${p ? compact(p.value, p.unit) : '—'}</b></div><div class="project-cta"><span>${completion.done ? `${completion.done} / ${completion.total} alan hazır` : 'Örnek senaryo sonucu'}</span><strong>Analizi keşfet ${arrow}</strong></div></div>
    </a>`;
  }).join('');
  return `<div class="city-home">
    <section class="city-hero" aria-labelledby="city-hero-title">
      <div class="city-scene-drift"><img class="city-hero-image" src="assets/images/city-vision.webp" width="1672" height="941" fetchpriority="high" alt="Akşam ışığında yeşil alanları, nehir kıyısı ve aydınlanan sokaklarıyla bir Akdeniz kenti vizyonu"></div>
      <div class="city-hero-shade"></div><div class="city-grain" aria-hidden="true"></div>
      <div class="city-hero-copy"><p class="city-kicker"><span></span> DAHA YAŞANABİLİR BİR GELECEK</p><h1 id="city-hero-title">Geleceğin şehri, <br><em>bugün başlar.</em></h1><p>Her yanan ışıkta, korunan su damlasında, açılan yolda bir yatırım kararı var. Şehriniz için hangisi daha fazla değer yaratır?</p><div class="city-hero-actions"><a class="city-button" href="#yatirimlar" data-city-scroll="yatirimlar">Şehriniz için keşfedin ${down}</a><a class="city-text-link" href="#yontem">Nasıl hesaplıyoruz? ${arrow}</a></div></div>
      <div class="city-focus" aria-live="off"><span class="focus-overline">ŞEHİRDEKİ BİR FIRSAT</span><h2 data-focus-title>Sokaklar aydınlansın. <br>Enerji boşa gitmesin.</h2><a href="#aydinlatma" data-focus-link>Aydınlatma analizine geç</a></div>
      <div class="city-hero-bottom"><span class="city-explore-hint">Şehrinizin potansiyelini keşfedin</span><span>4 ALAN. TEK BİR GELECEK.</span></div>
    </section>
    <div class="city-content">
    <section class="city-investments" id="yatirimlar" aria-labelledby="city-investments-title"><div class="city-section-head city-reveal"><div><p class="city-eyebrow">DAHA İYİ BİR ŞEHRİN DÖRT YOLU</p><h2 id="city-investments-title">Değişim nereden başlasın?</h2></div><p>Bir alanı keşfedin. <br>Şehrinizde yaratabileceği farkı görün.</p></div><div class="city-projects">${cards}</div><p class="city-photo-note">Görseller kent vizyonunu temsil eder. Kartlardaki değerler girili senaryolardan hesaplanır.</p></section>
    <section class="city-potential city-reveal" aria-labelledby="potential-title"><div class="potential-intro"><p class="city-eyebrow">KARARINIZIN ETKİSİNİ GÖRÜN</p><h2 id="potential-title">Rakamların ardında <br>bir şehir var.</h2><a href="#karsilastirma">Dört yatırımı birlikte incele ${arrow}</a></div><div class="potential-stat"><span>Belediye bütçesine yıllık net etki</span><b data-city-counter="money" data-value="${budget}">${F.tlShort(budget)}</b><small>Belediye bütçesi · 1. yıl</small></div><div class="potential-stat"><span>Yıllık CO₂ azaltımı</span><b data-city-counter="co2" data-value="${co2}">${F.num(co2, 0)} <small>ton</small></b><small>Dört yatırımın toplamı</small></div><p class="potential-note">${done ? 'Girili değerlerle hesaplanmıştır; örnek kalan alanlar da toplama dahildir.' : 'Örnek senaryolardır; gerçek belediye verisi değildir.'} Sonuçlar, analizlerdeki girdilerle birlikte güncellenir.</p></section>
    <section class="city-perspective city-reveal" aria-labelledby="city-perspective-title"><div class="perspective-story"><span class="city-eyebrow">İYİ BİR KARAR, İKİ YÖNDEN BAKAR</span><h2 id="city-perspective-title">Sadece bütçeyi değil, <br><em>hayatı da</em> iyileştirin.</h2><p>Bazı yatırımlar belediye bütçesine döner. Bazıları insanlara zaman, şehre daha temiz bir hava kazandırır. Doğru değerlendirme, ikisini birlikte görür.</p><a href="#yontem" class="perspective-link">Mali ve toplumsal analiz arasındaki fark ${arrow}</a></div><div class="perspective-example"><div class="perspective-label">${icon(traffic.model.icon)}<span>AKILLI TRAFİK · GİRİLİ SENARYO</span></div><span class="perspective-number">${F.tlShort(traffic.res.eco.npv)}</span><h3>Şehre net değer.</h3><p>Vatandaşın zaman ve yakıt kazançları dahil, yatırım ömrü boyunca bugünkü değerle toplumsal net etki.</p><div class="perspective-rule"></div><a href="#trafik">Bu değerin hesabını görün ${arrow}</a><div class="perspective-orbit" aria-hidden="true"><i></i><i></i><i></i></div></div></section>
    <section class="city-next city-reveal"><div class="city-next-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M12 5h16l8 8v30H12zM28 5v10h8M19 24h10M19 31h10"/></svg></div><div><p class="city-eyebrow">FİKİRDEN KARARA</p><h2>Şimdi kendi şehrinizin <br>hikâyesini yazın.</h2><p>Verileri elle girin ya da belediyenizin belgelerinden aktarın. <br>Sonucu inceleyin, karşılaştırın ve raporunuzu alın.</p></div><a class="city-button city-button-dark" href="#belgeler">Belgelerinizle başlayın ${arrow}</a></section>
    </div>
  </div>`;
}

export function mountOverview(root) {
  const controller = new AbortController();
  const { signal } = controller;
  const hero = root.querySelector('.city-hero');
  const image = root.querySelector('.city-hero-image');
  const title = root.querySelector('[data-focus-title]');
  const link = root.querySelector('[data-focus-link]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ids = Object.keys(sectors);
  let selected = 0;
  let frame = 0;
  let counterFrame = 0;
  let printing = false;
  let pointer = { x: 0, y: 0 };

  // Kart 3,5 saniyede bir sıradaki alana geçer; geçiş göstergesi yoktur.
  const rotation = setInterval(() => {
    if (document.hidden || printing || link.matches(':focus-visible')) return;
    selected = (selected + 1) % ids.length;
    const id = ids[selected];
    const sector = sectors[id];
    // Dar ekranda satır sonu gizlenir; kelimeler yapışmasın diye öncesine boşluk konur.
    title.replaceChildren(...sector.title.split('\n').flatMap((line, i) => i ? [document.createTextNode(' '), document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)]));
    link.href = `#${id}`;
    link.textContent = `${sector.name} analizine geç`;
  }, 3500);

  hero.addEventListener('pointermove', e => {
    if (reduced.matches || e.pointerType !== 'mouse') return;
    const bounds = hero.getBoundingClientRect();
    pointer = { x: (e.clientX - bounds.left) / bounds.width - .5, y: (e.clientY - bounds.top) / bounds.height - .5 };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      image.style.setProperty('--pan-x', `${pointer.x * -9}px`);
      image.style.setProperty('--pan-y', `${pointer.y * -7}px`);
      frame = 0;
    });
  }, { signal });
  hero.addEventListener('pointerleave', () => { image.style.setProperty('--pan-x', '0px'); image.style.setProperty('--pan-y', '0px'); }, { signal });

  root.querySelectorAll('[data-city-scroll]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    root.querySelector(`#${a.dataset.cityScroll}`).scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
  }, { signal }));

  const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    reveal.unobserve(entry.target);
  }), { threshold: .08 });
  root.querySelectorAll('.city-reveal').forEach(el => { el.classList.add('will-reveal'); reveal.observe(el); });

  const counters = root.querySelectorAll('[data-city-counter]');
  const renderCount = (el, ratio) => {
    const n = Number(el.dataset.value) * ratio;
    el.innerHTML = el.dataset.cityCounter === 'money' ? F.tlShort(n) : `${F.num(n, 0)} <small>ton</small>`;
  };
  const counts = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    counts.disconnect();
    if (reduced.matches) return;
    let start = null;
    const tick = now => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / 1100);
      counters.forEach(el => renderCount(el, printing ? 1 : 1 - (1 - t) ** 3));
      if (t < 1 && !printing) counterFrame = requestAnimationFrame(tick);
    };
    counterFrame = requestAnimationFrame(tick);
  }, { threshold: .3 });
  counts.observe(root.querySelector('.city-potential'));
  window.addEventListener('beforeprint', () => { printing = true; counters.forEach(el => renderCount(el, 1)); }, { signal });
  window.addEventListener('afterprint', () => { printing = false; }, { signal });
  return () => {
    controller.abort();
    clearInterval(rotation);
    reveal.disconnect(); counts.disconnect();
    cancelAnimationFrame(frame); cancelAnimationFrame(counterFrame);
  };
}
