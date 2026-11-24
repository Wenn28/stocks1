// Pastikan setiap pola yang ditanam generator terdeteksi, dan saham tanpa pola tidak memicu Lonjakan Volume.
import assert from 'node:assert/strict';
import { generate } from './generate.js';
import { detectBrokerPatterns, volumeSpike, detectCrossing } from '../src/patterns.js';

const { dates, stocks } = generate();
const lastDay = dates.at(-1);
const find = (code, broker) => detectBrokerPatterns(stocks[code], dates, 20).find((x) => x.broker === broker);

const ak = find('ZZAK', 'Q1');
assert.equal(ak?.side, 'akumulasi');
assert.ok(ak.masif && ak.silent, 'Q1 harus Akumulasi Masif + Silent');

const ds = find('ZZDS', 'Q2');
assert.equal(ds?.side, 'distribusi');
assert.ok(ds.masif && !ds.silent, 'Q2 harus Distribusi Masif, bukan Silent (harga turun)');

const cr = detectCrossing(stocks.ZZCR[lastDay]);
assert.ok(cr.some((c) => c.a === 'Q3' && c.b === 'Q4'), 'Q3/Q4 harus Crossing');
assert.equal(detectCrossing(stocks.ZZNO[lastDay]).length, 0, 'ZZNO tanpa Crossing');

assert.equal(volumeSpike(stocks.ZZSP, dates, lastDay).spike, true, 'ZZSP harus Lonjakan Volume');
assert.equal(volumeSpike(stocks.ZZNO, dates, lastDay).spike, false, 'ZZNO tanpa Lonjakan Volume');
assert.equal(volumeSpike(stocks.ZZNO, dates, dates[5]), null, 'riwayat < 20 hari');

console.log('selftest OK');
