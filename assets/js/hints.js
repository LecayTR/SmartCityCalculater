// "Bu veri nereden bulunur?" ipuçları. Yalnızca arayüzde gösterilir; hesaplara etkisi yoktur.
// Anahtar: model kimliği → girdi anahtarı. Listede olmayan maliyet alanları için COST_HINT kullanılır.

export const COST_HINT = 'Tedarikçi teklifleri veya EKAP’taki benzer belediye ihaleleri';

export const HINTS = {
  aydinlatma: {
    n: 'Fen İşleri / elektrik birimi armatür envanteri',
    w: 'Envanterdeki lamba tipleri ve güçleri',
    h: 'Dağıtım şirketinin aydınlatma tüketim kayıtları veya astronomik saat ayarları',
    price: 'Son 12 ayın aydınlatma faturaları: toplam tutar ÷ toplam kWh',
    maint: 'Bakım-onarım sözleşmesi veya Mali Hizmetler gider kayıtları',
    share: 'Aydınlatma bedelinin hangi bütçeden ödendiği (Mali Hizmetler)',
    life: 'Üretici garanti ve ömür beyanı (genellikle 50.000+ saat)',
  },
  su: {
    input: 'Yıllık su kayıpları denetim raporu – sisteme giren su',
    nrw: 'Aynı rapor – gelir getirmeyen su oranı',
    realShare: 'Rapordaki su dengesi tablosu: fiziki / idari kayıp ayrımı',
    subscribers: 'Abone ve faturalama sistemi',
    prodCost: 'Arıtma ve pompaj enerji + kimyasal giderleri ÷ üretilen m³',
    tariff: 'Belediye meclisinin su tarifesi kararı',
    repair: 'Arıza ekibi iş emirleri ve onarım gider kayıtları',
    readCost: 'Sayaç okuma hizmet alımı sözleşmesi veya okuma personeli gideri',
    energy: 'Pompa istasyonları elektrik tüketimi ÷ üretilen m³',
    scarcity: 'Havza yönetim planı; bilinmiyorsa 0 bırakın',
  },
  atik: {
    vehicles: 'Temizlik İşleri araç envanteri',
    km: 'Araç takip sistemi kilometre raporları',
    fuelUse: 'Makine İkmal yakıt kayıtları ÷ kilometre',
    fuelPrice: 'Akaryakıt alım sözleşmesi veya son faturalar',
    maintKm: 'Araç bakım-onarım giderleri ÷ toplam kilometre',
    crew: 'Temizlik İşleri vardiya planı',
    wage: 'İnsan Kaynakları: kişi başı yıllık toplam işveren maliyeti',
    coverage: 'Konteyner envanteri ve toplama rota haritaları',
  },
  trafik: {
    intersections: 'Sinyalizasyon birimi kavşak envanteri',
    trips: 'Ulaşım Dairesi / UKOME trafik sayımları',
    tripTime: 'Seyahat süresi ölçümleri veya navigasyon hizmeti verileri',
    days: 'Trafik sayımlarının hafta içi / hafta sonu dağılımı',
    occupancy: 'Hane halkı ulaşım anketi; bilinmiyorsa 1,3',
    vot: 'Bölgedeki ortalama saatlik ücretin yaklaşık yarısı',
    fuelIdle: 'Araç üreticisi rölanti tüketimi veya literatür (0,6–1,0)',
    fuelPrice: 'EPDK akaryakıt fiyatlarından vergiler düşülerek',
    oldMaint: 'Mevcut sinyalizasyon bakım sözleşmesi',
  },
};
