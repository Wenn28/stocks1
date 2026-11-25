// Pola Broker dihitung dari Done Detail. Definisi setiap istilah ada di GLOSSARY.md.
// Satu baris Done Detail: [waktu "HH:MM:SS", harga, lot, broker pembeli, broker penjual], urut waktu.

export const RULES = {
  masifShare: 0.8,     // Masif: net searah di >= 80% hari dalam Rentang
  pasifShare: 0.05,    // net harian rata-rata < 5% volume harian rata-rata
  sidewaysRange: 0.05, // (tertinggi - terendah) / terendah <= 5%
  spikeMult: 3.5,      // Lonjakan Volume: >= 3,5x rata-rata
  spikeLookback: 20,   // rata-rata 20 hari bursa sebelumnya
  crossDiff: 0.10,     // selisih lot bolak-balik <= 10%
  crossShare: 0.05,    // total bolak-balik >= 5% volume harian
  strictMinutes: 15,   // Crossing Ketat: bolak-balik dalam irisan 15 menit
  dugaanDays: 60,      // Kelompok Dugaan dicari dari Crossing 60 hari bursa terakhir
};

const T = 0, P = 1, L = 2, B = 3, S = 4;

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
  let vol = 0, val = 0, hi = -Infinity, lo = Infinity;
  for (const r of rows) { vol += r[L]; val += r[L] * r[P]; hi = Math.max(hi, r[P]); lo = Math.min(lo, r[P]); }
  return { vol, hi, lo, vwap: vol ? val / vol : null, last: rows.length ? rows[rows.length - 1][P] : null };
}

