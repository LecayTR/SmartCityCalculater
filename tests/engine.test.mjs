import { test } from 'node:test';
import assert from 'node:assert/strict';
import { npv, irr, payback, evaluate, monteCarlo, tornado, breakEven, triangular, uncertainParams } from '../assets/js/engine.js';
import { MODELS, GLOBAL_INPUTS, defaultValues } from '../assets/js/models.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const globals = defaultValues(GLOBAL_INPUTS);

test('NBD: tasarım örneğindeki aydınlatma senaryosu', () => {
  // 14,5 mn TL yatırım, 12,25 mn TL elektrik giderinde %15 tasarruf, 800 bin TL ek gider, 6 yıl, %13 iskonto
  const net = 12_250_000 * 0.15 - 800_000;
  const flows = [-14_500_000, ...Array(6).fill(net)];
  near(npv(0.13, flows), -10_352_542, 1e-7);
  assert.equal(payback(flows), null); // 6 yıllık ömürde geri ödemiyor (≈14 yıl gerekir)
});

test('İVO: NBD’yi sıfırlar', () => {
  const flows = [-1000, 300, 300, 300, 300, 300];
  const r = irr(flows);
  near(npv(r, flows), 0, 1e-6);
  near(r, 0.15238, 1e-4);
  assert.equal(irr([-100, -10, -10]), null);
  assert.ok(irr([-100, 10, 10]) < 0); // toplam akış negatifse İVO negatiftir
});

test('Geri ödeme: yıl içi doğrusal ara değer ve iskontolu sürüm', () => {
  near(payback([-100, 40, 40, 40]), 2.5);
  assert.equal(payback([0, 10]), 0);
  const d = payback([-100, 40, 40, 40, 40], 0.1);
  assert.ok(d > 2.5 && d < 4);
});

test('Üçgen dağılım sınırları korur', () => {
  for (let u = 0; u <= 1; u += 0.05) {
    const x = triangular(u, 10, 20, 40);
    assert.ok(x >= 10 && x <= 40);
  }
  near(triangular(0.5, 0, 5, 10), 5);
});

for (const model of MODELS) {
  test(`${model.name}: varsayılan değerlerle tutarlı sonuç`, () => {
    const values = defaultValues(model.inputs);
    const res = evaluate(model, values, globals);
    assert.equal(res.fin.flows.length, values.life + 1);
    assert.ok(Number.isFinite(res.fin.npv) && Number.isFinite(res.eco.npv));
    assert.ok(res.investment > 0 && res.co2 >= 0);
    // Hibe mali NBD'yi artırır, toplumsal NBD'yi değiştirmez (transfer)
    const withGrant = evaluate(model, { ...values, grant: 1_000_000 }, globals);
    near(withGrant.fin.npv - res.fin.npv, 1_000_000);
    near(withGrant.eco.npv, res.eco.npv);
    // Maliyet aşımı her iki NBD'yi de düşürür
    const over = evaluate(model, values, globals, { costFactor: 1.2 });
    assert.ok(over.fin.npv < res.fin.npv && over.eco.npv < res.eco.npv);
  });

  test(`${model.name}: belirsizlik ve duyarlılık analizi`, () => {
    const values = defaultValues(model.inputs);
    const mc = monteCarlo(model, values, globals, { runs: 300 });
    assert.ok(mc.fin.pPositive >= 0 && mc.fin.pPositive <= 1);
    assert.ok(mc.fin.p10 <= mc.fin.p50 && mc.fin.p50 <= mc.fin.p90);
    // Aynı tohumla aynı sonuç
    assert.deepEqual(monteCarlo(model, values, globals, { runs: 50 }).fin.p50, monteCarlo(model, values, globals, { runs: 50 }).fin.p50);
    const t = tornado(model, values, globals, model.primary);
    assert.equal(t.rows.length, uncertainParams(model).length);
    for (let i = 1; i < t.rows.length; i++) assert.ok(t.rows[i - 1].swing >= t.rows[i].swing);
  });
}

test('Aydınlatma: enerji hesabı elle hesapla aynı', () => {
  const m = MODELS.find(x => x.id === 'aydinlatma');
  const v = defaultValues(m.inputs);
  const res = evaluate(m, v, globals);
  const kwh0 = 5000 * 0.16 * 4100;
  const saved = kwh0 * (1 - 0.45 * 0.8);
  near(res.lines[0].value, saved * 4.5);
  near(res.co2, saved * 0.44 / 1000);
  near(res.investment, 5000 * 11000 + 1_500_000);
});

test('Su: idari kayıp geliri mali analizde var, toplumsal analizde transfer', () => {
  const m = MODELS.find(x => x.id === 'su');
  const v = defaultValues(m.inputs);
  const res = evaluate(m, v, globals);
  const transfer = res.lines.find(l => l.kind === 'transfer').value;
  const social = res.lines.filter(l => l.kind === 'social').reduce((s, l) => s + l.value, 0);
  near(res.year1.cashNet - transfer + social + res.co2Value, res.year1.ecoNet);
});

test('Başabaş: bulunan değerde NBD sıfır', () => {
  const m = MODELS.find(x => x.id === 'atik');
  const v = defaultValues(m.inputs);
  const p = uncertainParams(m).find(x => x.key === 'kmRed');
  const x = breakEven(m, v, globals, p, 'fin', 0, 100);
  assert.ok(x > 0 && x < v.kmRed);
  near(evaluate(m, { ...v, kmRed: x }, globals).fin.npv, 0, 1e-4);
});
