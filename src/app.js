import { detectBrokerPatterns, detectCrossing, volumeSpike, volumeSpikeIntraday, dayStats, suspectedGroups } from './patterns.js';
import { buildCandles, orderBlocks, blockInfo } from './candles.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('id-ID', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stored = (key, def) => {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(def) ? (Array.isArray(v) ? v : def) : { ...def, ...v }; } catch { return def; }
};

const TF = [[5, '5m'], [10, '10m'], [15, '15m'], [30, '30m'], [240, '4j'], [1440, '1D']];
const RENTANG = [5, 20, 60];
const PATTERNS = [
  ['Silent Akumulasi', 'Akumulasi Masif saat harga Sideways selama Rentang', (p) => p.silent && p.side === 'akumulasi'],
  ['Akumulasi Masif', 'Net beli di minimal 80% hari, bukan Pasif', (p) => p.masif && p.side === 'akumulasi'],
  ['Akumulasi Pasif', 'Rata-rata net beli harian di bawah 5% volume harian', (p) => p.pasif && p.side === 'akumulasi' && !p.kind],
  ['Distribusi Masif', 'Net jual di minimal 80% hari, bukan Pasif', (p) => p.masif && p.side === 'distribusi'],
  ['Distribusi Pasif', 'Rata-rata net jual harian di bawah 5% volume harian', (p) => p.pasif && p.side === 'distribusi' && !p.kind],
  ['Penampung', 'Net beli di hari turun, sebagian besar di bawah VWAP', (p) => p.penampung],
];
const SPIKE = 'Lonjakan Volume Intraday';
const ALL = 'Semua pola';
// Tab di Ringkasan Pasar: dua daftar teratas dari glossary, ditambah pola Scanner yang paling sering dicari.
const TOP = [['akumulasi', 'Paling diakumulasi'], ['distribusi', 'Paling didistribusi'], ['Silent Akumulasi', 'Silent Akumulasi'], ['Penampung', 'Penampung'], [SPIKE, 'Lonjakan Volume']];

const state = { data: null, view: 'ringkasan', stock: null, rentang: 20, tf: 1440, ihsgTf: 1440, ihsgKind: 'area', pola: ALL, top: 'akumulasi',
  groups: {}, candles: [], blocks: [], showPasif: false };
const ob = stored('ob', { on: true, swing: 5, max: 3, mitigation: 'wick', bull: '#10B981', bear: '#F43F5E', avg: true, volume: true, age: true, broker: true });
const scan = stored('scan', { time: '11:00:00' });
let watch = stored('watch', []);
let chart, candleSeries, volSeries, ihsgChart, ihsgArea, ihsgCandle, ihsgVol, attempt = 0;

// Data contoh tidak berubah selama halaman terbuka, jadi setiap hasil hitung disimpan dan dipakai ulang.
const memo = new Map();
const cached = (key, fn) => {
  let v = memo.get(key);
  if (v === undefined) memo.set(key, (v = fn()));
  return v;
};
const codes = () => Object.keys(state.data.stocks);
const lastDate = () => state.data.dates.at(-1);
const crossingOf = (code, date) => cached(`x|${code}|${date}`, () => detectCrossing(state.data.stocks[code][date] ?? []));
const candlesOf = (code, tf) => cached(`c|${code}|${tf}`, () => buildCandles(state.data.stocks[code], state.data.dates, tf));

function show(which) {
  for (const id of ['loading', 'error']) $('#' + id).hidden = id !== which;
  if (which !== 'ready') for (const v of $$('.view')) v.hidden = true;
}

async function load() {
  show('loading');
  try {
    // import dinamis + query baru tiap percobaan, agar tombol "Muat ulang" benar-benar mencoba lagi
    const { generate } = await import(`./sample.js?r=${attempt++}`);
    if (!window.LightweightCharts) throw new Error('library grafik tidak termuat');
    memo.clear();
    state.data = generate();
    state.groups = suspectedGroups(state.data.stocks, state.data.dates, crossingOf);
    watch = watch.filter((c) => state.data.stocks[c]);
    $('#codes').innerHTML = codes().map((c) => `<option value="${esc(c)}"></option>`).join('');
    show('ready');
    chart ??= initChart();
    ihsgChart ??= initIhsgChart();
    renderTicker();
    route();
    performance.mark('stocks1-ready'); // waktu sampai halaman siap dipakai, untuk pengukuran
  } catch {
    show('error');
  }
}

