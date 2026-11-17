import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readFile, decodeText, unzip, ReadError } from '../assets/js/sheets.js';
import { toNumber, detectType, extractorById, check, applyOperation, guessHeader, percentValue, inputOf } from '../assets/js/importer.js';
import { buildTemplate, zipStore } from '../assets/js/template.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const enc = s => new TextEncoder().encode(s);
const pick = (r, key) => r.proposals.find(p => p.key === key);
const run = async (name, content, opts) => {
  const file = await readFile(name, typeof content === 'string' ? enc(content) : content);
  const type = detectType(file);
  return { file, type, result: type === 'elle' ? null : extractorById(type).extract([file], opts, { values: {} }) };
};

test('Türkçe sayı yazımları', () => {
  const s = v => toNumber({ v, t: 's' })?.value;
  assert.equal(s('1.234.567'), 1234567);
  assert.equal(s('1.234,56'), 1234.56);
  assert.equal(s('4,35'), 4.35);
  assert.equal(s('0.44'), 0.44);
  assert.equal(s('₺ 12.500,00 TL'), 12500);
  assert.equal(s('%35'), 35);
  assert.equal(s('150 W'), 150);
  assert.equal(s('Direk 12'), undefined);
  assert.equal(toNumber({ v: 0.35, t: 'n', pct: true }).pct, true);
});

test('Yüzde alanlarında oran ve yüzde biçimi', () => {
  const nrw = inputOf('su', 'nrw');
  assert.equal(percentValue(nrw, { value: 0.35, pct: true }).value, 35);
  assert.equal(percentValue(nrw, { value: 0.35, pct: false, sign: false }).value, 35);
  assert.equal(percentValue(nrw, { value: 35, pct: false }).value, 35);
  const esc = inputOf('genel', 'esc'); // küçük değerli alan: 0,5 yüzde olarak kalır
  assert.equal(percentValue(esc, { value: 0.5, pct: false, sign: false }).value, 0.5);
});

test('Windows-1254 (Türkçe) kodlamalı CSV okunur', () => {
  const bytes = new Uint8Array([0xdd, 0x64, 0x61, 0x72, 0x69, 0x20, 0x6b, 0x61, 0x79, 0xfd, 0x70, 0x20, 0xfe, 0xf0]);
  assert.equal(decodeText(bytes), 'İdari kayıp şğ');
  assert.equal(decodeText(enc('﻿Su;1')), 'Su;1');
});

test('Sıkıştırılmış (deflate) ZIP girdisi açılır', async () => {
  const data = deflateRawSync(Buffer.from('<a>merhaba</a>'));
  // zipStore yerleşik olarak sıkıştırmasız yazar; burada yöntem 8 ile elle bir girdi kurulur.
  const name = enc('x.xml');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(30 + name.length + data.length, 16);
  const zip = await unzip(Buffer.concat([local, name, data, cd, name, end]));
  assert.equal(await zip.text('x.xml'), '<a>merhaba</a>');
});

test('Şablon indirilip doldurulduktan sonra geri okunur', async () => {
  const bytes = buildTemplate((m, k) => (m === 'aydinlatma' && k === 'n' ? 7200 : m === 'su' && k === 'nrw' ? 31.5 : null));
  const { type, result } = await run('sablon.xlsx', bytes);
  assert.equal(type, 'sablon');
  assert.equal(pick(result, 'n').value, 7200);
  assert.equal(pick(result, 'nrw').value, 31.5);
  assert.equal(result.proposals.length, 2);
});

const invoice = (id, type, kwh, payable) => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>TEMELFATURA</cbc:ProfileID><cbc:ID>${id}</cbc:ID><cbc:IssueDate>2025-03-05</cbc:IssueDate><cbc:InvoiceTypeCode>${type}</cbc:InvoiceTypeCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Örnek Elektrik Perakende A.Ş.</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="TRY">${payable / 1.2}</cbc:TaxExclusiveAmount><cbc:PayableAmount currencyID="TRY">${payable}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="KWH">${kwh}</cbc:InvoicedQuantity><cac:Item><cbc:Name>Enerji Bedeli</cbc:Name></cac:Item></cac:InvoiceLine>
  <cac:InvoiceLine><cbc:ID>2</cbc:ID><cbc:InvoicedQuantity unitCode="KWH">${kwh}</cbc:InvoicedQuantity><cac:Item><cbc:Name>Dağıtım Bedeli</cbc:Name></cac:Item></cac:InvoiceLine>
