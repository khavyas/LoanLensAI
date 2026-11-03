// The Fraud Arena page (plan FA-08): one self-contained HTML document served by the secret-guarded
// admin router, so it needs no separate build and no login. It reads the secret from its own URL and
// passes it back to the arena endpoints. All text from the server is inserted with textContent.
export const ARENA_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fraud Arena</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#14213d;--muted:#5b6578;--line:#dfe3ea;--ok:#0f7b45;--okbg:#e3f5ea;--bad:#b42318;--badbg:#fde8e6;--warn:#9a6700;--warnbg:#fff3d1;--info:#1f4e9c;--infobg:#e6eefb;--btn:#14213d;--btnink:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e1420;--card:#172033;--ink:#e8ecf4;--muted:#9aa6bd;--line:#2a3550;--ok:#4ade80;--okbg:#12301f;--bad:#ff8a80;--badbg:#3a1815;--warn:#f5c451;--warnbg:#3a2f10;--info:#8ab4ff;--infobg:#16284a;--btn:#e8ecf4;--btnink:#0e1420}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 48px}
h1{margin:0 0 4px;font-size:26px}h2{font-size:16px;margin:28px 0 10px}
.sub{color:var(--muted);margin:0 0 16px;max-width:760px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0}
button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:9px 14px;border-radius:8px;cursor:pointer}
button.primary{background:var(--btn);color:var(--btnink);border-color:var(--btn);font-weight:600;font-size:16px;padding:11px 20px}
button:disabled{opacity:.5;cursor:default}
input{font:inherit;width:90px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.card .n{font-size:30px;font-weight:700;line-height:1.1}.card .l{font-weight:600;margin-top:2px}.card .d{color:var(--muted);font-size:13px;margin-top:4px}
.note{background:var(--infobg);color:var(--info);border-radius:10px;padding:10px 14px;font-size:14px;margin-top:12px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
tr:last-child td{border-bottom:0}.feedrow{cursor:pointer}.feedrow:hover{background:var(--bg)}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
.caught{background:var(--okbg);color:var(--ok)}.missed{background:var(--badbg);color:var(--bad)}.clean{background:var(--infobg);color:var(--info)}.false-alarm{background:var(--warnbg);color:var(--warn)}
.detail{background:var(--bg);font-size:14px}.detail ul{margin:4px 0 8px;padding-left:18px}.muted{color:var(--muted)}.num{text-align:right;white-space:nowrap}
.wrap{overflow-x:auto}.empty{padding:22px;text-align:center;color:var(--muted)}
@media (max-width:640px){.hide-s{display:none}}
</style>
</head>
<body>
<main>
  <h1>Fraud Arena</h1>
  <p class="sub">Each press creates a forged application from a genuine one, runs LoanLens's real document checks on it, and records whether they caught it. Missed attacks are shown, not hidden.</p>
  <div class="bar">
    <button class="primary" id="go">Generate attack</button>
    <button id="go25">Run 25</button>
    <button id="reset">Reset</button>
    <label class="muted">Seed <input id="seed" type="number" value="1" min="0"></label>
    <span class="muted" id="status"></span>
  </div>
  <div class="cards" id="cards"></div>
  <div class="note" id="caveat"></div>
  <h2>Live feed <span class="muted" style="font-weight:400">(click a row for what was changed)</span></h2>
  <div class="wrap"><table id="feed"><thead><tr><th>#</th><th>Attack</th><th class="hide-s">Applicant</th><th>Result</th><th class="hide-s">Flagged by</th><th class="num hide-s">ms</th></tr></thead><tbody></tbody></table></div>
  <h2>Scoreboard by attack type</h2>
  <div class="wrap"><table id="board"><thead><tr><th>Attack</th><th>Expected</th><th class="num">Runs</th><th class="num">Caught</th><th class="num">Missed</th></tr></thead><tbody></tbody></table></div>
</main>
<script>
const qs = location.search;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pct = (x) => (x == null ? 'n/a' : Math.round(x * 100) + '%');
const WORDS = { caught: 'CAUGHT', missed: 'MISSED', clean: 'CLEAN', 'false-alarm': 'FALSE ALARM' };
const EXPECT = { caught: 'should be caught', miss: 'known limit', clean: 'genuine file', partial: 'depends on size' };
const open = new Set();
let busy = false;

async function call(path, method) {
  const [name, own] = path.split('?');
  const params = new URLSearchParams(own || '');
  new URLSearchParams(qs).forEach((v, k) => params.set(k, v));
  const res = await fetch('/admin/arena/' + name + '?' + params, { method: method || 'POST' });
  if (!res.ok) throw new Error('Request failed (' + res.status + ')');
  return res.json();
}
function card(n, label, detail) {
  const c = el('div', 'card'); c.append(el('div', 'n', n), el('div', 'l', label), el('div', 'd', detail)); return c;
}
function render(r) {
  $('cards').replaceChildren(
    card(pct(r.designedDetectionRate), 'Built-to-catch attacks caught', 'Edits the checks are designed to detect'),
    card(pct(r.knownLimitMissRate), 'Known-limit forgeries that slip through', 'Forgeries no document check can prove; listed openly'),
    card(pct(r.borderlineDetectionRate), 'Borderline edits caught', 'Depends on how big the edit is'),
    card(String(r.falseAlarms), 'False alarms on genuine files', r.controls + ' genuine files checked'));
  $('caveat').textContent = r.runs
    ? 'Overall: ' + r.caught + ' of ' + r.attacks + ' attacks caught (' + pct(r.detectionRate) + ', likely range ' + pct(r.detectionInterval.low) + ' to ' + pct(r.detectionInterval.high) + '). This depends on the mix of attacks in the catalogue, so read the four numbers above, not just this one. Attacks edit extracted fields; they do not test reading a doctored image.'
    : 'No attacks yet. Press Generate attack.';
  const tb = $('feed').tBodies[0]; tb.replaceChildren();
  if (!r.recent.length) { const tr = el('tr'); const td = el('td', 'empty', 'Nothing yet'); td.colSpan = 6; tr.append(td); tb.append(tr); }
  for (const x of r.recent) {
    const tr = el('tr', 'feedrow');
    const badge = el('span', 'badge ' + x.outcome, WORDS[x.outcome]);
    const flaggedBy = x.fired.length ? [...new Set(x.fired.map((f) => f.field))].join(', ') : 'nothing';
    const cells = [el('td', null, String(x.n)), el('td', null, x.label), el('td', 'hide-s', x.base), el('td'), el('td', 'hide-s', flaggedBy), el('td', 'num hide-s', String(x.ms))];
    cells[3].append(badge); tr.append(...cells);
    tr.onclick = () => { open.has(x.n) ? open.delete(x.n) : open.add(x.n); render(r); };
    tb.append(tr);
    if (open.has(x.n)) {
      const d = el('tr', 'detail'); const td = el('td'); td.colSpan = 6;
      td.append(el('div', null, x.note));
      const ul = el('ul');
      for (const c of x.changes) ul.append(el('li', null, c.doc + ' / ' + c.field + ': ' + (c.from == null ? 'none' : c.from) + ' -> ' + c.to));
      if (!x.changes.length) ul.append(el('li', 'muted', 'No changes: this is a genuine file.'));
      td.append(el('div', 'muted', 'What was changed'), ul);
      const fl = el('ul');
      for (const f of x.fired) fl.append(el('li', null, f.field + ' (' + f.status + ') on ' + f.doc));
      if (!x.fired.length) fl.append(el('li', 'muted', 'No check flagged this file.'));
      td.append(el('div', 'muted', 'What the checks said'), fl);
      d.append(td); tb.append(d);
    }
  }
  const bb = $('board').tBodies[0]; bb.replaceChildren();
  for (const row of r.byAttack) {
    const tr = el('tr');
    tr.append(el('td', null, row.label), el('td', 'muted', EXPECT[row.expected]), el('td', 'num', String(row.runs)),
      el('td', 'num', row.expected === 'clean' ? '-' : row.caught + ' (' + pct(row.detectionRate) + ')'),
      el('td', 'num', row.expected === 'clean' ? row.falseAlarms + ' false alarms' : String(row.missed)));
    bb.append(tr);
  }
}
async function act(fn) {
  if (busy) return; busy = true; document.querySelectorAll('button').forEach((b) => (b.disabled = true)); $('status').textContent = '';
  try { render(await fn()); } catch (e) { $('status').textContent = e.message; }
  busy = false; document.querySelectorAll('button').forEach((b) => (b.disabled = false));
}
$('go').onclick = () => act(() => call('next'));
$('go25').onclick = () => act(() => call('next?count=25'));
$('reset').onclick = () => act(() => { open.clear(); return call('reset?seed=' + encodeURIComponent($('seed').value || '1')); });
act(() => call('report', 'GET'));
</script>
</body>
</html>`;