function analyse(code) {
  return cached(`a|${code}|${state.rentang}`, () => {
    const { dates, stocks } = state.data;
    const days = stocks[code];
    const win = dates.slice(-state.rentang);
    const today = dayStats(days[dates.at(-1)] ?? []);
    const prev = dayStats(days[dates.at(-2)] ?? []).last;
    return {
      patterns: detectBrokerPatterns(days, dates, state.rentang, state.groups[code] ?? []),
      crossing: win.flatMap((d) => crossingOf(code, d).map((c) => ({ ...c, date: d }))),
      spike: volumeSpike(days, dates, dates.at(-1)),
      last: today.last,
      change: prev ? today.last / prev - 1 : null,
      from: win[0], to: win.at(-1),
    };
  });
}

// --- Potongan HTML ---

const avatar = (code, big = '') => `<span class="avatar ${big}" aria-hidden="true">${esc(code.slice(0, 2))}</span>`;
const bk = (code) => `<span class="bk">${esc(code)}</span>`;
const boxes = (p) => p.members.map(bk).join(' + ');
const lot = (n) => (n > 0 ? '+' : '') + fmt.format(n);
const chgTag = (x) => (x == null ? '' : `<span class="tag ${x > 0 ? 'tag-up' : x < 0 ? 'tag-down' : 'tag-gray'}">${pct.format(x)}</span>`);
const priceStack = (a, big = '') => `<span class="price-stack ${big}"><b>${fmt.format(a.last)}</b>${chgTag(a.change)}</span>`;
const emiten = (code, sub) => `<span class="emiten">${avatar(code)}<span><b>${esc(code)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></span>`;
const sentence = (code, p, withCode = true) => `<span class="sentence">${withCode ? `<b>${esc(code)}</b>` : ''}${p.side === 'akumulasi' ? 'diakumulasi' : 'didistribusi'} ${boxes(p)}
  <span>${fmt.format(Math.abs(p.netLot))} lot, avg ${fmt.format(p.side === 'akumulasi' ? p.avgBuy : p.avgSell)}</span></span>`;
const buyers = (code) => analyse(code).patterns.filter((p) => !p.kind && p.netLot > 0).sort((a, b) => b.netLot - a.netLot).slice(0, 3);
const tampung = (code) => {
  const b = buyers(code);
  return b.length
    ? b.map((p) => `<li>${bk(p.broker)}<span class="lot-up">${lot(p.netLot)}</span><span class="sub">avg ${fmt.format(p.avgBuy)}</span></li>`).join('')
    : `<li class="muted">Tidak ada Broker net beli dalam ${state.rentang} hari terakhir.</li>`;
};
const labelOf = (code) => {
  const pats = analyse(code).patterns;
  const p = pats.find((q) => q.masif) ?? pats.find((q) => q.penampung);
  if (!p) return 'Tanpa sinyal kuat';
  if (!p.masif) return 'Penampung';
  return (p.silent ? 'Silent ' : '') + (p.side === 'akumulasi' ? 'Akumulasi' : 'Distribusi') + (p.silent ? '' : ' Masif');
};
function spark(code) {
  const v = candlesOf(code, 1440).slice(-20).map((k) => k.close);
  const hi = Math.max(...v), lo = Math.min(...v);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * 80).toFixed(1)},${(hi === lo ? 12 : 2 + ((hi - x) / (hi - lo)) * 20).toFixed(1)}`).join(' ');
  return `<svg class="spark ${v.at(-1) >= v[0] ? 'up' : 'down'}" viewBox="0 0 80 24" role="img" aria-label="Tren 20 hari ${v.at(-1) >= v[0] ? 'naik' : 'turun'}"><polyline points="${pts}"/></svg>`;
}
const rangeText = () => `${state.rentang} hari bursa sampai ${lastDate()}`;
const bar = (w, up, text) => `<span class="net"><span class="bar" aria-hidden="true"><i class="${up ? 'buy' : 'sell'}" style="--w:${w}"></i></span><b class="${up ? 'lot-up' : 'lot-down'}">${text}</b></span>`;
const starBtn = (code) => {
  const on = watch.includes(code);
  return `<button type="button" class="star" data-watch="${esc(code)}" aria-pressed="${on}" aria-label="Pantau ${esc(code)}"><span aria-hidden="true">${on ? '★' : '☆'}</span></button>`;
};
const patternSub = (p) => `${p.pasif ? 'Pasif' : p.masif ? 'Masif' : 'Penampung'}, net searah ${p.daysSame}/${p.days} hari`;
const tampungBlock = (code) => `<span class="sub">Ditampung oleh</span><ul class="tampung">${tampung(code)}</ul>`;

// Satu baris saham: kolom tabel di desktop, kartu di mobile. Link kode saham menutupi seluruh baris, tombol di ujung tetap bisa ditekan.
function stockRow(code, { sub = '', metric = '', body = '', end = starBtn(code) } = {}) {
  const a = analyse(code);
  return `<li><div class="row">
    <a class="emiten-link" href="#/saham/${esc(code)}">${emiten(code, sub)}</a>
    <span class="num price">${fmt.format(a.last)}</span>
    <span class="num chg">${chgTag(a.change)}</span>
    <span class="metric">${metric}</span>
    <span class="content">${body}</span>
    ${end}
  </div></li>`;
}

// compact: isi baris berupa "Ditampung oleh" (Scanner), bukan kalimat sinyal (Ringkasan).
function rowsHtml(items, compact) {
  const max = Math.max(1, ...items.map((x) => (x.p ? Math.abs(x.p.netLot) : x.s.ratio)));
  return items.map((x) => (x.s
    ? stockRow(x.code, { sub: 'Lonjakan Volume Intraday', metric: bar(x.s.ratio / max, true, `${dec1.format(x.s.ratio)}x`),
      body: `<span class="muted">Volume ${dec1.format(x.s.ratio)} kali rata-rata sampai ${scan.time.slice(0, 5)}</span>` })
    : stockRow(x.code, { sub: patternSub(x.p), metric: bar(Math.abs(x.p.netLot) / max, x.p.netLot > 0, lot(x.p.netLot)),
      body: compact ? tampungBlock(x.code) : sentence(x.code, x.p, false) }))).join('');
}

const listRows = (name) => (name === 'akumulasi' || name === 'distribusi' ? topSide(name) : scanRows(name));
function descOf(name) {
  if (name === SPIKE) return `Volume sejak pembukaan sampai ${scan.time.slice(0, 5)} dibanding rata-rata 20 hari sampai jam yang sama, ${lastDate()}`;
  if (name === 'akumulasi' || name === 'distribusi') return `Diurutkan menurut net lot Broker teratas, ${rangeText()}`;
  return `${PATTERNS.find(([n]) => n === name)[1]}. ${rangeText()}.`;
}
function emptyOf(name) {
  if (name === SPIKE) return 'Tidak ada saham dengan Lonjakan Volume Intraday di hari bursa terakhir.';
  if (name === 'akumulasi' || name === 'distribusi') return `Tidak ada ${name === 'akumulasi' ? 'Akumulasi' : 'Distribusi'} di luar Broker Pasif dalam ${state.rentang} hari terakhir. Coba Rentang lain.`;
  return `Tidak ada saham dengan pola ini dalam ${state.rentang} hari terakhir.`;
}

function radios(container, name, items, current) {
  container.innerHTML = items.map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}"${v === current ? ' checked' : ''}>${t}</label>`).join('');
}

