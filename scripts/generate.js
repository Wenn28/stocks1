// DATA CONTOH: Done Detail palsu dengan pola yang sengaja ditanam. Kode saham dan Broker fiktif.
// Format baris sama dengan src/patterns.js agar nanti tinggal ganti sumber ke feed IDX.
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function rng(seed) { // mulberry32: deterministik agar self-test stabil
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tick = (p) => (p < 200 ? 1 : p < 500 ? 2 : p < 2000 ? 5 : p < 5000 ? 10 : 25);
const roundTick = (p) => Math.round(p / tick(p)) * tick(p);

function tradingDays(endISO, n) {
  const out = [];
  const d = new Date(endISO + 'T00:00:00Z');
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out; // shortcut: hari libur bursa tidak dilewati, cukup untuk data contoh
}

// 40 Broker noise: dengan terlalu sedikit Broker, pasangan acak sering lolos syarat Crossing.
const NOISE = [...'ABCDEFGHJKLMNPRSTUVW'].flatMap((c) => ['Q' + c, 'R' + c]);

export function generate({ seed = 7, end = '2026-11-23', nDays = 80 } = {}) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const dates = tradingDays(end, nDays);
  const time = () => { // sesi I 09:00-12:00, sesi II 13:30-15:50
    const sec = Math.floor(r() * (180 + 140) * 60);
    const s = sec < 180 * 60 ? 9 * 3600 + sec : 13.5 * 3600 + sec - 180 * 60;
    return [s / 3600, (s % 3600) / 60, s % 60].map((x) => String(Math.floor(x)).padStart(2, '0')).join(':');
  };
  const noisePair = () => { const b = pick(NOISE); let s; do s = pick(NOISE); while (s === b); return [b, s]; };

  const stocks = {};
  const plan = { ZZAK: 1000, ZZDS: 1500, ZZCR: 800, ZZSP: 600, ZZNO: 2500 };
  for (const [code, start] of Object.entries(plan)) {
    let base = start;
    stocks[code] = {};
    dates.forEach((date, i) => {
      const fromEnd = dates.length - 1 - i;
      if (code === 'ZZAK' && fromEnd < 20) base = start;                  // sideways saat Silent Akumulasi
      else if (code === 'ZZDS' && fromEnd < 20) base = roundTick(base * 0.995); // turun setiap hari saat distribusi
      else base = roundTick(base * (1 + (r() - 0.5) * 0.02));

      const rows = [];
      const n = code === 'ZZSP' && fromEnd === 0 ? 480 : 120;           // Lonjakan Volume hari terakhir
      for (let k = 0; k < n; k++) {
        const [b, s] = noisePair();
        rows.push([time(), roundTick(base + (Math.floor(r() * 3) - 1) * tick(base)), 1 + Math.floor(r() ** 2 * 200), b, s]);
      }
      if (code === 'ZZAK' && fromEnd < 20) {
        for (let k = 0; k < 20; k++) rows.push([time(), base - 2 * tick(base), 100 + Math.floor(r() * 200), 'Q1', pick(NOISE)]);
      }
      if (code === 'ZZDS' && fromEnd < 20) {
        for (let k = 0; k < 20; k++) rows.push([time(), base + 2 * tick(base), 100 + Math.floor(r() * 200), pick(NOISE), 'Q2']);
        // Q5 Penampung: menampung di bawah VWAP setiap hari harga turun
        for (let k = 0; k < 10; k++) rows.push([time(), base - 2 * tick(base), 100 + Math.floor(r() * 100), 'Q5', pick(NOISE)]);
      }
      if (code === 'ZZCR' && fromEnd === 0) {
        for (let k = 0; k < 10; k++) rows.push([time(), base, 100, 'Q4', 'Q3']); // Q3 jual ke Q4: 1000 lot
        for (let k = 0; k < 10; k++) rows.push([time(), base, 95, 'Q3', 'Q4']);  // Q4 jual ke Q3: 950 lot
      }
      if (code === 'ZZCR' && fromEnd === 3) { // Crossing Ketat: semua bolak-balik di 10:00-10:14
        for (let k = 0; k < 5; k++) rows.push([`10:0${k}:00`, base, 200, 'Q7', 'Q6']);
        for (let k = 0; k < 5; k++) rows.push([`10:1${k}:00`, base, 190, 'Q6', 'Q7']);
      }
      rows.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
      rows.push(['15:50:00', base, 1 + Math.floor(r() * 50), ...noisePair()]); // penutupan di harga dasar
      stocks[code][date] = rows;
    });
  }
  return { note: 'DATA CONTOH: bukan data pasar sungguhan.', dates, stocks };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../data/sample.json', import.meta.url), JSON.stringify(generate()));
  console.log('data/sample.json ditulis');
}
