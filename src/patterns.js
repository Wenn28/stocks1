// Pola Broker dihitung dari Done Detail. Definisi setiap istilah ada di GLOSSARY.md.
// Satu baris Done Detail: [waktu "HH:MM:SS", harga, lot, broker pembeli, broker penjual], urut waktu.

export const RULES = {
  masifDays: 5,        // net beruntun minimal 5 hari bursa
  pasifShare: 0.05,    // net harian rata-rata < 5% volume harian rata-rata
  sidewaysRange: 0.05, // (tertinggi - terendah) / terendah <= 5%
  spikeMult: 3.5,      // Lonjakan Volume: >= 3,5x rata-rata
  spikeLookback: 20,   // rata-rata 20 hari bursa sebelumnya
  crossDiff: 0.10,     // selisih lot bolak-balik <= 10%
  crossShare: 0.05,    // total bolak-balik >= 5% volume harian
};

const P = 1, L = 2, B = 3, S = 4;

export function brokerSummary(rows) {
  const sum = {};
  const get = (code) => (sum[code] ??= { buyLot: 0, buyVal: 0, sellLot: 0, sellVal: 0 });
  for (const r of rows) {
    const b = get(r[B]); b.buyLot += r[L]; b.buyVal += r[L] * r[P];
    const s = get(r[S]); s.sellLot += r[L]; s.sellVal += r[L] * r[P];
  }
  return sum;
}

export function dayStats(rows) {
  let vol = 0, hi = -Infinity, lo = Infinity;
  for (const r of rows) { vol += r[L]; hi = Math.max(hi, r[P]); lo = Math.min(lo, r[P]); }
  return { vol, hi, lo, last: rows.length ? rows[rows.length - 1][P] : null };
}

// days: { "YYYY-MM-DD": rows }, dates: semua hari bursa urut naik, rentang: 5 | 20 | 60.
export function detectBrokerPatterns(days, dates, rentang) {
  const win = dates.slice(-rentang);
  const sums = win.map((d) => brokerSummary(days[d] ?? []));
  const stats = win.map((d) => dayStats(days[d] ?? []));
  const last = stats.findLast((s) => s.vol > 0)?.last;
  if (last == null) return [];
  const avgVol = stats.reduce((a, s) => a + s.vol, 0) / win.length;

  const out = [];
  for (const broker of new Set(sums.flatMap(Object.keys))) {
    let buyLot = 0, buyVal = 0, sellLot = 0, sellVal = 0;
    const net = sums.map((s) => {
      const x = s[broker];
      if (!x) return 0;
      buyLot += x.buyLot; buyVal += x.buyVal; sellLot += x.sellLot; sellVal += x.sellVal;
      return x.buyLot - x.sellLot;
    });
    const netLot = buyLot - sellLot;
    const avgBuy = buyLot ? buyVal / buyLot : null;
    const avgSell = sellLot ? sellVal / sellLot : null;

    let side = null;
    if (netLot > 0 && avgBuy < last) side = 'akumulasi';
    else if (netLot < 0 && avgSell > last) side = 'distribusi';
    if (!side) continue;

    const sign = side === 'akumulasi' ? 1 : -1;
    let streak = 0;
    for (let i = net.length - 1; i >= 0 && sign * net[i] > 0; i--) streak++;
    const masif = streak >= RULES.masifDays;
    const pasif = Math.abs(netLot) / win.length < RULES.pasifShare * avgVol;

    let silent = false;
    if (masif) {
      const traded = stats.slice(-streak).filter((s) => s.vol > 0);
      const hi = Math.max(...traded.map((s) => s.hi));
      const lo = Math.min(...traded.map((s) => s.lo));
      silent = (hi - lo) / lo <= RULES.sidewaysRange;
    }
    out.push({ broker, side, netLot, avgBuy, avgSell, streak, masif, pasif, silent });
  }
  return out.sort((a, b) => Math.abs(b.netLot) - Math.abs(a.netLot));
}

export function volumeSpike(days, dates, date) {
  const i = dates.indexOf(date);
  if (i < RULES.spikeLookback) return null; // riwayat kurang dari 20 hari
  const vol = (d) => dayStats(days[d] ?? []).vol;
  const avg = dates.slice(i - RULES.spikeLookback, i).reduce((a, d) => a + vol(d), 0) / RULES.spikeLookback;
  const v = vol(date);
  return { vol: v, avg, ratio: avg ? v / avg : null, spike: avg > 0 && v >= RULES.spikeMult * avg };
}

// Crossing dalam satu hari: A jual ke B dan B jual ke A, seimbang, dan cukup besar.
export function detectCrossing(rows) {
  const flow = {};
  let vol = 0;
  for (const r of rows) {
    vol += r[L];
    const k = r[S] + '>' + r[B];
    flow[k] = (flow[k] ?? 0) + r[L];
  }
  const out = [];
  for (const [k, aToB] of Object.entries(flow)) {
    const [a, b] = k.split('>');
    if (a >= b) continue; // tiap pasangan sekali; a === b bukan Crossing antar Broker
    const bToA = flow[b + '>' + a];
    if (!bToA) continue;
    const big = Math.max(aToB, bToA);
    if ((big - Math.min(aToB, bToA)) / big <= RULES.crossDiff && aToB + bToA >= RULES.crossShare * vol) {
      out.push({ a, b, aToB, bToA, share: (aToB + bToA) / vol });
    }
  }
  return out;
}