// --- Router ---

const TITLES = { ringkasan: 'Ringkasan Pasar', scanner: 'Scanner Saham', watchlist: 'Watchlist', saham: 'Halaman saham' };

function route() {
  if (!state.data) return;
  const [, view = 'ringkasan', code] = location.hash.split('/');
  if (view === 'saham') {
    const c = decodeURIComponent(code ?? '').toUpperCase();
    if (!state.data.stocks[c]) { location.replace('#/ringkasan'); return; }
    if (c !== state.stock) { state.stock = c; state.showPasif = false; }
  }
  state.view = TITLES[view] ? view : 'ringkasan';
  for (const v of $$('.view')) v.hidden = v.id !== 'v-' + state.view;
  for (const a of $$('a[data-view]')) {
    if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  $('#view-title').textContent = state.view === 'saham' ? `Saham ${state.stock}` : TITLES[state.view];
  document.title = `${$('#view-title').textContent}: Secret (data contoh)`;
  render();
}

function render() {
  for (const el of $$('[data-range-text]')) el.textContent = rangeText();
  for (const el of $$('[data-rentang-group]')) radios(el, 'rentang-' + el.dataset.rentangGroup, RENTANG.map((r) => [r, `${r} hari`]), state.rentang);
  $$('[data-watch-count]').forEach((el) => { el.textContent = watch.length || ''; });
  ({ ringkasan: renderRingkasan, scanner: renderScanner, saham: renderSaham, watchlist: renderWatchlist })[state.view]();
}

// --- Ringkasan Pasar ---

function topSide(side) {
  return codes().map((code) => ({ code, a: analyse(code), p: analyse(code).patterns.find((p) => p.side === side && !p.pasif) }))
    .filter((x) => x.p).sort((x, y) => Math.abs(y.p.netLot) - Math.abs(x.p.netLot)).slice(0, 10);
}
function renderRingkasan() {
  radios($('[data-top-group]'), 'top', TOP.map(([v, t]) => [v, `${t} (${listRows(v).length})`]), state.top);
  $('#top-desc').textContent = descOf(state.top);
  $('#top-metric').textContent = state.top === SPIKE ? 'Rasio volume' : 'Net lot Broker';
  $('#top-list').innerHTML = rowsHtml(listRows(state.top), false) || `<li class="muted">${emptyOf(state.top)}</li>`;
  $('#wl-mini').innerHTML = watch.map((code) => `<li><a class="row" href="#/saham/${esc(code)}">${emiten(code, labelOf(code))}<span class="content">${spark(code)}</span>${priceStack(analyse(code))}</a></li>`).join('')
    || '<li class="muted">Belum ada saham dipantau. Buka halaman saham lalu tekan "+ Pantau".</li>';
  radios($('[data-tf-group="ihsg"]'), 'ihsg-tf', TF, state.ihsgTf);
  renderIhsg();
}

function renderTicker() {
  const k = ihsgCandles(1440), last = k.at(-1), chg = last.close / k.at(-2).close - 1;
  $('#ticker').innerHTML = `<span>IHSG</span><span>${fmt.format(last.close)}</span><span class="${chg >= 0 ? 'lot-up' : 'lot-down'}">${pct.format(chg)}</span>`;
}

// IHSG contoh: rata-rata harga 5 saham contoh yang dinormalkan ke 7.000. Fiktif, berlabel DATA CONTOH.
function ihsgCandles(tf) {
  return cached(`ihsg|${tf}`, () => {
    const list = codes(), base = list.map((c) => candlesOf(c, 1440)[0].close), map = new Map();
    list.forEach((c, j) => {
      const f = 7000 / base[j] / list.length;
      for (const k of candlesOf(c, tf)) {
        const m = map.get(k.time) ?? { time: k.time, date: k.date, n: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 };
        m.n++; m.open += k.open * f; m.high += k.high * f; m.low += k.low * f; m.close += k.close * f; m.volume += k.volume;
        map.set(k.time, m);
      }
    });
    // shortcut: irisan yang tidak diperdagangkan semua saham contoh dilewati; ganti dengan data indeks asli saat tersedia
    return [...map.values()].filter((m) => m.n === list.length).sort((a, b) => a.time - b.time);
  });
}

function renderIhsg() {
  const k = ihsgCandles(state.ihsgTf);
  const d = ihsgCandles(1440), last = d.at(-1), prev = d.at(-2), chg = last.close / prev.close - 1;
  const stat = (t, x) => `<div><dt>${t}</dt><dd>${fmt.format(x)}</dd></div>`;
  $('#ihsg-value').innerHTML = `<b>${fmt.format(last.close)}</b><span class="tag ${chg >= 0 ? 'tag-up' : 'tag-down'}">${lot(Math.round(last.close - prev.close))} (${pct.format(chg)})</span>
    <dl class="stats push">${stat('Open', last.open)}${stat('High', last.high)}${stat('Low', last.low)}</dl>`;
  ihsgArea.setData(cached(`ia|${state.ihsgTf}`, () => k.map((x) => ({ time: x.time, value: x.close }))));
  ihsgCandle.setData(cached(`ic|${state.ihsgTf}`, () => k.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))));
  ihsgVol.setData(cached(`iv|${state.ihsgTf}`, () => k.map((x) => ({ time: x.time, value: x.volume, color: (x.close >= x.open ? css('--buy') : css('--sell')) + '66' }))));
  ihsgArea.applyOptions({ visible: state.ihsgKind === 'area' });
  ihsgCandle.applyOptions({ visible: state.ihsgKind === 'candle' });
  fitTime(ihsgChart, state.ihsgTf, k.length);
}

