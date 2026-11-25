import { detectBrokerPatterns, detectCrossing, volumeSpike, volumeSpikeIntraday, dayStats, suspectedGroups } from './patterns.js';
import { buildCandles, orderBlocks, blockInfo } from './candles.js';

const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stored = (key, def) => {
  try { return { ...def, ...JSON.parse(localStorage.getItem(key)) }; } catch { return def; }
};

const state = { data: null, stock: null, rentang: 20, tf: 1440, groups: [], candles: [], blocks: [] };
const ob = stored('ob', { on: true, swing: 5, max: 3, mitigation: 'wick', bull: '#1f9d55', bear: '#d64541',
  avg: true, volume: true, age: true, broker: true });
const scan = stored('scan', { silent: true, spike: true, time: '11:00:00' });
let chart, candleSeries, volSeries, attempt = 0;

function show(which) {
  for (const id of ['loading', 'error', 'ready']) $('#' + id).hidden = id !== which;
}

async function load() {
  show('loading');
  try {
    // import dinamis + query baru tiap percobaan, agar tombol "Muat ulang" benar-benar mencoba lagi
    const { generate } = await import(`./sample.js?r=${attempt++}`);
    if (!window.LightweightCharts) throw new Error('library grafik tidak termuat');
    state.data = generate();
    state.stock = Object.keys(state.data.stocks)[0];
    state.groups = suspectedGroups(state.data.stocks, state.data.dates);
    show('ready');
    chart ??= initChart();
    render();
    renderChart();
  } catch {
    show('error');
  }
}

function analyse(code) {
  const { dates, stocks } = state.data;
  const days = stocks[code];
  const win = dates.slice(-state.rentang);
  return {
    patterns: detectBrokerPatterns(days, dates, state.rentang, state.groups),
    crossing: win.flatMap((d) => detectCrossing(days[d] ?? []).map((c) => ({ ...c, date: d }))),
    spike: volumeSpike(days, dates, dates.at(-1)),
    last: dayStats(days[dates.at(-1)] ?? []).last,
    from: win[0], to: win.at(-1),
  };
}

