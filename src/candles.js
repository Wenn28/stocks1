// Candle per Timeframe dan Order Block, dihitung dari Done Detail. Definisi Order Block ada di GLOSSARY.md.
import { brokerSummary, dayStats } from './patterns.js';

const OPEN_MIN = 9 * 60; // irisan dihitung dari pembukaan 09:00 WIB, jadi candle 4 jam = 09:00 dan 13:00

// tf dalam menit; 1440 = 1 hari. time = detik UTC yang angkanya sama dengan jam WIB, agar label grafik terbaca WIB.
export function buildCandles(days, dates, tf) {
  const out = [];
  for (const date of dates) {
    const [y, m, d] = date.split('-').map(Number);
    const buckets = new Map();
    for (const r of days[date] ?? []) {
      const min = Number(r[0].slice(0, 2)) * 60 + Number(r[0].slice(3, 5));
      const start = tf >= 1440 ? 0 : OPEN_MIN + Math.floor((min - OPEN_MIN) / tf) * tf;
      if (!buckets.has(start)) buckets.set(start, []);
      buckets.get(start).push(r);
    }
    for (const [start, rows] of [...buckets].sort((a, b) => a[0] - b[0])) {
      const s = dayStats(rows);
      out.push({ time: Date.UTC(y, m - 1, d, 0, start) / 1000, date, open: rows[0][1], high: s.hi, low: s.lo,
        close: s.last, volume: s.vol, vwap: s.vwap, rows });
    }
  }
  return out;
}

const isPivot = (c, i, n, key, cmp) => {
  for (let j = i - n; j <= i + n; j++) if (j !== i && !cmp(c[i][key], c[j][key])) return false;
  return true;
};

// Order Block: candle berlawanan terakhir sebelum close menembus swing high/low terakhir.
// opts: { swing, max, mitigation: 'wick' | 'close' }. Hanya blok yang belum dimitigasi yang dikembalikan.
export function orderBlocks(c, { swing = 5, max = 3, mitigation = 'wick' } = {}) {
  const blocks = [];
  let hi = null, lo = null;
  for (let t = 0; t < c.length; t++) {
    const p = t - swing; // pivot baru terkonfirmasi setelah `swing` candle di kanannya
    if (p >= swing) {
      if (isPivot(c, p, swing, 'high', (a, b) => a > b)) hi = { i: p, price: c[p].high };
      if (isPivot(c, p, swing, 'low', (a, b) => a < b)) lo = { i: p, price: c[p].low };
    }
    if (hi && c[t].close > hi.price) {
      for (let k = t - 1; k >= hi.i; k--) {
        if (c[k].close < c[k].open) { blocks.push({ type: 'bull', i: k, formed: t, top: c[k].high, bottom: c[k].low }); break; }
      }
      hi = null;
    }
    if (lo && c[t].close < lo.price) {
      for (let k = t - 1; k >= lo.i; k--) {
        if (c[k].close > c[k].open) { blocks.push({ type: 'bear', i: k, formed: t, top: c[k].high, bottom: c[k].low }); break; }
      }
      lo = null;
    }
  }
  const alive = blocks.filter((b) => {
    for (let j = b.formed + 1; j < c.length; j++) {
      const x = c[j];
      if (b.type === 'bull' && (mitigation === 'wick' ? x.low : x.close) < b.bottom) return false;
      if (b.type === 'bear' && (mitigation === 'wick' ? x.high : x.close) > b.top) return false;
    }
    return true;
  });
  return ['bull', 'bear'].flatMap((t) => alive.filter((b) => b.type === t).slice(-max));
}

// Isi data satu Order Block: avg harga, volume, umur hari bursa, dan Broker dengan net terbesar di candle itu.
export function blockInfo(c, b, dates) {
  const k = c[b.i];
  const sum = Object.entries(brokerSummary(k.rows)).map(([code, x]) => [code, x.buyLot - x.sellLot]);
  const [broker, net] = sum.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0] ?? [null, 0];
  return { avg: k.vwap, volume: k.volume, ageDays: dates.length - 1 - dates.indexOf(k.date), broker, net };
}
