// Dört akıllı şehir yatırımının hesap modelleri.
//
// Her modelin girdileri üç gruba ayrılır:
//   data       – belediyenin kendi kayıtlarından girmesi gereken mevcut durum verileri
//   cost       – yatırım ve işletme maliyetleri (teklif / keşif bedellerinden)
//   assumption – yatırımın etkisine dair, literatüre dayalı varsayımlar (belirsizlik analizine girer)
//
// `unc: [alt, üst]` taşıyan girdiler Monte Carlo ve duyarlılık analizinde bu aralıkta değiştirilir.
// Yüzde girdileri kullanıcıya yüzde olarak gösterilir, hesapta 100'e bölünür.
//
// compute(v, g) yıllık (1. yıl) etkileri döndürür:
//   investment – toplam yatırım (TL)
//   lines      – { label, value, kind, esc }  value > 0 fayda, < 0 maliyet
//                kind: 'cash'     belediye kasasını etkiler, toplumsal analizde de sayılır
//                      'transfer' belediye kasasını etkiler ama toplum için transferdir (ör. kaçak su tahsilatı)
//                      'social'   yalnızca toplumsal faydadır (ör. vatandaşın zaman kazancı)
//                esc: true ise kalem enerji/yakıt/su fiyatlarındaki reel artışla büyür
//   physical   – fiziksel göstergeler (kWh, m³, litre, saat…)
//   co2        – yıllık CO₂ azaltımı (ton)

const pct = x => x / 100;

const FUEL_CO2_DIESEL = 2.68; // kg CO₂ / L, IPCC 2006 varsayılanı
const FUEL_CO2_MIXED = 2.5;   // kg CO₂ / L, benzin (2,31) ve motorin (2,68) ağırlıklı karma filo

const commonCosts = (life, lifeHelp) => [
  { key: 'life', label: 'Ekonomik ömür (analiz süresi)', unit: 'yıl', value: life, min: 1, max: 40, step: 1, group: 'cost', help: lifeHelp },
  { key: 'grant', label: 'Hibe / dış finansman desteği', unit: 'TL', value: 0, min: 0, group: 'cost', help: 'Kalkınma ajansı, AB, İller Bankası hibesi gibi geri ödemesiz destek. Belediyenin mali analizinde yatırımdan düşülür; toplumsal analizde transfer sayıldığı için düşülmez (AB MFA Rehberi).', src: ['S1'] },
];

