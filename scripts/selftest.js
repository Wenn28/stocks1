// Pastikan setiap pola yang ditanam generator terdeteksi, dan saham tanpa pola tidak memicu sinyal.
import assert from 'node:assert/strict';
import { generate } from '../src/sample.js';
import { buildCandles, orderBlocks } from '../src/candles.js';
import { detectBrokerPatterns, volumeSpike, volumeSpikeIntraday, detectCrossing, suspectedGroups } from '../src/patterns.js';

const { dates, stocks } = generate();
const lastDay = dates.at(-1);
const find = (code, broker, groups) => detectBrokerPatterns(stocks[code], dates, 20, groups).find((x) => x.broker === broker);

const ak = find('ZZAK', 'Q1');
assert.equal(ak?.side, 'akumulasi');
assert.ok(ak.masif && ak.silent, 'Q1 harus Akumulasi Masif + Silent');

const ds = find('ZZDS', 'Q2');
assert.equal(ds?.side, 'distribusi');
assert.ok(ds.masif && !ds.silent, 'Q2 harus Distribusi Masif, bukan Silent (harga turun)');

assert.ok(find('ZZDS', 'Q5')?.penampung, 'Q5 harus Penampung');
assert.deepEqual(detectBrokerPatterns(stocks.ZZNO, dates, 20).filter((p) => p.penampung || p.masif), [], 'ZZNO tanpa Penampung/Masif');

for (const code in stocks) {
  assert.ok(!detectBrokerPatterns(stocks[code], dates, 20).some((p) => p.masif && p.pasif), `${code}: Masif tidak boleh Pasif`);
}

const cr = detectCrossing(stocks.ZZCR[lastDay]).find((c) => c.a === 'Q3' && c.b === 'Q4');
assert.ok(cr && !cr.strict, 'Q3/Q4 Crossing harian, bukan Ketat');
assert.ok(detectCrossing(stocks.ZZCR[dates.at(-4)]).find((c) => c.a === 'Q6' && c.b === 'Q7')?.strict, 'Q6/Q7 harus Crossing Ketat');
assert.equal(dates.slice(-20).flatMap((d) => detectCrossing(stocks.ZZNO[d])).length, 0, 'ZZNO tanpa Crossing 20 hari');

assert.deepEqual(suspectedGroups(stocks, dates).map((g) => g.name).sort(), ['Q3 + Q4', 'Q6 + Q7'], 'hanya pasangan Crossing yang jadi Kelompok Dugaan');

const grp = find('ZZAK', 'Q1 + QA', [{ name: 'Q1 + QA', members: ['Q1', 'QA'], kind: 'pribadi' }]);
assert.ok(grp?.masif && grp.kind === 'pribadi', 'Kelompok dihitung sebagai satu baris');

assert.equal(volumeSpike(stocks.ZZSP, dates, lastDay).spike, true, 'ZZSP harus Lonjakan Volume');
assert.equal(volumeSpike(stocks.ZZNO, dates, lastDay).spike, false, 'ZZNO tanpa Lonjakan Volume');
assert.equal(volumeSpike(stocks.ZZNO, dates, dates[5]), null, 'riwayat < 20 hari');
assert.equal(volumeSpikeIntraday(stocks.ZZSP, dates, lastDay, '11:00:00').spike, true, 'ZZSP Lonjakan Intraday sejak pagi');
assert.equal(volumeSpikeIntraday(stocks.ZZNO, dates, lastDay, '11:00:00').spike, false, 'ZZNO tanpa Lonjakan Intraday');

// Candle per Timeframe
const d1 = buildCandles(stocks.ZZNO, dates, 1440);
assert.equal(d1.length, dates.length, '1D: satu candle per hari');
assert.equal(d1.at(-1).volume, stocks.ZZNO[lastDay].reduce((a, r) => a + r[2], 0), 'volume candle = total lot');
const m5 = buildCandles(stocks.ZZNO, [lastDay], 5);
assert.ok(m5.every((k) => k.low <= Math.min(k.open, k.close) && k.high >= Math.max(k.open, k.close)), 'OHLC konsisten');
assert.deepEqual(buildCandles(stocks.ZZNO, [lastDay], 240).map((k) => new Date(k.time * 1000).getUTCHours()), [9, 13], '4 jam mulai 09:00 dan 13:00');

// Order Block dari candle buatan: swing high 110, candle turun, lalu close tembus 110.
const k = (open, high, low, close) => ({ open, high, low, close });
const seq = [k(100, 101, 99, 100), k(100, 105, 99, 104), k(104, 110, 103, 108), k(108, 109, 104, 105),
  k(105, 106, 100, 101), k(101, 104, 98, 103), k(103, 112, 102, 111), k(111, 113, 108, 112)];
const ob = orderBlocks(seq, { swing: 2 });
assert.deepEqual(ob.map((b) => [b.type, b.i, b.bottom, b.top]), [['bull', 4, 100, 106]], 'bull OB = candle turun terakhir sebelum tembus');
const hitWick = [...seq, k(112, 112, 99, 105)]; // wick menembus bawah blok, close tidak
assert.equal(orderBlocks(hitWick, { swing: 2, mitigation: 'wick' }).length, 0, 'mitigasi wick');
assert.equal(orderBlocks(hitWick, { swing: 2, mitigation: 'close' }).length, 1, 'mitigasi close belum kena');

console.log('selftest OK');
