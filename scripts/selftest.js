// Pastikan setiap pola yang ditanam generator terdeteksi, dan saham tanpa pola tidak memicu sinyal.
import assert from 'node:assert/strict';
import { generate } from './generate.js';
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

console.log('selftest OK');