export const MODELS = [
  {
    id: 'aydinlatma',
    name: 'Akıllı Aydınlatma',
    short: 'Aydınlatma',
    icon: 'M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zm-3 18h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1z',
    summary: 'Mevcut sokak armatürlerinin LED’e dönüştürülmesi ve gece trafiğine göre otomatik kısılan (dimming) uzaktan yönetim sistemi.',
    primary: 'fin',
    inputs: [
      { key: 'n', label: 'Mevcut armatür sayısı', unit: 'adet', value: 5000, min: 1, group: 'data' },
      { key: 'w', label: 'Mevcut armatür ortalama gücü (balast dahil)', unit: 'W', value: 160, min: 1, group: 'data', help: 'Sodyum buharlı 150 W lamba balast kaybıyla yaklaşık 165–170 W çeker. Envanterdeki karışık güçlerin ağırlıklı ortalamasını girin.' },
      { key: 'h', label: 'Yıllık yanma süresi', unit: 'saat/yıl', value: 4100, min: 1, max: 8760, group: 'data', help: 'Türkiye enlemlerinde gece boyu yanan armatürler için yaklaşık 4.000–4.300 saat.' },
      { key: 'price', label: 'Elektrik birim fiyatı (vergiler dahil)', unit: 'TL/kWh', value: 4.5, min: 0, step: 0.01, group: 'data', help: 'Son aydınlatma faturalarındaki toplam tutar / tüketim (kWh).' },
      { key: 'maint', label: 'Mevcut yıllık bakım-onarım gideri', unit: 'TL/armatür', value: 300, min: 0, group: 'data' },
      { key: 'share', label: 'Elektrik tasarrufunun belediye bütçesine yansıyan payı', unit: '%', pct: true, value: 100, min: 0, max: 100, group: 'data', help: 'Cadde-sokak genel aydınlatma bedeli belediye dışında bir kurum tarafından ödeniyorsa, o kısım belediyenin kasasına değil kamuya tasarruf olarak yazılır. Park, meydan ve bina aydınlatmasında genellikle %100’dür.' },

      { key: 'unitCost', label: 'Armatür başına yatırım (LED + kontrol ünitesi + montaj)', unit: 'TL/adet', value: 11000, min: 0, group: 'cost' },
      { key: 'fixed', label: 'Merkezi yönetim yazılımı ve entegrasyon (tek seferlik)', unit: 'TL', value: 1500000, min: 0, group: 'cost' },
      { key: 'platform', label: 'Haberleşme ve yazılım lisans gideri', unit: 'TL/armatür/yıl', value: 60, min: 0, group: 'cost' },
      ...commonCosts(15, 'LED armatürler 50.000–100.000 saat (≈12–24 yıl) ömürlüdür; kontrol elektroniği genellikle daha kısa ömürlüdür.'),

      { key: 'ledSave', label: 'LED dönüşümüyle enerji tasarrufu', unit: '%', pct: true, value: 55, min: 0, max: 100, unc: [40, 70], src: ['S2'], group: 'assumption' },
      { key: 'dimSave', label: 'Akıllı kısma ile kalan tüketimde ek tasarruf', unit: '%', pct: true, value: 20, min: 0, max: 100, unc: [10, 35], src: ['S2'], group: 'assumption', help: 'Gece yarısından sonra düşük trafikte ışık seviyesinin azaltılmasıyla LED tüketimi üzerinde sağlanan ek kazanç.' },
      { key: 'maintSave', label: 'Bakım-onarım giderinde azalma', unit: '%', pct: true, value: 40, min: 0, max: 100, unc: [20, 60], group: 'assumption', help: 'Daha uzun lamba ömrü ve arızanın uzaktan tespit edilmesiyle ekip çıkışlarındaki azalma.' },
    ],
    compute(v, g) {
      const kwh0 = v.n * v.w / 1000 * v.h;
      const kwh1 = kwh0 * (1 - pct(v.ledSave)) * (1 - pct(v.dimSave));
      const saved = kwh0 - kwh1;
      const elec = saved * v.price;
      const lines = [
        { label: 'Elektrik tasarrufu (belediye)', value: elec * pct(v.share), kind: 'cash', esc: true },
      ];
      if (v.share < 100) lines.push({ label: 'Elektrik tasarrufu (diğer kamu bütçeleri)', value: elec * (1 - pct(v.share)), kind: 'social', esc: true });
      lines.push(
        { label: 'Bakım-onarım tasarrufu', value: v.n * v.maint * pct(v.maintSave), kind: 'cash', esc: false },
        { label: 'Haberleşme ve yazılım gideri', value: -v.n * v.platform, kind: 'cash', esc: false },
      );
      return {
        investment: v.n * v.unitCost + v.fixed,
        lines,
        physical: [
          { label: 'Mevcut yıllık tüketim', value: kwh0, unit: 'kWh' },
          { label: 'Mevcut yıllık elektrik gideri (kontrol için)', value: kwh0 * v.price, unit: 'TL' },
          { label: 'Yıllık enerji tasarrufu', value: saved, unit: 'kWh' },
          { label: 'Toplam tüketimde azalma', value: kwh0 ? saved / kwh0 * 100 : 0, unit: '%' },
        ],
        co2: saved * g.ef / 1000,
      };
    },
  },

  {
    id: 'su',
    name: 'Akıllı Su Yönetimi',
    short: 'Su',
    icon: 'M12 2.5c-.3 0-.6.1-.8.4C9.4 5.3 5 11 5 15a7 7 0 0 0 14 0c0-4-4.4-9.7-6.2-12.1a1 1 0 0 0-.8-.4z',
    summary: 'Şebekenin izole ölçüm bölgelerine (DMA) ayrılması, basınç yönetimi, sızıntı sensörleri ve akıllı sayaçlarla su kayıplarının azaltılması.',
    primary: 'fin',
    inputs: [
      { key: 'input', label: 'Sisteme verilen yıllık su miktarı', unit: 'm³/yıl', value: 20000000, min: 0, group: 'data' },
      { key: 'nrw', label: 'Toplam su kaybı oranı (gelir getirmeyen su)', unit: '%', pct: true, value: 35, min: 0, max: 100, group: 'data', src: ['S5'], help: 'Belediyenin yıllık su denetimi (su kayıpları) raporundaki oran.' },
      { key: 'realShare', label: 'Kayıpların fiziki (sızıntı, patlak) payı', unit: '%', pct: true, value: 60, min: 0, max: 100, group: 'data', src: ['S3'], help: 'IWA su dengesine göre kalan kısım idari kayıptır: sayaç hataları, kaçak kullanım, faturalanmayan tüketim.' },
      { key: 'subscribers', label: 'Toplam abone sayısı', unit: 'abone', value: 80000, min: 1, group: 'data' },
      { key: 'prodCost', label: 'Su üretiminin değişken maliyeti (enerji + kimyasal)', unit: 'TL/m³', value: 6, min: 0, step: 0.01, group: 'data', src: ['S4'], help: 'Fiziki kayıp önlendiğinde tasarruf edilen, metreküp başına üretim ve pompaj maliyeti.' },
      { key: 'tariff', label: 'Ortalama su satış tarifesi', unit: 'TL/m³', value: 25, min: 0, step: 0.01, group: 'data', src: ['S4'], help: 'İdari kayıp geri kazanıldığında tahsil edilen ortalama birim fiyat.' },
      { key: 'repair', label: 'Yıllık arıza (boru patlağı) onarım gideri', unit: 'TL/yıl', value: 8000000, min: 0, group: 'data' },
      { key: 'readCost', label: 'Elle sayaç okuma gideri', unit: 'TL/abone/yıl', value: 60, min: 0, group: 'data' },
      { key: 'energy', label: 'Su temininde enerji yoğunluğu', unit: 'kWh/m³', value: 0.6, min: 0, step: 0.01, group: 'data', help: 'Yalnızca CO₂ hesabında kullanılır; enerji maliyeti değişken maliyetin içindedir.' },
      { key: 'scarcity', label: 'Ham su kaynağının ekonomik (kıtlık) değeri', unit: 'TL/m³', value: 3, min: 0, step: 0.01, group: 'data', help: 'Yalnızca toplumsal analizde sayılır. Kuraklık riski yüksek havzalarda daha yüksek alınmalıdır; bilinmiyorsa 0 girin.' },

      { key: 'infra', label: 'DMA, basınç yönetimi ve sensör altyapısı', unit: 'TL', value: 30000000, min: 0, group: 'cost' },
      { key: 'meters', label: 'Takılacak akıllı sayaç adedi', unit: 'adet', value: 10000, min: 0, group: 'cost' },
      { key: 'meterCost', label: 'Akıllı sayaç birim maliyeti (montaj dahil)', unit: 'TL/adet', value: 3000, min: 0, group: 'cost' },
      { key: 'opex', label: 'Yıllık ek işletme gideri (veri, yazılım, personel)', unit: 'TL/yıl', value: 2000000, min: 0, group: 'cost' },
      ...commonCosts(12, 'Akıllı sayaç pil ömrü genellikle 10–15 yıldır; basınç düşürücü vanalar daha uzun ömürlüdür.'),

      { key: 'realRed', label: 'Fiziki kayıplarda azalma', unit: '%', pct: true, value: 25, min: 0, max: 100, unc: [15, 40], src: ['S3', 'S4'], group: 'assumption' },
      { key: 'appRed', label: 'Akıllı sayaçlı abonelerde idari kayıplarda azalma', unit: '%', pct: true, value: 40, min: 0, max: 100, unc: [20, 60], src: ['S4'], group: 'assumption', help: 'Etki, akıllı sayaç takılan abonelerin toplam abonelere oranıyla ölçeklenir.' },
      { key: 'burstRed', label: 'Basınç yönetimiyle arıza sayısında azalma', unit: '%', pct: true, value: 15, min: 0, max: 100, unc: [5, 30], group: 'assumption' },
      { key: 'readSave', label: 'Akıllı sayaçlı abonelerde okuma giderinde azalma', unit: '%', pct: true, value: 90, min: 0, max: 100, unc: [70, 100], group: 'assumption' },
    ],
    compute(v, g) {
      const loss = v.input * pct(v.nrw);
      const real = loss * pct(v.realShare);
      const apparent = loss - real;
      const coverage = Math.min(1, v.meters / v.subscribers);
      const savedReal = real * pct(v.realRed);
      const recovered = apparent * pct(v.appRed) * coverage;
      return {
        investment: v.infra + v.meters * v.meterCost,
        lines: [
          { label: 'Önlenen fiziki kayıp (üretim maliyeti)', value: savedReal * v.prodCost, kind: 'cash', esc: true },
          { label: 'Geri kazanılan gelir (idari kayıp)', value: recovered * v.tariff, kind: 'transfer', esc: true },
          { label: 'Arıza onarım tasarrufu', value: v.repair * pct(v.burstRed), kind: 'cash', esc: false },
          { label: 'Sayaç okuma tasarrufu', value: v.meters * v.readCost * pct(v.readSave), kind: 'cash', esc: false },
          { label: 'Ek işletme gideri', value: -v.opex, kind: 'cash', esc: false },
          { label: 'Korunan su kaynağının değeri', value: savedReal * v.scarcity, kind: 'social', esc: false },
        ],
        physical: [
          { label: 'Mevcut yıllık kayıp', value: loss, unit: 'm³' },
          { label: 'Önlenen fiziki kayıp', value: savedReal, unit: 'm³' },
          { label: 'Faturalanır hale gelen su', value: recovered, unit: 'm³' },
          { label: 'Yeni kayıp oranı', value: v.input ? (loss - savedReal - recovered) / v.input * 100 : 0, unit: '%' },
          { label: 'Akıllı sayaç kapsama oranı', value: coverage * 100, unit: '%' },
        ],
        co2: savedReal * v.energy * g.ef / 1000,
      };
    },
  },

  {
    id: 'atik',
    name: 'Akıllı Atık Toplama',
    short: 'Atık',
    icon: 'M9 3h6l1 2h4v2H4V5h4l1-2zM5 8h14l-1.2 12.1A2 2 0 0 1 15.8 22H8.2a2 2 0 0 1-2-1.9L5 8z',
    summary: 'Konteynerlere doluluk sensörü takılması ve toplama rotalarının günlük doluluğa göre yeniden planlanması.',
    primary: 'fin',
    inputs: [
      { key: 'vehicles', label: 'Toplama aracı sayısı', unit: 'adet', value: 30, min: 0, group: 'data' },
      { key: 'km', label: 'Araç başına yıllık kilometre', unit: 'km/yıl', value: 30000, min: 0, group: 'data' },
      { key: 'fuelUse', label: 'Ortalama yakıt tüketimi', unit: 'L/100 km', value: 55, min: 0, step: 0.1, group: 'data', help: 'Dur-kalk çalışan sıkıştırmalı çöp araçlarında 45–80 L/100 km arası değerler görülür.' },
      { key: 'fuelPrice', label: 'Motorin alış fiyatı (belediyenin ödediği)', unit: 'TL/L', value: 55, min: 0, step: 0.01, group: 'data' },
      { key: 'maintKm', label: 'Araç bakım-onarım gideri', unit: 'TL/km', value: 8, min: 0, step: 0.01, group: 'data' },
      { key: 'crew', label: 'Araç başına personel', unit: 'kişi', value: 3, min: 0, step: 1, group: 'data' },
      { key: 'wage', label: 'Personel başına yıllık toplam maliyet', unit: 'TL/yıl', value: 650000, min: 0, group: 'data' },
      { key: 'coverage', label: 'Sensörlü konteynerlerin kapsadığı rota payı', unit: '%', pct: true, value: 40, min: 0, max: 100, group: 'data', help: 'Toplam toplama kilometresinin ne kadarı sensör takılan konteynerlerin bulunduğu rotalarda yapılıyor?' },

      { key: 'containers', label: 'Sensör takılacak konteyner sayısı', unit: 'adet', value: 2000, min: 0, group: 'cost' },
      { key: 'sensorCost', label: 'Sensör birim maliyeti (montaj dahil)', unit: 'TL/adet', value: 5000, min: 0, group: 'cost' },
      { key: 'software', label: 'Rota optimizasyon yazılımı ve entegrasyon', unit: 'TL', value: 3000000, min: 0, group: 'cost' },
      { key: 'opexSensor', label: 'Haberleşme ve yazılım lisans gideri', unit: 'TL/konteyner/yıl', value: 400, min: 0, group: 'cost' },
      ...commonCosts(8, 'Doluluk sensörlerinin pil ömrü genellikle 7–10 yıldır.'),

      { key: 'kmRed', label: 'Sensörlü rotalarda toplama mesafesinde azalma', unit: '%', pct: true, value: 20, min: 0, max: 100, unc: [10, 35], src: ['S6'], group: 'assumption' },
      { key: 'labourShare', label: 'Süre kazancının personel giderine yansıma oranı', unit: '%', pct: true, value: 30, min: 0, max: 100, unc: [0, 60], group: 'assumption', help: 'Kadro azaltılmayacaksa tasarruf yalnızca fazla mesai ve vardiya azalmasından gelir; bu durumda düşük tutun.' },
    ],
    compute(v, g) {
      const eff = pct(v.kmRed) * pct(v.coverage);
      const savedKm = v.vehicles * v.km * eff;
      const fuelSaved = savedKm * v.fuelUse / 100;
      return {
        investment: v.containers * v.sensorCost + v.software,
        lines: [
          { label: 'Yakıt tasarrufu', value: fuelSaved * v.fuelPrice, kind: 'cash', esc: true },
          { label: 'Araç bakım-onarım tasarrufu', value: savedKm * v.maintKm, kind: 'cash', esc: false },
          { label: 'Personel (mesai) tasarrufu', value: v.vehicles * v.crew * v.wage * eff * pct(v.labourShare), kind: 'cash', esc: false },
          { label: 'Haberleşme ve yazılım gideri', value: -v.containers * v.opexSensor, kind: 'cash', esc: false },
        ],
        physical: [
          { label: 'Toplam yıllık toplama mesafesi', value: v.vehicles * v.km, unit: 'km' },
          { label: 'Önlenen mesafe', value: savedKm, unit: 'km' },
          { label: 'Tasarruf edilen yakıt', value: fuelSaved, unit: 'L' },
          { label: 'Filo genelinde mesafe azalması', value: eff * 100, unit: '%' },
        ],
        co2: fuelSaved * FUEL_CO2_DIESEL / 1000,
      };
    },
  },

  {
    id: 'trafik',
    name: 'Akıllı Trafik',
    short: 'Trafik',
    icon: 'M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 2.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    summary: 'Sinyalize kavşakların trafik yoğunluğuna göre süre ayarlayan adaptif sinyal kontrolüne ve merkezi trafik yönetimine bağlanması.',
    primary: 'eco',
    inputs: [
      { key: 'intersections', label: 'Sisteme alınacak kavşak sayısı', unit: 'adet', value: 40, min: 0, group: 'data' },
      { key: 'trips', label: 'Etkilenen koridorlardan günlük araç geçişi', unit: 'araç/gün', value: 80000, min: 0, group: 'data', help: 'Aynı aracı her kavşakta tekrar saymayın: koridoru kullanan araç-sefer sayısı.' },
      { key: 'tripTime', label: 'Araçların sinyalize koridorda geçirdiği ortalama süre', unit: 'dk', value: 8, min: 0, step: 0.1, group: 'data' },
      { key: 'days', label: 'Yıllık etkin gün sayısı', unit: 'gün', value: 300, min: 0, max: 366, group: 'data', help: 'Hafta sonu ve tatillerde trafik düşükse 365’ten az alın.' },
      { key: 'occupancy', label: 'Araç başına ortalama yolcu', unit: 'kişi', value: 1.3, min: 0, step: 0.1, group: 'data' },
      { key: 'vot', label: 'Zaman değeri', unit: 'TL/kişi-saat', value: 120, min: 0, group: 'data', src: ['S8'], help: 'Kişisel yolculuklar için bölgedeki ortalama saatlik gelirin yaklaşık yarısı; iş yolculuklarının payı yüksekse artırın.' },
      { key: 'fuelIdle', label: 'Gecikme sırasında yakıt tüketimi', unit: 'L/araç-saat', value: 0.8, min: 0, step: 0.01, group: 'data' },
      { key: 'fuelPrice', label: 'Ortalama akaryakıt fiyatı (vergiler hariç)', unit: 'TL/L', value: 30, min: 0, step: 0.01, group: 'data', help: 'Toplumsal analizde akaryakıt vergileri transfer sayıldığından vergisiz fiyat kullanılır (AB MFA Rehberi).', src: ['S1'] },
      { key: 'oldMaint', label: 'Mevcut sinyalizasyonun yıllık bakım gideri', unit: 'TL/kavşak/yıl', value: 25000, min: 0, group: 'data' },

      { key: 'costPer', label: 'Kavşak başına yatırım (kontrol cihazı, dedektör, haberleşme)', unit: 'TL/kavşak', value: 1500000, min: 0, group: 'cost' },
      { key: 'center', label: 'Trafik yönetim merkezi yazılımı ve entegrasyon', unit: 'TL', value: 8000000, min: 0, group: 'cost' },
      { key: 'opex', label: 'Yeni sistemin yıllık işletme-bakım gideri', unit: 'TL/kavşak/yıl', value: 60000, min: 0, group: 'cost' },
      ...commonCosts(10, 'Kontrol cihazları ve dedektörler için tipik ekonomik ömür 10 yıl civarındadır.'),

      { key: 'timeRed', label: 'Koridorda seyahat süresinde azalma', unit: '%', pct: true, value: 10, min: 0, max: 100, unc: [5, 20], src: ['S7'], group: 'assumption' },
    ],
    compute(v, g) {
      const vehHours = v.trips * v.tripTime / 60 * pct(v.timeRed) * v.days;
      const personHours = vehHours * v.occupancy;
      const fuelSaved = vehHours * v.fuelIdle;
      return {
        investment: v.intersections * v.costPer + v.center,
        lines: [
          { label: 'Vatandaşın zaman kazancı', value: personHours * v.vot, kind: 'social', esc: false },
          { label: 'Sürücülerin yakıt tasarrufu', value: fuelSaved * v.fuelPrice, kind: 'social', esc: true },
          { label: 'Sinyalizasyon bakım gideri farkı', value: v.intersections * (v.oldMaint - v.opex), kind: 'cash', esc: false },
        ],
        physical: [
          { label: 'Yıllık kazanılan araç-saat', value: vehHours, unit: 'saat' },
          { label: 'Yıllık kazanılan kişi-saat', value: personHours, unit: 'saat' },
          { label: 'Araç başına günlük kazanç', value: v.tripTime * pct(v.timeRed) * 60, unit: 'sn' },
          { label: 'Tasarruf edilen yakıt', value: fuelSaved, unit: 'L' },
        ],
        co2: fuelSaved * FUEL_CO2_MIXED / 1000,
      };
    },
  },
];