// --- Scanner ---

function scanRows(name) {
  if (name === SPIKE) {
    const { stocks, dates } = state.data;
    return codes().map((code) => ({ code, s: cached(`i|${code}|${scan.time}`, () => volumeSpikeIntraday(stocks[code], dates, dates.at(-1), scan.time)) })).filter((x) => x.s?.spike);
  }
  const test = PATTERNS.find(([n]) => n === name)[2];
  return codes().map((code) => ({ code, p: analyse(code).patterns.find(test) })).filter((x) => x.p).sort((a, b) => Math.abs(b.p.netLot) - Math.abs(a.p.netLot));
}

function renderScanner() {
  const all = [...PATTERNS.map(([n]) => n), SPIKE];
  $('#pola-tiles').innerHTML = [ALL, ...all].map((n) => `<label><input type="radio" name="pola" value="${esc(n)}"${n === state.pola ? ' checked' : ''}>${esc(n)}<small>${n === ALL ? `${all.length} pola` : `${scanRows(n).length} saham`}</small></label>`).join('');
  const shown = state.pola === ALL ? all : [state.pola];
  $('#scan-time-field').hidden = !shown.includes(SPIKE);
  $('#scan-time').value = scan.time;
  $('#scan-grid').classList.toggle('one', shown.length === 1);
  $('#scan-grid').innerHTML = shown.map((n) => {
    const rows = scanRows(n);
    return `<section class="card" aria-label="${esc(n)}">
      <div class="card-head"><div><h2>${esc(n)}</h2><p class="sub">${esc(descOf(n))}</p></div><span class="tag push">${rows.length} saham</span></div>
      <ul class="rows stock compact">${rowsHtml(rows, true) || `<li class="muted">${esc(emptyOf(n))}</li>`}</ul>
    </section>`;
  }).join('');
}

