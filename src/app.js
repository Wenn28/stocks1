import { detectBrokerPatterns, detectCrossing, volumeSpike, volumeSpikeIntraday, dayStats, suspectedGroups } from './patterns.js';
import { buildCandles, orderBlocks, blockInfo } from './candles.js';

const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('id-ID', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stored = (key, def) => {
  try { return { ...def, ...JSON.parse(localStorage.getItem(key)) }; } catch { return def; }
};

const state = { data: null, stock: null, rentang: 20, tf: 1440, groups: {}, candles: [], blocks: [], showPasif: false };
const ob = stored('ob', { on: true, swing: 5, max: 3, mitigation: 'wick', bull: '#1f9d55', bear: '#d64541',
  avg: true, volume: true, age: true, broker: true });
const scan = stored('scan', { silent: true, spike: true, time: '11:00:00' });
let chart, candleSeries, volSeries, attempt = 0;

// Data contoh tidak berubah selama halaman terbuka, jadi setiap hasil hitung disimpan dan dipakai ulang.
const memo = new Map();
const cached = (key, fn) => {
  let v = memo.get(key);
  if (v === undefined) memo.set(key, (v = fn()));
  return v;
};
const crossingOf = (code, date) => cached(`x|${code}|${date}`, () => detectCrossing(state.data.stocks[code][date] ?? []));
const candlesOf = (code, tf) => cached(`c|${code}|${tf}`, () => buildCandles(state.data.stocks[code], state.data.dates, tf));

function show(which) {
  for (const id of ['loading', 'error', 'ready']) $('#' + id).hidden = id !== which;
}

async function load() {
  show('loading');
  try {
    // import dinamis + query baru tiap percobaan, agar tombol "Muat ulang" benar-benar mencoba lagi
    const { generate } = await import(`./sample.js?r=${attempt++}`);
    if (!window.LightweightCharts) throw new Error('library grafik tidak termuat');
    memo.clear();
    state.data = generate();
    state.stock = Object.keys(state.data.stocks)[0];
    state.groups = suspectedGroups(state.data.stocks, state.data.dates, crossingOf);
    show('ready');
    chart ??= initChart();
    renderList();
    renderDetail();
    renderScanner();
    renderChart();
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

const chgClass = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : 'flat');

function flagsOf(a) {
  const label = (p) => (p.silent ? 'Silent ' : '') + (p.side === 'akumulasi' ? 'Akumulasi' : 'Distribusi') + (p.silent ? '' : ' Masif');
  return [
    ...new Set(a.patterns.filter((p) => p.masif).map(label)),
    a.patterns.some((p) => p.penampung) && 'Penampung',
    a.crossing.length && 'Crossing',
    a.spike?.spike && 'Lonjakan Volume',
  ].filter(Boolean);
}

function renderList() {
  $('#stocks').innerHTML = Object.keys(state.data.stocks).map((code) => {
    const a = analyse(code);
    const flags = flagsOf(a);
    return `<li><button type="button" data-code="${esc(code)}" aria-current="${code === state.stock}">
      <span class="row"><span class="code">${esc(code)}</span><span class="price">${fmt.format(a.last)}</span></span>
      <span class="row"><span class="flags">${flags.length ? flags.join(', ') : 'Tidak ada pola khusus'}</span><span class="chg ${chgClass(a.change)}">${a.change == null ? '' : pct.format(a.change)}</span></span>
    </button></li>`;
  }).join('');
}

function signalLines(code, a) {
  const out = a.patterns.filter((p) => p.masif || p.penampung).slice(0, 3).map((p) => {
    if (p.masif) {
      const acc = p.side === 'akumulasi';
      const tag = p.silent ? '<span class="tag tag-silent">Silent</span>' : '<span class="tag">Masif</span>';
      return `<li>${tag}<span><strong>${esc(code)}</strong> ${acc ? 'diakumulasi' : 'didistribusi'} <strong>${esc(p.broker)}</strong> dengan ${fmt.format(Math.abs(p.netLot))} lot di avg ${fmt.format(acc ? p.avgBuy : p.avgSell)}, net searah ${p.daysSame}/${p.days} hari</span></li>`;
    }
    return `<li><span class="tag">Penampung</span><span><strong>${esc(p.broker)}</strong> menampung saat harga turun: ${p.netLot > 0 ? '+' : ''}${fmt.format(p.netLot)} lot, avg beli ${fmt.format(p.avgBuy)}</span></li>`;
  });
  if (a.crossing.length) {
    const c = a.crossing.at(-1);
    const more = a.crossing.length > 1 ? `, dan ${a.crossing.length - 1} kali lainnya` : '';
    out.push(`<li><span class="tag">Crossing</span><span><strong>${esc(c.a)}</strong> dan <strong>${esc(c.b)}</strong> bolak-balik ${fmt.format(c.aToB + c.bToA)} lot pada ${c.date}${more}</span></li>`);
  }
  if (a.spike?.spike) out.push(`<li><span class="tag">Lonjakan Volume</span><span>Volume hari terakhir ${dec1.format(a.spike.ratio)} kali rata-rata 20 hari</span></li>`);
  return out.length ? out.join('') : `<li class="muted">Belum ada sinyal kuat dalam ${state.rentang} hari terakhir. Broker di tabel hanya bergerak kecil.</li>`;
}

function renderDetail() {
  const code = state.stock;
  const a = analyse(code);
  const s = a.spike;
  $('#code').textContent = code;
  $('#stats').innerHTML = `Harga <strong>${fmt.format(a.last)}</strong>`
    + (a.change == null ? '' : ` <span class="chg ${chgClass(a.change)}">${pct.format(a.change)}</span>`)
    + (s ? `<span class="sep">Volume ${fmt.format(s.vol)} lot, ${dec1.format(s.ratio)} kali rata-rata 20 hari</span>` : '');
  $('#signals').innerHTML = signalLines(code, a);
  $('#range-meta').textContent = `${a.from} sampai ${a.to}`;
  renderTable(a);

  $('#crossing').innerHTML = a.crossing.length
    ? a.crossing.map((c) => `<li>${c.date}: <strong>${esc(c.a)}</strong> jual ${fmt.format(c.aToB)} lot ke <strong>${esc(c.b)}</strong>, ${esc(c.b)} jual ${fmt.format(c.bToA)} lot ke ${esc(c.a)} (${Math.round(c.share * 100)}% volume hari itu)${c.strict ? ' <span class="tag">Crossing Ketat, dalam 15 menit</span>' : ''}</li>`).join('')
    : `<li class="muted">Tidak ada Crossing dalam ${state.rentang} hari terakhir.</li>`;

  const groups = state.groups[code] ?? [];
  $('#dugaan').textContent = groups.length
    ? `Perkiraan, belum terverifikasi: ${groups.map((g) => g.name).join(', ')}. Pasangan ini pernah tertangkap Crossing bersama di saham ini dalam 60 hari terakhir, jadi mungkin bertindak untuk pihak yang sama.`
    : 'Belum ada pasangan Broker yang tertangkap Crossing bersama di saham ini dalam 60 hari terakhir.';
}

// Broker yang hanya Pasif disembunyikan secara bawaan: di Rentang panjang jumlahnya puluhan dan menenggelamkan sinyal.
const onlyPasif = (p) => p.pasif && !p.penampung && !p.kind;

function renderTable(a) {
  const pasifCount = a.patterns.filter(onlyPasif).length;
  const rows = state.showPasif ? a.patterns : a.patterns.filter((p) => !onlyPasif(p));
  const max = Math.max(1, ...rows.map((p) => Math.abs(p.netLot)));
  $('#brokers tbody').innerHTML = rows.map((p) => {
    const tags = [p.masif && 'Masif', p.pasif && 'Pasif', p.penampung && 'Penampung'].filter(Boolean)
      .map((t) => `<span class="tag">${t}</span>`).join('')
      + (p.silent ? '<span class="tag tag-silent">Silent</span>' : '');
    const side = { akumulasi: 'Akumulasi', distribusi: 'Distribusi' }[p.side] ?? '';
    const kind = p.kind && `<span class="tag tag-${p.kind}">${{ dugaan: 'Kelompok Dugaan, perkiraan', pribadi: 'Kelompok Pribadi', resmi: 'Kelompok Resmi' }[p.kind]}</span>`;
    return `<tr>
      <td><strong>${esc(p.broker)}</strong>${kind || ''}</td>
      <td class="pola"><span class="side-${p.side}">${side}</span>${tags}</td>
      <td class="num"><span class="net"><span class="bar" aria-hidden="true"><i class="${p.netLot > 0 ? 'buy' : 'sell'}" style="--w:${Math.abs(p.netLot) / max}"></i></span>${p.netLot > 0 ? '+' : ''}${fmt.format(p.netLot)}</span></td>
      <td class="num">${p.avgBuy == null ? '-' : fmt.format(p.avgBuy)}</td>
      <td class="num">${p.avgSell == null ? '-' : fmt.format(p.avgSell)}</td>
      <td class="num">${p.side ? `${p.daysSame}/${p.days}` : '-'}</td>
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

function renderScanner() {
  const { stocks, dates } = state.data;
  const item = (code, text) => `<li><button type="button" data-code="${esc(code)}">${text}</button></li>`;
  const none = (text) => `<li class="muted small">${text}</li>`;

  $('#scan-silent').hidden = !scan.silent;
  const silent = Object.keys(stocks).flatMap((code) =>
    analyse(code).patterns.filter((p) => p.silent).map((p) => {
      const acc = p.side === 'akumulasi';
      return item(code, `<strong>${esc(code)}</strong> ${acc ? 'diakumulasi' : 'didistribusi'} ${esc(p.broker)} dengan ${fmt.format(Math.abs(p.netLot))} lot di avg ${fmt.format(acc ? p.avgBuy : p.avgSell)}`);
    }));
  $('#scan-silent').innerHTML = silent.join('') || none(`Tidak ada Silent dalam ${state.rentang} hari terakhir.`);

  $('#scan-spike').hidden = !scan.spike;
  $('#scan-time-field').hidden = !scan.spike;
  const jam = scan.time.slice(0, 5);
  const spikes = Object.keys(stocks).flatMap((code) => {
    const s = cached(`i|${code}|${scan.time}`, () => volumeSpikeIntraday(stocks[code], dates, dates.at(-1), scan.time));
    return s?.spike ? [item(code, `<strong>${esc(code)}</strong> volume ${dec1.format(s.ratio)} kali rata-rata sampai ${jam}`)] : [];
  });
  $('#scan-spike').innerHTML = spikes.join('') || none(`Tidak ada Lonjakan Volume sampai ${jam}.`);
}

// --- Grafik ---

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function initChart() {
  const LC = window.LightweightCharts;
  const c = LC.createChart($('#chart'), {
    autoSize: true,
    timeScale: { timeVisible: true, secondsVisible: false },
    localization: { priceFormatter: (p) => fmt.format(p) },
  });
  candleSeries = c.addSeries(LC.CandlestickSeries, { priceFormat: { type: 'price', precision: 0, minMove: 1 } });
  candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });
  volSeries = c.addSeries(LC.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  // shortcut: kotak Order Block mengikuti geser/zoom waktu dan resize; geser skala harga manual tidak memicu ulang, ganti ke series primitive bila perlu
  c.timeScale().subscribeVisibleLogicalRangeChange(schedulePosition);
  new ResizeObserver(schedulePosition).observe($('#chart'));
  c.subscribeCrosshairMove((p) => updateLegend(p.logical == null ? null : state.candles[Math.round(p.logical)]));
  chart = c;
  applyChartTheme();
  return c;
}

function applyChartTheme() {
  if (!chart) return;
  chart.applyOptions({
    layout: { background: { color: css('--surface') }, textColor: css('--muted') },
    grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
  });
  const up = css('--buy'), down = css('--sell');
  candleSeries.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
  renderChart();
}

function renderChart() {
  if (!chart || !state.data) return;
  const c = candlesOf(state.stock, state.tf);
  state.candles = c;
  computeBlocks(); // sebelum setData: event geser waktu dari setData langsung memosisikan blok baru
  candleSeries.setData(cached(`o|${state.stock}|${state.tf}`, () => c.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))));
  const theme = document.documentElement.dataset.theme;
  volSeries.setData(cached(`v|${state.stock}|${state.tf}|${theme}`, () => {
    const up = css('--buy') + '80', down = css('--sell') + '80';
    return c.map((k) => ({ time: k.time, value: k.volume, color: k.close >= k.open ? up : down }));
  }));
  if (state.tf < 1440) chart.timeScale().setVisibleLogicalRange({ from: c.length - 120, to: c.length + 2 });
  else chart.timeScale().fitContent();
  updateLegend(null);
}

function updateLegend(k) {
  k ??= state.candles.at(-1);
  if (!k) return;
  const when = state.tf < 1440 ? `${k.date} ${new Date(k.time * 1000).toISOString().slice(11, 16)}` : k.date;
  const v = (label, x) => `<span>${label} <strong>${fmt.format(x)}</strong></span>`;
  $('#legend').innerHTML = `<span>${when}</span>${v('O', k.open)}${v('H', k.high)}${v('L', k.low)}`
    + `<span>C <strong class="chg ${chgClass(k.close - k.open)}">${fmt.format(k.close)}</strong></span>${v('Vol', k.volume)}`;
}

// Blok dan isinya dihitung sekali per perubahan data atau pengaturan; saat geser/zoom hanya posisinya yang diperbarui.
function computeBlocks() {
  state.blocks = ob.on
    ? orderBlocks(state.candles, ob).map((b) => ({ ...b, info: blockInfo(state.candles, b, state.data.dates) }))
    : [];
  $('#ob-layer').replaceChildren(...state.blocks.map((b) => {
    const parts = [
      ob.avg && `Avg ${fmt.format(b.info.avg)}`,
      ob.volume && `Vol ${fmt.format(b.info.volume)}`,
      ob.age && `${b.info.ageDays} hari`,
      ob.broker && b.info.broker && `${b.info.broker} ${b.info.net > 0 ? '+' : ''}${fmt.format(b.info.net)}`,
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

// --- Pengaturan dan event ---

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

function setScan(key, value) {
  scan[key] = value;
  localStorage.setItem('scan', JSON.stringify(scan));
  renderScanner();
}
$('#scan-silent-on').addEventListener('change', (e) => setScan('silent', e.target.checked));
$('#scan-spike-on').addEventListener('change', (e) => setScan('spike', e.target.checked));
$('#scan-time').addEventListener('change', (e) => setScan('time', e.target.value));

$('#ready').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-code]');
  if (!btn || btn.dataset.code === state.stock) return;
  const fromList = btn.closest('#stocks');
  state.stock = btn.dataset.code;
  state.showPasif = false;
  renderList();
  renderDetail();
  renderChart();
  // daftar saham digambar ulang, jadi fokus dikembalikan ke tombol yang sama
  if (fromList) $(`#stocks button[data-code="${state.stock}"]`).focus();
});
$('#pasif-toggle').addEventListener('click', () => {
  state.showPasif = !state.showPasif;
  renderTable(analyse(state.stock));
});
document.querySelectorAll('input[name="rentang"]').forEach((r) =>
  r.addEventListener('change', () => { state.rentang = Number(r.value); renderList(); renderDetail(); renderScanner(); }));
document.querySelectorAll('input[name="tf"]').forEach((r) =>
  r.addEventListener('change', () => { state.tf = Number(r.value); renderChart(); }));
$('#retry').addEventListener('click', load);

function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme').setAttribute('aria-pressed', String(dark));
  $('#theme').textContent = dark ? 'Mode terang' : 'Mode gelap';
  applyChartTheme();
}
$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  setTheme(dark);
});

setTheme(document.documentElement.dataset.theme === 'dark');
fillObForm();
$('#scan-silent-on').checked = scan.silent;
$('#scan-spike-on').checked = scan.spike;
$('#scan-time').value = scan.time;
load();
