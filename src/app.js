import { detectBrokerPatterns, detectCrossing, volumeSpike, dayStats } from './patterns.js';

const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const state = { data: null, stock: null, rentang: 20 };

function show(which) {
  for (const id of ['loading', 'error', 'ready']) $('#' + id).hidden = id !== which;
}

async function load() {
  show('loading');
  try {
    const res = await fetch('data/sample.json');
    if (!res.ok) throw new Error(String(res.status));
    state.data = await res.json();
    state.stock = Object.keys(state.data.stocks)[0];
    show('ready');
    render();
  } catch {
    show('error');
  }
}

function analyse(code) {
  const { dates, stocks } = state.data;
  const days = stocks[code];
  const win = dates.slice(-state.rentang);
  return {
    patterns: detectBrokerPatterns(days, dates, state.rentang),
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
    const tags = [p.masif && 'Masif', p.pasif && 'Pasif'].filter(Boolean)
      .map((t) => `<span class="tag">${t}</span>`).join('')
      + (p.silent ? '<span class="tag tag-silent">Silent</span>' : '');
    const w = Math.abs(p.netLot) / max;
    return `<tr>
      <td><strong>${esc(p.broker)}</strong></td>
      <td class="pola"><span class="side-${p.side}">${p.side === 'akumulasi' ? 'Akumulasi' : 'Distribusi'}</span>${tags}</td>
      <td class="num"><span class="net"><span class="bar" aria-hidden="true"><i class="${p.netLot > 0 ? 'buy' : 'sell'}" style="--w:${w}"></i></span>${p.netLot > 0 ? '+' : ''}${fmt.format(p.netLot)}</span></td>
      <td class="num">${p.avgBuy == null ? '-' : fmt.format(p.avgBuy)}</td>
      <td class="num">${p.avgSell == null ? '-' : fmt.format(p.avgSell)}</td>
      <td class="num">${p.streak}</td>
    </tr>`;
  }).join('');
  $('#brokers').parentElement.hidden = a.patterns.length === 0;
  $('#empty').hidden = a.patterns.length > 0;
  $('#empty').textContent = `Tidak ada Broker yang memenuhi syarat Akumulasi atau Distribusi dalam ${state.rentang} hari terakhir. Coba Rentang lain.`;

  $('#crossing').innerHTML = a.crossing.length
    ? a.crossing.map((c) => `<li>${c.date}: <strong>${esc(c.a)}</strong> jual ${fmt.format(c.aToB)} lot ke <strong>${esc(c.b)}</strong>, ${esc(c.b)} jual ${fmt.format(c.bToA)} lot ke ${esc(c.a)} (${Math.round(c.share * 100)}% volume hari itu)</li>`).join('')
    : `<li class="muted">Tidak ada Crossing dalam ${state.rentang} hari terakhir.</li>`;
}

function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme').setAttribute('aria-pressed', String(dark));
  $('#theme').textContent = dark ? 'Mode terang' : 'Mode gelap';
}

$('#stocks').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-code]');
  if (!btn) return;
  state.stock = btn.dataset.code;
  render();
  $(`#stocks button[data-code="${state.stock}"]`).focus(); // fokus tetap di tombol yang dipilih setelah render ulang
});
document.querySelectorAll('input[name="rentang"]').forEach((r) =>
  r.addEventListener('change', () => { state.rentang = Number(r.value); render(); }));
$('#retry').addEventListener('click', load);
$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  setTheme(dark);
});

const saved = localStorage.getItem('theme');
setTheme(saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
load();