// --- Halaman saham ---

function signalLines(code, a) {
  const out = a.patterns.filter((p) => p.masif || p.penampung).slice(0, 3).map((p) => {
    if (p.masif) {
      const name = p.silent ? (p.side === 'akumulasi' ? 'Silent Akumulasi' : 'Silent Distribusi') : (p.side === 'akumulasi' ? 'Akumulasi Masif' : 'Distribusi Masif');
      return `<li><span class="tag ${p.side === 'akumulasi' ? 'tag-up' : 'tag-down'}">${name}</span><span class="sub">net searah ${p.daysSame}/${p.days} hari</span>${sentence(code, p)}</li>`;
    }
    return `<li><span class="tag">Penampung</span><span class="sentence">${boxes(p)} menampung saat harga turun: ${lot(p.netLot)} lot, avg beli ${fmt.format(p.avgBuy)}</span></li>`;
  });
  if (a.crossing.length) {
    const c = a.crossing.at(-1);
    const more = a.crossing.length > 1 ? `, dan ${a.crossing.length - 1} kali lainnya` : '';
    out.push(`<li><span class="tag">Crossing</span><span class="sentence">${bk(c.a)} dan ${bk(c.b)} bolak-balik ${fmt.format(c.aToB + c.bToA)} lot pada ${c.date}${more}</span></li>`);
  }
  if (a.spike?.spike) out.push(`<li><span class="tag">Lonjakan Volume</span><span class="sentence">Volume hari terakhir ${dec1.format(a.spike.ratio)} kali rata-rata 20 hari</span></li>`);
  return out.length ? out.join('') : `<li class="muted">Belum ada sinyal kuat dalam ${state.rentang} hari terakhir. Broker di tabel hanya bergerak kecil.</li>`;
}

function renderSaham() {
  const code = state.stock;
  const a = analyse(code);
  $('#s-avatar').textContent = code.slice(0, 2);
  $('#code').textContent = code;
  $('#s-date').textContent = `Hari bursa terakhir ${lastDate()}`;
  $('#s-price').innerHTML = `<b>${fmt.format(a.last)}</b>${chgTag(a.change)}`;
  $('#s-price').className = 'price-stack big push';
  const on = watch.includes(code);
  $('#watch-toggle').setAttribute('aria-pressed', String(on));
  $('#watch-toggle').textContent = on ? 'Dipantau' : '+ Pantau';
  $('#signals').innerHTML = signalLines(code, a);
  $('#range-meta').textContent = `${a.from} sampai ${a.to}`;
  $('#s-tampung').innerHTML = tampung(code);
  renderTable(a);
  $('#crossing').innerHTML = a.crossing.length
    ? a.crossing.map((c) => `<li>${c.date}: ${bk(c.a)} jual ${fmt.format(c.aToB)} lot ke ${bk(c.b)}, ${esc(c.b)} jual ${fmt.format(c.bToA)} lot ke ${esc(c.a)} (${Math.round(c.share * 100)}% volume hari itu)${c.strict ? ' <span class="tag">Crossing Ketat, dalam 15 menit</span>' : ''}</li>`).join('')
    : `<li>Tidak ada Crossing di saham ini dalam ${state.rentang} hari terakhir.</li>`;
  const groups = state.groups[code] ?? [];
  $('#dugaan').innerHTML = groups.length
    ? `Belum terverifikasi: ${groups.map((g) => g.members.map(bk).join(' + ')).join(', ')}. Pasangan ini pernah tertangkap Crossing bersama di saham ini dalam 60 hari terakhir, jadi mungkin bertindak untuk pihak yang sama.`
    : 'Belum ada pasangan Broker yang tertangkap Crossing bersama di saham ini dalam 60 hari terakhir.';
  radios($('[data-tf-group="saham"]'), 'tf', TF, state.tf);
  renderChart();
}