// days: { "YYYY-MM-DD": rows }, dates: semua hari bursa urut naik, rentang: 5 | 20 | 60.
// groups: [{ name, members: [kode Broker], kind: 'resmi' | 'pribadi' | 'dugaan' }], dihitung sebagai satu baris tambahan.
export function detectBrokerPatterns(days, dates, rentang, groups = []) {
  const start = Math.max(0, dates.length - rentang);
  const win = dates.slice(start);
  const rowsOf = (d) => days[d] ?? [];
  const sums = win.map((d) => brokerSummary(rowsOf(d)));
  const stats = win.map((d) => dayStats(rowsOf(d)));
  const last = stats.findLast((s) => s.vol > 0)?.last;
  if (last == null) return [];
  const avgVol = stats.reduce((a, s) => a + s.vol, 0) / win.length;

  const traded = stats.filter((s) => s.vol > 0);
  const lo = Math.min(...traded.map((s) => s.lo));
  const sideways = (Math.max(...traded.map((s) => s.hi)) - lo) / lo <= RULES.sidewaysRange;

  // Hari turun: penutupan di bawah penutupan hari bursa sebelumnya (hari pertama dibanding hari sebelum Rentang).
  let prev = start > 0 ? dayStats(rowsOf(dates[start - 1])).last : null;
  const down = stats.map((s) => {
    const d = prev != null && s.last != null && s.last < prev;
    if (s.last != null) prev = s.last;
    return d;
  });
  const downDays = down.filter(Boolean).length;
  const belowVwap = win.map((d, i) => {
    const m = {};
    for (const r of rowsOf(d)) if (r[P] < stats[i].vwap) m[r[B]] = (m[r[B]] ?? 0) + r[L];
    return m;
  });

  const entities = [...new Set(sums.flatMap(Object.keys))].map((b) => ({ name: b, members: [b], kind: null }))
    .concat(groups.map((g) => ({ name: g.name, members: g.members, kind: g.kind })));

  const out = [];
  for (const e of entities) {
    let buyLot = 0, buyVal = 0, sellLot = 0, sellVal = 0, below = 0;
    const net = sums.map((s, i) => {
      let n = 0;
      for (const m of e.members) {
        const x = s[m];
        if (!x) continue;
        buyLot += x.buyLot; buyVal += x.buyVal; sellLot += x.sellLot; sellVal += x.sellVal;
        below += belowVwap[i][m] ?? 0;
        n += x.buyLot - x.sellLot;
      }
      return n;
    });
    if (!buyLot && !sellLot) continue; // anggota Kelompok tidak bertransaksi di saham ini
    const netLot = buyLot - sellLot;
    const avgBuy = buyLot ? buyVal / buyLot : null;
    const avgSell = sellLot ? sellVal / sellLot : null;

    let side = null;
    if (netLot > 0 && avgBuy < last) side = 'akumulasi';
    else if (netLot < 0 && avgSell > last) side = 'distribusi';

    const pasif = Math.abs(netLot) / win.length < RULES.pasifShare * avgVol;
    const sign = side === 'distribusi' ? -1 : 1;
    const daysSame = net.filter((n) => sign * n > 0).length;
    const masif = side != null && !pasif && daysSame >= RULES.masifShare * win.length;
    const silent = masif && sideways;
    // shortcut: Penampung juga mensyaratkan bukan Pasif agar Broker kecil tidak ikut tertandai, sama seperti Masif.
    const penampung = !pasif && downDays > 0
      && net.filter((n, i) => down[i] && n > 0).length >= downDays / 2
      && below > buyLot / 2;
    if (!side && !penampung) continue;

    out.push({ broker: e.name, kind: e.kind, members: e.members, side, netLot, avgBuy, avgSell,
      daysSame, days: win.length, masif, pasif, silent, penampung });
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

// Lonjakan Volume Intraday: volume sampai jam `time` dibanding rata-rata volume sampai jam yang sama.
export function volumeSpikeIntraday(days, dates, date, time) {
  const i = dates.indexOf(date);
  if (i < RULES.spikeLookback) return null;
  const vol = (d) => (days[d] ?? []).reduce((a, r) => (r[T] <= time ? a + r[L] : a), 0);
  const avg = dates.slice(i - RULES.spikeLookback, i).reduce((a, d) => a + vol(d), 0) / RULES.spikeLookback;
  const v = vol(date);
  return { vol: v, avg, ratio: avg ? v / avg : null, spike: avg > 0 && v >= RULES.spikeMult * avg };
}

function flowOf(rows) {
  const flow = {};
  for (const r of rows) flow[r[S] + '>' + r[B]] = (flow[r[S] + '>' + r[B]] ?? 0) + r[L];
  return flow;
}

function balancedPairs(flow, dayVol) {
  const out = [];
  for (const [k, aToB] of Object.entries(flow)) {
    const [a, b] = k.split('>');
    if (a >= b) continue; // tiap pasangan sekali; a === b bukan Crossing antar Broker
    const bToA = flow[b + '>' + a];
    if (!bToA) continue;
    const big = Math.max(aToB, bToA);
    if ((big - Math.min(aToB, bToA)) / big <= RULES.crossDiff && aToB + bToA >= RULES.crossShare * dayVol) {
      out.push({ a, b, aToB, bToA, share: (aToB + bToA) / dayVol });
    }
  }
  return out;
}

// Crossing satu hari. strict = bolak-balik juga terjadi dalam satu irisan 15 menit (Crossing Ketat).
export function detectCrossing(rows) {
  const vol = rows.reduce((a, r) => a + r[L], 0);
  const found = new Map(balancedPairs(flowOf(rows), vol).map((c) => [c.a + c.b, { ...c, strict: false }]));
  const slices = {};
  for (const r of rows) {
    const k = Math.floor((Number(r[T].slice(0, 2)) * 60 + Number(r[T].slice(3, 5))) / RULES.strictMinutes);
    (slices[k] ??= []).push(r);
  }
  for (const part of Object.values(slices)) {
    for (const c of balancedPairs(flowOf(part), vol)) {
      const f = found.get(c.a + c.b);
      if (f) f.strict = true;
      else found.set(c.a + c.b, { ...c, strict: true });
    }
  }
  return [...found.values()];
}

// Kelompok Dugaan: setiap pasangan Broker yang tertangkap Crossing bersama di saham mana pun.
export function suspectedGroups(stocks, dates) {
  const seen = new Map();
  for (const days of Object.values(stocks)) {
    for (const d of dates.slice(-RULES.dugaanDays)) {
      for (const c of detectCrossing(days[d] ?? [])) {
        seen.set(c.a + '+' + c.b, { name: `${c.a} + ${c.b}`, members: [c.a, c.b], kind: 'dugaan' });
      }
    }
  }
  return [...seen.values()];
}