function render() {
  const codes = Object.keys(state.data.stocks);
  $('#stocks').innerHTML = codes.map((code) => {
    const a = analyse(code);
    const label = (p) => (p.silent ? 'Silent ' : '') + (p.side === 'akumulasi' ? 'Akumulasi' : 'Distribusi') + (p.silent ? '' : ' Masif');
    const flags = [
      ...new Set(a.patterns.filter((p) => p.masif).map(label)),
      a.patterns.some((p) => p.penampung) && 'Penampung',
      a.crossing.length && 'Crossing',
      a.spike?.spike && 'Lonjakan Volume',
    ].filter(Boolean);
    return `<li><button type="button" data-code="${esc(code)}" aria-current="${code === state.stock}">
      <span class="code">${esc(code)}</span>
      <span class="flags">${flags.length ? flags.join(', ') : 'Tidak ada pola khusus'}</span>
    </button></li>`;
  }).join('');

  const a = analyse(state.stock);
  $('#code').textContent = state.stock;
  $('#meta').textContent = `Harga terakhir ${fmt.format(a.last)}, ${a.from} sampai ${a.to}`;

  const s = a.spike;
  $('#spike').innerHTML = !s
    ? 'Lonjakan Volume butuh riwayat 20 hari bursa.'
    : `Volume hari terakhir ${fmt.format(s.vol)} lot, ${s.ratio.toFixed(1).replace('.', ',')} kali rata-rata 20 hari.`
      + (s.spike ? ' <strong>Lonjakan Volume</strong>' : '');

  const max = Math.max(1, ...a.patterns.map((p) => Math.abs(p.netLot)));
  $('#brokers tbody').innerHTML = a.patterns.map((p) => {
    const tags = [p.masif && 'Masif', p.pasif && 'Pasif', p.penampung && 'Penampung'].filter(Boolean)
      .map((t) => `<span class="tag">${t}</span>`).join('')
      + (p.silent ? '<span class="tag tag-silent">Silent</span>' : '');
    const side = { akumulasi: 'Akumulasi', distribusi: 'Distribusi' }[p.side] ?? '';
    const kind = p.kind && `<span class="tag tag-${p.kind}">${{ dugaan: 'Kelompok Dugaan, perkiraan', pribadi: 'Kelompok Pribadi', resmi: 'Kelompok Resmi' }[p.kind]}</span>`;
    const w = Math.abs(p.netLot) / max;
    return `<tr>
      <td><strong>${esc(p.broker)}</strong>${kind || ''}</td>
      <td class="pola"><span class="side-${p.side}">${side}</span>${tags}</td>
      <td class="num"><span class="net"><span class="bar" aria-hidden="true"><i class="${p.netLot > 0 ? 'buy' : 'sell'}" style="--w:${w}"></i></span>${p.netLot > 0 ? '+' : ''}${fmt.format(p.netLot)}</span></td>
      <td class="num">${p.avgBuy == null ? '-' : fmt.format(p.avgBuy)}</td>
      <td class="num">${p.avgSell == null ? '-' : fmt.format(p.avgSell)}</td>
      <td class="num">${p.side ? `${p.daysSame}/${p.days}` : '-'}</td>
    </tr>`;
  }).join('');
  $('#brokers').parentElement.hidden = a.patterns.length === 0;
  $('#empty').hidden = a.patterns.length > 0;
  $('#empty').textContent = `Tidak ada Broker yang memenuhi syarat Akumulasi, Distribusi, atau Penampung dalam ${state.rentang} hari terakhir. Coba Rentang lain.`;

  $('#crossing').innerHTML = a.crossing.length
    ? a.crossing.map((c) => `<li>${c.date}: <strong>${esc(c.a)}</strong> jual ${fmt.format(c.aToB)} lot ke <strong>${esc(c.b)}</strong>, ${esc(c.b)} jual ${fmt.format(c.bToA)} lot ke ${esc(c.a)} (${Math.round(c.share * 100)}% volume hari itu)${c.strict ? ' <span class="tag">Crossing Ketat, dalam 15 menit</span>' : ''}</li>`).join('')
    : `<li class="muted">Tidak ada Crossing dalam ${state.rentang} hari terakhir.</li>`;

  $('#dugaan').textContent = state.groups.length
    ? `Perkiraan, belum terverifikasi: ${state.groups.map((g) => g.name).join(', ')}. Pasangan ini pernah tertangkap Crossing bersama dalam 60 hari terakhir, jadi mungkin bertindak untuk pihak yang sama.`
    : 'Belum ada pasangan Broker yang tertangkap Crossing bersama dalam 60 hari terakhir.';

  renderScanner();
}