// Broker yang hanya Pasif disembunyikan secara bawaan: di Rentang panjang jumlahnya puluhan dan menenggelamkan sinyal.
const onlyPasif = (p) => p.pasif && !p.penampung && !p.kind;

function renderTable(a) {
  const pasifCount = a.patterns.filter(onlyPasif).length;
  const rows = state.showPasif ? a.patterns : a.patterns.filter((p) => !onlyPasif(p));
  const max = Math.max(1, ...rows.map((p) => Math.abs(p.netLot)));
  $('#brokers tbody').innerHTML = rows.map((p) => {
    const tags = [p.masif && 'Masif', p.pasif && 'Pasif', p.penampung && 'Penampung', p.silent && 'Silent',
      p.kind && { dugaan: 'Kelompok Dugaan, perkiraan', pribadi: 'Kelompok Pribadi', resmi: 'Kelompok Resmi' }[p.kind]].filter(Boolean).join(', ');
    const side = { akumulasi: 'Akumulasi', distribusi: 'Distribusi' }[p.side] ?? '';
    return `<tr>
      <td>${boxes(p)}</td>
      <td class="pola"><b class="side-${p.side}">${side}</b>${tags ? `<small>${tags}</small>` : ''}</td>
      <td class="num"><span class="net"><span class="bar hide-m" aria-hidden="true"><i class="${p.netLot > 0 ? 'buy' : 'sell'}" style="--w:${Math.abs(p.netLot) / max}"></i></span><b class="${p.netLot > 0 ? 'lot-up' : 'lot-down'}">${lot(p.netLot)}</b></span></td>
      <td class="num hide-m">${p.avgBuy == null ? '-' : fmt.format(p.avgBuy)}</td>
      <td class="num hide-m">${p.avgSell == null ? '-' : fmt.format(p.avgSell)}</td>
      <td class="num hide-m">${p.side ? `${p.daysSame}/${p.days}` : '-'}</td>
    </tr>`;
  }).join('');
  $('#brokers').parentElement.hidden = rows.length === 0;
  $('#empty').hidden = rows.length > 0;
  $('#empty').textContent = pasifCount
    ? `Dalam ${state.rentang} hari terakhir hanya ada Broker Pasif (net kecil).`
    : `Tidak ada Broker yang memenuhi syarat Akumulasi, Distribusi, atau Penampung dalam ${state.rentang} hari terakhir. Coba Rentang lain.`;
  const btn = $('#pasif-toggle');
  btn.hidden = pasifCount === 0;
  btn.setAttribute('aria-expanded', String(state.showPasif));
  btn.textContent = state.showPasif ? `Sembunyikan ${pasifCount} Broker Pasif` : `Tampilkan ${pasifCount} Broker Pasif`;
}

// --- Watchlist ---

function saveWatch() { localStorage.setItem('watch', JSON.stringify(watch)); }

function renderWatchlist() {
  $('#wl-empty').hidden = watch.length > 0;
  $('#wl-sub').textContent = `${watch.length} saham, disimpan di browser ini`;
  $('#wl-list').innerHTML = watch.map((code) => {
    const p = analyse(code).patterns.find((q) => q.masif);
    return stockRow(code, {
      sub: labelOf(code),
      metric: spark(code),
      body: `${p ? sentence(code, p) : `<span class="muted">Belum ada sinyal kuat dalam ${state.rentang} hari terakhir.</span>`}${tampungBlock(code)}`,
      end: `<button type="button" data-remove="${esc(code)}" aria-label="Hapus ${esc(code)} dari Watchlist">Hapus</button>`,
    });
  }).join('');
}

// --- Grafik ---

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const chartBase = () => ({
  autoSize: true,
  layout: { background: { color: css('--sub') }, textColor: css('--dim2'), fontFamily: 'Inter, Segoe UI, sans-serif' },
  grid: { vertLines: { visible: false }, horzLines: { color: css('--line') } },
  rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
  localization: { priceFormatter: (p) => fmt.format(p) },
});
const candleColors = () => {
  const up = css('--buy'), down = css('--sell');
  return { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down };
};

function initChart() {
  const LC = window.LightweightCharts;
  const c = LC.createChart($('#chart'), chartBase());
  candleSeries = c.addSeries(LC.CandlestickSeries, { priceFormat: { type: 'price', precision: 0, minMove: 1 }, ...candleColors() });
  candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });
  volSeries = c.addSeries(LC.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  // shortcut: kotak Order Block mengikuti geser/zoom waktu dan resize; geser skala harga manual tidak memicu ulang, ganti ke series primitive bila perlu
  c.timeScale().subscribeVisibleLogicalRangeChange(schedulePosition);
  new ResizeObserver(() => { fitTime(c, state.tf, state.candles.length); schedulePosition(); }).observe($('#chart'));
  c.subscribeCrosshairMove((p) => updateLegend(p.logical == null ? null : state.candles[Math.round(p.logical)]));
  chart = c;
  return c;
}