// Tüm modelleri etkileyen genel parametreler.
export const GLOBAL_INPUTS = [
  { key: 'finRate', label: 'Mali iskonto oranı (reel)', unit: '%', pct: true, value: 5, min: -5, max: 50, step: 0.1, src: ['S1'], help: 'Belediyenin parasının alternatif getirisi veya borçlanma maliyeti. Fiyatları bugünkü TL ile giriyorsanız enflasyondan arındırılmış (reel) oran kullanın; AB rehberi mali analiz için %4 reel önerir. Nominal oran kullanacaksanız fiyat artışını da enflasyon dahil girin.' },
  { key: 'ecoRate', label: 'Sosyal iskonto oranı (reel)', unit: '%', pct: true, value: 5, min: -5, max: 50, step: 0.1, src: ['S1'], help: 'Toplumsal fayda analizinde kullanılır. AB rehberi uyum ülkeleri için %5 önerir.' },
  { key: 'esc', label: 'Enerji, yakıt ve su fiyatlarında yıllık reel artış', unit: '%', pct: true, value: 1, min: -10, max: 30, step: 0.1, unc: [-1, 3], help: 'Enflasyonun üzerindeki fiyat artışı. Belirsizlik analizinde −%1 ile +%3 arasında değiştirilir.' },
  { key: 'carbon', label: 'Karbon değeri', unit: 'TL/ton CO₂', value: 2500, min: 0, help: 'Yalnızca toplumsal analizde kullanılır. Referans olarak AB Emisyon Ticaret Sistemi fiyatını güncel kurla çevirebilirsiniz; 0 girerseniz karbon faydası hesaba katılmaz.' },
  { key: 'ef', label: 'Şebeke elektriği emisyon faktörü', unit: 'kg CO₂/kWh', value: 0.44, min: 0, step: 0.001, src: ['S10'], help: 'ETKB’nin yayımladığı en güncel ulusal şebeke emisyon faktörünü girin.' },
];

export const COST_OVERRUN = { label: 'Yatırım maliyetinde sapma', unc: [0.95, 1.3], src: ['S11'] };

export function defaultValues(inputs) {
  return Object.fromEntries(inputs.map(i => [i.key, i.value]));
}