function renderScanner() {
  const { stocks, dates } = state.data;
  const item = (code, text) => `<li><button type="button" data-code="${esc(code)}">${text}</button></li>`;
  const none = (text) => `<li class="muted small">${text}</li>`;

  $('#scan-silent').hidden = !scan.silent;
  const silent = Object.keys(stocks).flatMap((code) =>
    detectBrokerPatterns(stocks[code], dates, state.rentang, state.groups).filter((p) => p.silent).map((p) => {
      const acc = p.side === 'akumulasi';
      return item(code, `<strong>${esc(code)}</strong> ${acc ? 'diakumulasi' : 'didistribusi'} ${esc(p.broker)} dengan ${fmt.format(Math.abs(p.netLot))} lot di avg ${fmt.format(acc ? p.avgBuy : p.avgSell)}`);
    }));
  $('#scan-silent').innerHTML = silent.join('') || none(`Tidak ada Silent dalam ${state.rentang} hari terakhir.`);

  $('#scan-spike').hidden = !scan.spike;
  $('#scan-time-field').hidden = !scan.spike;
  const jam = scan.time.slice(0, 5);
  const spikes = Object.keys(stocks).flatMap((code) => {
    const s = volumeSpikeIntraday(stocks[code], dates, dates.at(-1), scan.time);
    return s?.spike ? [item(code, `<strong>${esc(code)}</strong> volume ${s.ratio.toFixed(1).replace('.', ',')} kali rata-rata sampai ${jam}`)] : [];
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
  // shortcut: kotak Order Block digambar ulang saat geser/zoom waktu dan resize; geser skala harga manual tidak memicu ulang, ganti ke series primitive bila perlu
  c.timeScale().subscribeVisibleLogicalRangeChange(drawBlocks);
  new ResizeObserver(drawBlocks).observe($('#chart'));
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
  const c = buildCandles(state.data.stocks[state.stock], state.data.dates, state.tf);
  state.candles = c;
  // blok dihitung sebelum setData: event geser waktu dari setData langsung menggambar ulang blok
  state.blocks = ob.on ? orderBlocks(c, ob) : [];
  candleSeries.setData(c.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
  const up = css('--buy') + '80', down = css('--sell') + '80';
  volSeries.setData(c.map((k) => ({ time: k.time, value: k.volume, color: k.close >= k.open ? up : down })));
  if (state.tf < 1440) chart.timeScale().setVisibleLogicalRange({ from: c.length - 120, to: c.length + 2 });
  else chart.timeScale().fitContent();
  requestAnimationFrame(drawBlocks); // koordinat grafik baru siap setelah frame berikutnya
}

function drawBlocks() {
  const layer = $('#ob-layer');
  layer.replaceChildren();
  if (!chart || !state.blocks.length) return;
  const right = $('#chart').clientWidth - chart.priceScale('right').width();
  const ts = chart.timeScale();
  const from = ts.getVisibleRange()?.from ?? 0;
  for (const b of state.blocks) {
    const t = state.candles[b.i].time;
    // candle di luar layar kiri: kotak mulai dari tepi kiri; di luar layar kanan: tidak digambar
    const x = Math.max(0, ts.timeToCoordinate(t) ?? (t < from ? 0 : right));
    const y1 = candleSeries.priceToCoordinate(b.top), y2 = candleSeries.priceToCoordinate(b.bottom);
    if (y1 == null || y2 == null || x >= right) continue;
    const info = blockInfo(state.candles, b, state.data.dates);
    const parts = [
      ob.avg && `Avg ${fmt.format(info.avg)}`,
      ob.volume && `Vol ${fmt.format(info.volume)}`,
      ob.age && `${info.ageDays} hari`,
      ob.broker && info.broker && `${info.broker} ${info.net > 0 ? '+' : ''}${fmt.format(info.net)}`,
    ].filter(Boolean);
    const div = document.createElement('div');
    div.className = 'ob';
    div.textContent = (b.type === 'bull' ? 'OB beli' : 'OB jual') + (parts.length ? ': ' + parts.join(', ') : '');
    Object.assign(div.style, {
      left: x + 'px', width: right - x + 'px',
      top: Math.min(y1, y2) + 'px', height: Math.max(14, Math.abs(y2 - y1)) + 'px',
      background: ob[b.type] + '30', borderColor: ob[b.type],
    });
    layer.append(div);
  }
}

// --- Pengaturan dan event ---

function fillObForm() {
  const f = $('#ob-form');
  for (const el of f.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') el.checked = ob[el.name];
    else el.value = ob[el.name];
  }
}

$('#ob-form').addEventListener('input', (e) => {
  const el = e.target;
  if (el.type === 'checkbox') ob[el.name] = el.checked;
  else if (el.type === 'number') {
    if (!el.checkValidity()) return; // angka di luar batas: tunggu sampai valid
    ob[el.name] = Number(el.value);
  } else ob[el.name] = el.value;
  localStorage.setItem('ob', JSON.stringify(ob));
  state.blocks = ob.on ? orderBlocks(state.candles, ob) : [];
  drawBlocks();
});
$('#ob-form').addEventListener('submit', (e) => e.preventDefault());

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
  if (!btn) return;
  const list = btn.closest('ul').id;
  state.stock = btn.dataset.code;
  render();
  renderChart();
  // fokus tetap di tombol yang sama setelah daftar digambar ulang
  document.querySelector(`#${list} button[data-code="${state.stock}"]`)?.focus();
});
document.querySelectorAll('input[name="rentang"]').forEach((r) =>
  r.addEventListener('change', () => { state.rentang = Number(r.value); render(); }));
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

const theme = localStorage.getItem('theme');
setTheme(theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
fillObForm();
$('#scan-silent-on').checked = scan.silent;
$('#scan-spike-on').checked = scan.spike;
$('#scan-time').value = scan.time;
load();