function initIhsgChart() {
  const LC = window.LightweightCharts;
  const c = LC.createChart($('#ihsg-chart'), chartBase());
  const up = css('--buy');
  ihsgArea = c.addSeries(LC.AreaSeries, { lineColor: up, topColor: up + '47', bottomColor: up + '00', lineWidth: 2, priceFormat: { type: 'price', precision: 0, minMove: 1 } });
  ihsgCandle = c.addSeries(LC.CandlestickSeries, { visible: false, priceFormat: { type: 'price', precision: 0, minMove: 1 }, ...candleColors() });
  for (const s of [ihsgArea, ihsgCandle]) s.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.2 } });
  ihsgVol = c.addSeries(LC.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
  new ResizeObserver(() => fitTime(c, state.ihsgTf, ihsgCandles(state.ihsgTf).length)).observe($('#ihsg-chart'));
  return c;
}

function renderChart() {
  if (!chart || !state.data || !state.stock) return;
  const c = candlesOf(state.stock, state.tf);
  state.candles = c;
  computeBlocks(); // sebelum setData: event geser waktu dari setData langsung memosisikan blok baru
  candleSeries.setData(cached(`o|${state.stock}|${state.tf}`, () => c.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))));
  volSeries.setData(cached(`v|${state.stock}|${state.tf}`, () => {
    const up = css('--buy') + '66', down = css('--sell') + '66';
    return c.map((k) => ({ time: k.time, value: k.volume, color: k.close >= k.open ? up : down }));
  }));
  fitTime(chart, state.tf, c.length);
  updateLegend(null);
}

// Harian: semua candle muat; intraday: 120 candle terakhir. Dipanggil ulang saat ukuran grafik berubah (layar diputar, jendela diperkecil).
function fitTime(c, tf, n) {
  if (tf < 1440) c.timeScale().setVisibleLogicalRange({ from: n - 120, to: n + 2 });
  else c.timeScale().fitContent();
}

function updateLegend(k) {
  k ??= state.candles.at(-1);
  if (!k) return;
  const when = state.tf < 1440 ? `${k.date} ${new Date(k.time * 1000).toISOString().slice(11, 16)}` : k.date;
  const v = (label, x) => `<span>${label} <strong>${fmt.format(x)}</strong></span>`;
  $('#legend').innerHTML = `<span>${when}</span>${v('O', k.open)}${v('H', k.high)}${v('L', k.low)}`
    + `<span>C <strong class="${k.close >= k.open ? 'lot-up' : 'lot-down'}">${fmt.format(k.close)}</strong></span>${v('Vol', k.volume)}`;
}

// Blok dan isinya dihitung sekali per perubahan data atau pengaturan; saat geser/zoom hanya posisinya yang diperbarui.
function computeBlocks() {
  state.blocks = ob.on
    ? orderBlocks(state.candles, ob).map((b) => ({ ...b, info: blockInfo(state.candles, b, state.data.dates) }))
    : [];
  $('#ob-empty').hidden = !ob.on || state.blocks.length > 0;
  $('#ob-layer').replaceChildren(...state.blocks.map((b) => {
    const parts = [
      ob.avg && `Avg ${fmt.format(b.info.avg)}`,
      ob.volume && `Vol ${fmt.format(b.info.volume)}`,
      ob.age && `${b.info.ageDays} hari`,
      ob.broker && b.info.broker && `${b.info.broker} ${lot(b.info.net)}`,
    ].filter(Boolean);
    const div = document.createElement('div');
    div.className = 'ob';
    div.textContent = (b.type === 'bull' ? 'OB beli' : 'OB jual') + (parts.length ? ': ' + parts.join(', ') : '');
    div.style.background = ob[b.type] + '30';
    div.style.borderColor = ob[b.type];
    return div;
  }));
  schedulePosition();
}

let raf = 0;
function schedulePosition() {
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; positionBlocks(); }); // satu kali per frame walau event datang beruntun
}