</Invoice>`;

test('e-Fatura: kWh çift sayılmaz, iade ve tekrar eden fatura ayıklanır', async () => {
  const files = await Promise.all([
    readFile('a.xml', enc(invoice('ABC2025000000001', 'SATIS', 1000, 4500))),
    readFile('b.xml', enc(invoice('ABC2025000000002', 'SATIS', 3000, 13500))),
    readFile('b-kopya.xml', enc(invoice('ABC2025000000002', 'SATIS', 3000, 13500))),
    readFile('c.xml', enc(invoice('ABC2025000000003', 'IADE', 500, 2250))),
  ]);
  assert.ok(files.every(f => detectType(f) === 'efatura'));
  const r = extractorById('efatura').extract(files);
  near(pick(r, 'price').value, 18000 / 4000);
  assert.ok(r.warnings.some(w => w.includes('daha önce')));
  assert.ok(r.warnings.some(w => w.includes('iade')));
  const ex = extractorById('efatura').extract(files, { amount: 'TaxExclusiveAmount' });
  near(pick(ex, 'price').value, 18000 / 1.2 / 4000);
});

test('Su dengesi: dikey tablo, bin m³ birimi', async () => {
  const csv = `ÖRNEK BELEDİYESİ 2025 YILI SU KAYIPLARI RAPORU;;\nSu Dengesi Tablosu (bin m³/yıl);;\nKalem;Değer;Açıklama\nSisteme Giren Su Miktarı;20.000;\nFaturalandırılmış Yetkili Tüketim;13.200;\nSu Kayıpları;6.500;\nİdari Kayıplar;2.600;\nFiziki Kayıplar;3.900;\nGelir Getirmeyen Su;6.800;\nToplam Abone Sayısı;80.150;`;
  const { type, result } = await run('su.csv', csv);
  assert.equal(type, 'su-dengesi');
  assert.equal(pick(result, 'input').value, 20_000_000);
  near(pick(result, 'nrw').value, 32.5);
  near(pick(result, 'realShare').value, 60);
  assert.equal(pick(result, 'subscribers').value, 80150);
});

test('Su dengesi: yatay çok yıllık tablo, yıl seçimi', async () => {
  const csv = `Yıl;Sisteme Giren Su (m3);Fiziki Kayıplar (m3);İdari Kayıplar (m3)\n2023;18000000;4200000;2800000\n2024;19000000;4000000;2600000`;
  const { result } = await run('kayip.csv', csv);
  assert.equal(pick(result, 'input').value, 19_000_000);
  const first = extractorById('su-dengesi').extract([await readFile('kayip.csv', enc(csv))], { year: 0 });
  assert.equal(pick(first, 'input').value, 18_000_000);
  near(pick(first, 'nrw').value, 7_000_000 / 18_000_000 * 100);
});

test('Armatür envanteri: güç tip adında, adet sütunu, toplam ve sökülmüş satırlar', async () => {
  const csv = `Mahalle;Armatür Tipi;Adet;Durum\nMerkez;150W SON;100;Aktif\nCumhuriyet;250 W Sodyum;50;Aktif\nCumhuriyet;70W SON;10;Sökülmüş\nToplam;;160;`;
  const { type, result } = await run('armatur.csv', csv);
  assert.equal(type, 'armatur');
  assert.equal(pick(result, 'n').value, 150);
  near(pick(result, 'w').value, (100 * 150 + 50 * 250) / 150);
  const withBallast = extractorById('armatur').extract([await readFile('armatur.csv', enc(csv))], { ballast: true });
  near(pick(withBallast, 'w').value, (100 * 150 + 50 * 250) / 150 * 1.1);
});

test('Taşıt Tanıma dökümü: yalnız çöp araçları, km sayacı, yıllığa çevirme', async () => {
  const csv = [
    'Plaka;Araç Türü;Tarih;Litre;Tutar;Km',
    '06 ABC 001;Çöp Kamyonu;01.01.2025;100;5.500,00;10000',
    '06 ABC 001;Çöp Kamyonu;30.06.2025;200;11.000,00;11000',
    '06 ABC 002;Çöp Kamyonu;02.01.2025;150;8.250,00;50000',
    '06 ABC 002;Çöp Kamyonu;29.06.2025;150;8.250,00;51500',
    '06 XYZ 900;Binek;15.03.2025;40;2.200,00;3000',
  ].join('\n');
  const { type, result } = await run('tts.csv', csv);
  assert.equal(type, 'yakit');
  assert.equal(pick(result, 'vehicles').value, 2);
  near(pick(result, 'fuelUse').value, 600 / 2500 * 100);
  near(pick(result, 'fuelPrice').value, 55);
  const days = 180; // 01.01 – 29/30.06
  near(pick(result, 'km').value, 2500 * (365 / days) / 2, 0.01);
});

test('Fatura listesi: ödenecek tutar sütunu seçilir, toplam satırı sayılmaz', async () => {
  const csv = `Fatura Dönemi;Tüketim (kWh);KDV Hariç Tutar;Ödenecek Tutar\n2025-01;100.000;375.000;450.000\n2025-02;80.000;300.000;360.000\nGenel Toplam;180.000;675.000;810.000`;
  const { type, result } = await run('elektrik-faturalari.csv', csv);
  assert.equal(type, 'fatura-tablosu');
  near(pick(result, 'price').value, 810000 / 180000);
});

test('Web tablosu olarak dışa aktarılmış .xls okunur', async () => {
  const html = '<html><body><table><tr><th>Plaka</th><th>Litre</th><th>Km</th></tr><tr><td>06 A 1</td><td>10,5</td><td>100</td></tr></table></body></html>';
  const file = await readFile('rapor.xls', enc(html));
  assert.equal(file.format, 'Web tablosu (.xls/.html)');
  assert.equal(file.sheets[0].rows[1][1].v, '10,5');
});

test('Eski ikili .xls ve PDF anlaşılır bir hatayla reddedilir', async () => {
  await assert.rejects(readFile('eski.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])), ReadError);
  await assert.rejects(readFile('rapor.pdf', enc('%PDF-1.7')), ReadError);
});

test('Elle eşleştirme: başlık bulunur, işlemler doğru', async () => {
  const csv = `Trafik sayımı 2025;;\n;;\nSayım Noktası;Günlük Araç;Kavşak\nA;12.000;K1\nB;8.000;K2\nB;5.000;K2\nToplam;25.000;`;
  const file = await readFile('sayim.csv', enc(csv));
  assert.equal(detectType(file), 'elle');
  const sheet = file.sheets[0];
  const hi = guessHeader(sheet.rows);
  assert.equal(hi, 2);
  assert.equal(applyOperation(sheet, hi, 1, 'sum'), 25000);
  assert.equal(applyOperation(sheet, hi, 1, 'max'), 12000);
  assert.equal(applyOperation(sheet, hi, 2, 'distinct'), 2);
});

test('Öneri denetimi: sınır dışı hata, birim şüphesi uyarı', () => {
  assert.equal(check({ model: 'su', key: 'nrw', value: 135 }).level, 'error');
  assert.equal(check({ model: 'aydinlatma', key: 'price', value: 4500 }).level, 'warn');
  assert.equal(check({ model: 'aydinlatma', key: 'price', value: 4.4 }).level, 'ok');
});

test('zipStore geçerli bir ZIP üretir', async () => {
  const z = await unzip(zipStore([['a.txt', 'çöp'], ['b/c.txt', 'x']]));
  assert.deepEqual(z.names, ['a.txt', 'b/c.txt']);
  assert.equal(await z.text('a.txt'), 'çöp');
});

test('LibreOffice ile kaydedilmiş gerçek .xlsx ve .ods dosyaları okunur', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['armatur-libreoffice.xlsx', 'armatur-libreoffice.ods']) {
    const file = await readFile(f, readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
    assert.equal(detectType(file), 'armatur', f);
    const r = extractorById('armatur').extract([file]);
    assert.equal(pick(r, 'n').value, 4600, f);
    near(pick(r, 'w').value, (2100 * 150 + 900 * 250 + 1600 * 100) / 4600);
  }
});