function positionBlocks() {
  if (!chart || !state.blocks.length) return;
  const right = $('#chart').clientWidth - chart.priceScale('right').width();
  const ts = chart.timeScale();
  const from = ts.getVisibleRange()?.from ?? 0;
  const nodes = $('#ob-layer').children;
  state.blocks.forEach((b, i) => {
    const t = state.candles[b.i].time;
    // candle di luar layar kiri: kotak mulai dari tepi kiri; di luar layar kanan: disembunyikan
    const x = Math.max(0, ts.timeToCoordinate(t) ?? (t < from ? 0 : right));
    const y1 = candleSeries.priceToCoordinate(b.top), y2 = candleSeries.priceToCoordinate(b.bottom);
    const node = nodes[i];
    node.hidden = y1 == null || y2 == null || x >= right;
    if (node.hidden) return;
    Object.assign(node.style, { left: x + 'px', width: right - x + 'px', top: Math.min(y1, y2) + 'px', height: Math.max(14, Math.abs(y2 - y1)) + 'px' });
  });
}

// --- Event ---

function fillObForm() {
  for (const el of $('#ob-form').elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') el.checked = ob[el.name];
    else el.value = ob[el.name];
  }
  const btn = $('#ob-toggle');
  btn.setAttribute('aria-pressed', String(ob.on));
  btn.textContent = ob.on ? 'Sembunyikan Order Block' : 'Tampilkan Order Block';
}
const saveOb = () => localStorage.setItem('ob', JSON.stringify(ob));

$('#ob-form').addEventListener('input', (e) => {
  const el = e.target;
  if (el.type === 'checkbox') ob[el.name] = el.checked;
  else if (el.type === 'number') {
    if (!el.checkValidity()) return; // angka di luar batas: tunggu sampai valid
    ob[el.name] = Number(el.value);
  } else ob[el.name] = el.value;
  saveOb();
  computeBlocks();
});
$('#ob-form').addEventListener('submit', (e) => e.preventDefault());
$('#ob-toggle').addEventListener('click', () => {
  ob.on = !ob.on;
  saveOb();
  fillObForm();
  computeBlocks();
});

// Semua radio digambar ulang saat render, jadi event ditangkap sekali di tingkat main.
$('main').addEventListener('change', (e) => {
  const el = e.target;
  const n = el.name ?? '';
  if (n.startsWith('rentang-')) {
    state.rentang = Number(el.value);
    render();
    $(`input[name="${n}"]:checked`)?.focus(); // radio digambar ulang, fokus dikembalikan
  } else if (n === 'tf') { state.tf = Number(el.value); renderChart(); }
  else if (n === 'ihsg-tf') { state.ihsgTf = Number(el.value); renderIhsg(); }
  else if (n === 'ihsg-kind') { state.ihsgKind = el.value; renderIhsg(); }
  else if (n === 'top') { state.top = el.value; renderRingkasan(); $('input[name="top"]:checked')?.focus(); }
  else if (n === 'pola') { state.pola = el.value; renderScanner(); $(`input[name="pola"]:checked`)?.focus(); }
  else if (el.id === 'scan-time') { scan.time = el.value; localStorage.setItem('scan', JSON.stringify(scan)); renderScanner(); $('#scan-time').focus(); }
});

$('#watch-toggle').addEventListener('click', () => {
  const code = state.stock;
  watch = watch.includes(code) ? watch.filter((c) => c !== code) : [...watch, code];
  saveWatch();
  render();
});
// Bintang Pantau di daftar saham. Urutan tombol tidak berubah setelah render, jadi fokus kembali ke tombol yang sama.
$('main').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-watch]');
  if (!btn) return;
  const i = $$('button[data-watch]').indexOf(btn), code = btn.dataset.watch;
  watch = watch.includes(code) ? watch.filter((c) => c !== code) : [...watch, code];
  saveWatch();
  render();
  $$('button[data-watch]')[i]?.focus();
});
$('#wl-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-remove]');
  if (!btn) return;
  watch = watch.filter((c) => c !== btn.dataset.remove);
  saveWatch();
  render();
  $('#wl-title').focus(); // baris yang dihapus hilang, fokus pindah ke judul daftar
});
$('#pasif-toggle').addEventListener('click', () => {
  state.showPasif = !state.showPasif;
  renderTable(analyse(state.stock));
});
$('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#search-input').value.trim().toUpperCase();
  if (!code) return;
  if (state.data?.stocks[code]) {
    $('#search-msg').textContent = '';
    $('#search-input').value = '';
    location.hash = '#/saham/' + code;
  } else {
    $('#search-msg').textContent = `Kode ${code} tidak ada di data contoh. Coba ${codes().join(', ')}.`;
  }
});
$('#retry').addEventListener('click', load);
window.addEventListener('hashchange', () => { route(); $('#view-title').focus({ preventScroll: false }); });

$('#view-title').tabIndex = -1;
$('#wl-title').tabIndex = -1;
fillObForm();
load();
