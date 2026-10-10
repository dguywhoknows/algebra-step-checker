const { $, $$, h, esc, busy, toast, store } = Kit;

let profile = store.get('stepcheck.profile', {});
let log = store.get('stepcheck.history', []);
const saveProfile = () => store.set('stepcheck.profile', profile);
const saveLog = () => store.set('stepcheck.history', log.slice(0, 300));
let lastRun = null;
const tex = (s, el) => { try { katex.render(s, el, { throwOnError: false, displayMode: false }); } catch { el.textContent = s; } return el; };
const texOf = (raw) => {
  if (/\bor\b/i.test(raw)) return raw.split(/\bor\b/i).map((p) => texOf(p.trim())).join(' \\quad\\text{or}\\quad ');
  try { return parseLine(raw).tex; } catch { return raw; }
};

/* ================= check ================= */
async function check(record = true) {
  const problem = $('#problem').value;
  const run = checkSteps(problem, $('#steps').value.split('\n'));
  lastRun = Object.assign({ problem }, run);
  renderLines();
  const okSteps = run.res.filter((r) => r.state === 'ok').length;
  const entry = { t: Date.now(), problem, steps: run.res.length - 1, firstBad: run.firstBad, tag: null };
  if (run.firstBad < 0 && okSteps && record) {
    Object.keys(profile).forEach((k) => (profile[k] = Math.max(0, profile[k] - 0.5)));
    saveProfile();
    const last = run.res[run.res.length - 1];
    $('#diag').classList.remove('hidden');
    $('#diag').innerHTML = `<h2>Every step checks out</h2><p>${okSteps} step${okSteps === 1 ? '' : 's'} verified.${isFinished(last.L) ? ' The last line is a finished answer.' : ' Keep going: the last line is not a final answer yet.'}</p>`;
  } else if (run.firstBad >= 0) entry.tag = await diagnose(record);
  if (record) { log.unshift(entry); saveLog(); }
  renderProfile();
}
function renderLines() {
  const box = $('#lines');
  box.innerHTML = '';
  lastRun.res.forEach((r, i) => {
    const icon = { ok: '✓', bad: '✗', skip: '·', given: 'P', err: '?' }[r.state];
    box.append(h('div', { class: 'ln ' + r.state }, h('span', { class: 'n' }, i === 0 ? '' : i), h('span', { class: 'st' }, icon), tex(r.L ? r.L.tex : r.raw, h('div')), h('div', { class: 'why' }, r.why + (r.cls ? ` · ${r.cls}` : ''))));
  });
}
async function diagnose(record = true) {
  const { res, firstBad, problem } = lastRun;
  const bad = res[firstBad], good = res.slice(0, firstBad).filter((r) => r.state !== 'err').pop();
  const box = $('#diag');
  box.classList.remove('hidden');
  box.innerHTML = '<div class="row"><span class="spinner"></span> Diagnosing your reasoning…</div>';
  const out = await AI.chat([
    { role: 'system', content: `You are an expert math teacher diagnosing a student's error. A verifier already proved the step is wrong. Identify the misconception using ONE tag from: ${Object.entries(TAGS).map(([k, v]) => `${k} (${v})`).join('; ')}.
Return JSON {"tag":"TAG","what_went_wrong":"1-2 sentences, specific to these expressions","hints":["gentle Socratic question","more direct nudge","nearly gives it away"],"correct_step":"the correct version of this step, plain text math"}. Never be condescending.` },
    { role: 'user', content: `Problem: ${problem}\nLast correct line: ${good?.raw}\nStudent's wrong line: ${bad.raw}\nVerifier evidence: ${bad.why}${bad.cls ? '; ' + bad.cls : ''}` },
  ], { json: true, temperature: 0.2, demo: () => demoDiag(good, bad) });
  const tag = TAGS[out.tag] ? out.tag : 'OTHER';
  if (record) { profile[tag] = (profile[tag] || 0) + 1; saveProfile(); }
  let shown = 0;
  const hints = h('div'), total = (out.hints || []).length;
  const more = h('button', { class: 'btn sm', onclick: () => {
    if (shown < total) { hints.append(h('div', { class: 'hint' }, h('b', {}, `Hint ${shown + 1}: `), out.hints[shown])); shown++; }
    else { hints.append(h('div', { class: 'hint' }, h('b', {}, 'Correct step: '), out.correct_step || '—')); more.disabled = true; }
    more.textContent = shown < total ? `Next hint (${shown + 1}/${total})` : 'Show the correct step';
  } }, `Get a hint (1/${total})`);
  box.innerHTML = '';
  box.append(h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, `Step ${firstBad} needs another look`), h('span', { class: 'tag bad tagbig' }, tag.replace(/_/g, ' ').toLowerCase())),
    h('p', { style: 'margin-top:10px' }, h('b', {}, TAGS[tag] + '. '), out.what_went_wrong || ''),
    h('div', { class: 'row' }, more, h('button', { class: 'btn sm ghost', onclick: () => openSolver(problem) }, 'Worked solution')), hints);
  return tag;
}
function demoDiag(good, bad) {
  const g = good?.raw || '', b = bad.raw;
  const shift = bad.r1 && bad.r2 && bad.r1.length === 1 && bad.r2.length === 1 ? bad.r2[0] - bad.r1[0] : null;
  if (shift && (g.match(/\d+(\.\d+)?/g) || []).some((n) => Math.abs(Math.abs(shift) - 2 * +n) < 1e-9)) return { tag: 'MOVE_TERM_SIGN', what_went_wrong: 'A term moved to the other side of the equation without changing its sign, so the answer is off by twice that term.', hints: ['What operation do you do to both sides to move that term?', 'If you add it on the left, what happens on the right?', 'Moving “−2” across the equals sign turns it into “+2”.'], correct_step: '3x - 2x = 9 + 2' };
  if (/\^\s*2/.test(g) && /\(/.test(g) && !/\(/.test(b)) return { tag: 'EXP_OVER_ADD', what_went_wrong: 'Squaring a sum isn’t the same as squaring each part: (a+b)² = a² + 2ab + b². The middle term went missing.', hints: ['What do you get if you write (x+3)² as (x+3)(x+3) and multiply it out?', 'How many terms appear when you multiply two binomials?', 'Look for the 2·x·3 term.'], correct_step: 'x^2 + 6x + 9' };
  if (/\//.test(g) && !/\//.test(b)) return { tag: 'PARTIAL_DIVISION', what_went_wrong: 'The division has to apply to every term of the numerator, not just the first one.', hints: ['Is (A+B)/C the same as A/C + B?', 'Try splitting the fraction into two fractions with the same denominator.', 'Divide 4x by 2x too.'], correct_step: 'x + 2' };
  if (/-\s*\d*\s*\(/.test(g) && bad.cls) return { tag: 'NEG_DISTRIBUTION', what_went_wrong: 'The minus sign in front of the bracket has to multiply every term inside it.', hints: ['What is −1 × (−3)?', 'Rewrite −(a − b) one term at a time.', '−2(x − 3) becomes −2x + 6.'], correct_step: '—' };
  if (bad.cls && /sign/.test(bad.cls)) return { tag: 'MOVE_TERM_SIGN', what_went_wrong: 'A term changed sides of the equation without changing its sign.', hints: ['What operation do you do to both sides to move that term?', 'If you subtract it on the left, what happens on the right?', 'Check the sign of each moved term.'], correct_step: '—' };
  return { tag: bad.cls && /constant/.test(bad.cls) ? 'ARITHMETIC' : 'OTHER', what_went_wrong: `The verifier shows: ${bad.why}.`, hints: ['Re-do this step slowly, one operation at a time.', 'Check each sign and each coefficient.', 'Substitute a number for x into both lines and compare.'], correct_step: '—' };
}
const SAMPLES = [
  ['Linear equation (sign slip)', 'Solve 3(x - 2) + 4 = 2x + 9', '3x - 6 + 4 = 2x + 9\n3x - 2 = 2x + 9\n3x - 2x = 9 - 2\nx = 7'],
  ['Expanding a square', 'Expand (x + 3)^2', 'x^2 + 9'],
  ['Dividing a fraction', 'Simplify (2x^2 + 4x) / (2x)', 'x^2 + 4x'],
  ['Negative bracket', 'Solve 10 - 2(x - 3) = x + 1', '10 - 2x - 6 = x + 1\n4 - 2x = x + 1\n3 = 3x\nx = 1'],
  ['Quadratic (all correct)', 'Solve x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0\nx = 2 or x = 3'],
];
SAMPLES.forEach(([name], i) => $('#samples').append(h('option', { value: i }, name)));
$('#samples').onchange = () => { const [, p, s] = SAMPLES[+$('#samples').value]; $('#problem').value = p; $('#steps').value = s; $('#check').click(); };
$('#check').onclick = (e) => busy(e.currentTarget, check);
$('#toSolver').onclick = () => openSolver($('#problem').value);

/* ================= solver ================= */
function openSolver(problem) { $('#solveIn').value = problem; Router.go('solver'); solve(); }
function solve() {
  const out = $('#solveOut'), problem = $('#solveIn').value.trim();
  out.innerHTML = '';
  if (!problem) return;
  let s;
  try { s = solveSteps(problem); } catch (e) { out.append(h('div', { class: 'card empty' }, 'Could not read that: ' + e.message)); return; }
  const run = checkSteps(problem, s.steps.filter((x) => !x.note).map((x) => x.text));
  let k = 0;
  const card = h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'Worked solution'), h('label', { class: 'chk small' }, h('input', { type: 'checkbox', id: 'oneByOne', onchange: (e) => { $$('.solve-step').forEach((el, i) => el.classList.toggle('reveal-hidden', e.target.checked && i > 0)); } }), ' Reveal one step at a time')),
    h('div', { class: 'solve-step' }, h('span', { class: 'small muted' }, 'Start'), h('div', { class: 'body' }, tex(texOf(problem), h('div')))));
  s.steps.forEach((st, i) => {
    const verdict = st.note ? h('span', { class: 'small muted' }, 'shorthand, not checked') : (() => { const r = run.res[++k]; return h('span', { class: r && r.state === 'ok' ? 'ok' : 'small muted' }, r && r.state === 'ok' ? 'verified' : r ? r.why : ''); })();
    const el = h('div', { class: 'solve-step', onclick: () => el.classList.remove('reveal-hidden') }, h('span', { class: 'small muted mono' }, i + 1), h('div', { class: 'body' }, tex(st.note ? st.text.replace('±', '\\pm').replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}').replace(/^(.*) = \((.*)\) \/ (\S+)$/, '$1 = \\frac{$2}{$3}') : texOf(st.text), h('div')), h('div', { class: 'why' }, st.why, ' · ', verdict)));
    card.append(el);
  });
  if (s.note) card.append(h('p', { class: 'hint' }, s.note));
  out.append(card, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { $('#plotIn').value = normalizeInput(problem); Router.go('graph'); plot(true); } }, 'Graph it'), h('button', { class: 'btn ghost', onclick: () => { $('#problem').value = problem; $('#steps').value = ''; Router.go('check'); $('#steps').focus(); } }, 'Try it myself')));
}
$('#solveGo').onclick = solve;
$('#solveIn').addEventListener('keydown', (e) => e.key === 'Enter' && solve());

/* ================= graph ================= */
function plot(fit) {
  const cv = $('#plot'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  let L;
  try { L = parseLine($('#plotIn').value); } catch (e) { $('#plotInfo').textContent = e.message; return; }
  if (!L || L.vars.length > 1) { $('#plotInfo').textContent = 'Use a single variable.'; return; }
  const v = L.vars[0] || 'x', at = (k, x) => real(L.side(k, { [v]: x }));
  const rs = L.eq ? roots(L) || [] : roots({ vars: [v], f: (sc) => L.side(0, sc) }) || [];
  if (fit && rs.length) { const lo = Math.min(...rs), hi = Math.max(...rs), pad = Math.max(2, (hi - lo) * 0.5); $('#xMin').value = Math.floor(lo - pad); $('#xMax').value = Math.ceil(hi + pad); }
  const x0 = +$('#xMin').value, x1 = +$('#xMax').value;
  if (!(x1 > x0)) { $('#plotInfo').textContent = 'The x range is empty.'; return; }
  const curves = L.eq ? [0, 1] : [0], N = 400, pts = curves.map((k) => Array.from({ length: N + 1 }, (_, i) => { const x = x0 + ((x1 - x0) * i) / N; return [x, at(k, x)]; }));
  const ys = pts.flat().map((p) => p[1]).filter(isFinite).sort((a, b) => a - b);
  let y0 = ys[Math.floor(ys.length * 0.02)] ?? -5, y1 = ys[Math.floor(ys.length * 0.98)] ?? 5;
  if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
  const padY = (y1 - y0) * 0.1; y0 -= padY; y1 += padY;
  const X = (x) => ((x - x0) / (x1 - x0)) * W, Y = (y) => H - ((y - y0) / (y1 - y0)) * H;
  const css = getComputedStyle(document.body), line = css.getPropertyValue('--line').trim(), muted = css.getPropertyValue('--muted').trim(), accent = css.getPropertyValue('--accent').trim();
  g.font = '11px Inter, sans-serif'; g.lineWidth = 1;
  const step = (span) => { const raw = span / 10, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw); };
  const sx = step(x1 - x0), sy = step(y1 - y0);
  g.strokeStyle = line; g.fillStyle = muted;
  for (let x = Math.ceil(x0 / sx) * sx; x <= x1; x += sx) { g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); g.globalAlpha = 1; g.fillText(+x.toFixed(6), X(x) + 3, Math.min(H - 4, Math.max(12, Y(0) - 4))); }
  for (let y = Math.ceil(y0 / sy) * sy; y <= y1; y += sy) { g.globalAlpha = 0.5; g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke(); g.globalAlpha = 1; if (Math.abs(y) > 1e-12) g.fillText(+y.toFixed(6), Math.min(W - 30, Math.max(3, X(0) + 3)), Y(y) - 3); }
  g.strokeStyle = muted; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.moveTo(X(0), 0); g.lineTo(X(0), H); g.stroke();
  const colors = [accent, '#e2703a'];
  pts.forEach((ps, k) => {
    g.strokeStyle = colors[k]; g.lineWidth = 2.5; g.beginPath();
    let pen = false;
    ps.forEach(([x, y]) => { if (!isFinite(y) || y < y0 - (y1 - y0) * 2 || y > y1 + (y1 - y0) * 2) { pen = false; return; } if (pen) g.lineTo(X(x), Y(y)); else { g.moveTo(X(x), Y(y)); pen = true; } });
    g.stroke();
  });
  g.fillStyle = 'var(--text)';
  rs.forEach((r) => { const y = L.eq ? at(0, r) : 0; g.fillStyle = css.getPropertyValue('--text').trim(); g.beginPath(); g.arc(X(r), Y(y), 5, 0, 7); g.fill(); g.fillText(`x = ${fmtNum(r)}`, X(r) + 8, Y(y) - 8); });
  $('#plotInfo').innerHTML = (L.eq ? `<span style="color:${colors[0]}">■</span> left side &nbsp; <span style="color:${colors[1]}">■</span> right side<br>` : '') + (rs.length ? `${L.eq ? 'Solutions' : 'Zeros'}: <b>${rs.map(fmtNum).join(', ')}</b>` : `No real ${L.eq ? 'solutions' : 'zeros'} between −60 and 60.`);
}
$('#plotGo').onclick = () => plot(false);
$('#plotFit').onclick = () => plot(true);
$('#plotIn').addEventListener('keydown', (e) => e.key === 'Enter' && plot(true));
window.addEventListener('resize', () => Router.current === 'graph' && plot(false));

/* ================= practice ================= */
let set = [];
Object.entries(KINDS).forEach(([k, v]) => $('#pKind').append(h('option', { value: k }, v)));
const weakest = () => Object.entries(profile).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
function newSet() {
  const kind = $('#pKind').value === 'auto' ? KIND_FOR_TAG[weakest()] || 'linear' : $('#pKind').value;
  const base = Date.now() % 100000;
  set = Array.from({ length: +$('#pCount').value }, (_, i) => Object.assign(generateProblem(kind, base + i * 7919), { work: '', solved: false, tries: 0 }));
  renderSet();
  if ($('#pKind').value === 'auto') toast(weakest() ? `Targeting: ${TAGS[weakest()]}` : 'No mistakes recorded yet, so here is a mixed linear set');
}
function renderSet() {
  const box = $('#pList');
  box.innerHTML = '';
  set.forEach((p, i) => {
    const ta = h('textarea', { class: 'mono', placeholder: 'Your steps, one per line. End with the answer.', 'aria-label': 'Steps', oninput: (e) => (p.work = e.target.value) });
    ta.value = p.work;
    const res = h('div', { class: 'res' });
    const checkIt = () => {
      p.tries++;
      const run = checkSteps(p.problem, p.work.split('\n')), last = run.res[run.res.length - 1];
      if (run.firstBad >= 0) { res.innerHTML = `<span class="tag bad">Step ${run.firstBad}</span> ${esc(run.res[run.firstBad].why)}${run.res[run.firstBad].cls ? ' · ' + esc(run.res[run.firstBad].cls) : ''}`; return renderStats(); }
      if (run.res.length < 2 || !isFinished(last.L)) { res.innerHTML = '<span class="tag warn">Keep going</span> Every step is valid so far, but the last line is not a final answer.'; return renderStats(); }
      p.solved = true;
      Object.keys(profile).forEach((k) => (profile[k] = Math.max(0, profile[k] - 0.25)));
      saveProfile();
      log.unshift({ t: Date.now(), problem: p.problem, steps: run.res.length - 1, firstBad: -1, tag: null, practice: true });
      saveLog();
      renderSet();
    };
    box.append(h('div', { class: 'prob' + (p.solved ? ' solved' : '') },
      h('div', { class: 'row between' }, h('b', {}, `${i + 1}.`), h('span', { class: 'small muted' }, p.solved ? `Solved${p.tries > 1 ? ` in ${p.tries} tries` : ''}` : KINDS[p.kind] || p.kind)),
      tex(texOf(p.problem), h('div', { style: 'font-size:1.1em' })),
      p.solved ? h('div', { class: 'small', style: 'color:var(--good)' }, 'Correct, and every step checks out.') : [ta, h('div', { class: 'row' }, h('button', { class: 'btn sm primary', onclick: checkIt }, 'Check'), h('button', { class: 'btn sm ghost', onclick: () => { const s = solveSteps(p.problem); res.innerHTML = `<span class="small muted">First step: </span><code>${esc(s.steps[0]?.text || '—')}</code>`; } }, 'Hint'), h('button', { class: 'btn sm ghost', onclick: () => openSolver(p.problem) }, 'Solution')), res]));
  });
  renderStats();
}
function renderStats() {
  const solved = set.filter((p) => p.solved).length, tries = set.reduce((a, p) => a + p.tries, 0);
  $('#pStats').innerHTML = [['Solved', `${solved}/${set.length}`], ['Checks', tries]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
}
$('#pNew').onclick = newSet;
$('#pAi').onclick = (e) => busy(e.currentTarget, async () => {
  const top = weakest() || 'MOVE_TERM_SIGN';
  const out = await AI.chat([
    { role: 'system', content: 'Create ONE practice problem that specifically tempts the given misconception, solvable in 3-5 algebra steps, with whole-number answers. Return JSON {"problem":"e.g. Solve 5(x - 3) = 2x + 6"}.' },
    { role: 'user', content: `Misconception: ${top}: ${TAGS[top]}` },
  ], { json: true, temperature: 0.9, demo: () => generateProblem(KIND_FOR_TAG[top] || 'linear', Date.now() % 100000) });
  let s;
  try { s = solveSteps(out.problem); } catch { s = null; }
  if (!s || (!s.answer && !s.steps.length)) return toast('The model’s problem could not be verified, try again', 'err');
  set.unshift({ kind: KIND_FOR_TAG[top] || 'linear', problem: out.problem, work: '', solved: false, tries: 0 });
  renderSet();
});

/* ================= progress ================= */
function renderProfile() {
  const entries = Object.entries(profile).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const rows = (list) => (list.length ? list.map(([k, v]) => `<div class="node"><span title="${esc(TAGS[k])}">${esc(TAGS[k] || k)}</span><div class="bar"><span style="width:${(100 * v) / max}%;background:${v >= 3 ? 'var(--bad)' : v >= 1.5 ? 'var(--warn)' : 'var(--accent)'}"></span></div><b class="mono" style="text-align:right">${+v.toFixed(1)}</b></div>`).join('') : '<div class="empty">No misconceptions recorded yet.</div>');
  $('#profile').innerHTML = rows(entries.slice(0, 3));
  $('#profileFull').innerHTML = rows(entries);
  const total = log.length, clean = log.filter((x) => x.firstBad < 0).length, prac = log.filter((x) => x.practice).length;
  $('#progKpis').innerHTML = [['Checks', total], ['Clean solutions', total ? Math.round((100 * clean) / total) + '%' : '—'], ['Practice solved', prac], ['Top issue', weakest() ? weakest().replace(/_/g, ' ').toLowerCase() : 'none']]
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('#recent').innerHTML = log.slice(0, 15).map((x) => `<div class="recent-row"><span class="small muted">${new Date(x.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>${esc(x.problem)}</span><span class="tag ${x.firstBad < 0 ? 'good' : 'bad'}">${x.firstBad < 0 ? (x.practice ? 'practice' : 'clean') : 'step ' + x.firstBad}</span></div>`).join('') || '<div class="empty">No checks yet.</div>';
}
$('#reset').onclick = () => { if (confirm('Reset your misconception profile and history?')) { profile = {}; log = []; saveProfile(); saveLog(); renderProfile(); } };
Router.on('progress', renderProfile);
Router.on('graph', () => plot(false));
Router.on('practice', () => set.length || newSet());

renderProfile();
$('#problem').value = SAMPLES[0][1];
$('#steps').value = SAMPLES[0][2];
check(false);

/* ================= AI command box ================= */
Copilot.register({
  context: () => `Page: ${Router.current}. Check page problem: ${$('#problem').value}. Steps: ${$('#steps').value.replace(/\n/g, ' | ')}. ${lastRun ? (lastRun.firstBad >= 0 ? `First wrong step: ${lastRun.firstBad} (${lastRun.res[lastRun.firstBad].why})` : 'All steps verified') : ''}. Weakest misconception: ${weakest() ? TAGS[weakest()] : 'none yet'}.`,
  actions: [
    { name: 'check_work', description: 'Verify a student\'s steps line by line and diagnose the first error. Omit arguments to check what is already on the Check page.', params: { problem: 'optional, e.g. Solve 3(x - 2) = 9', steps: 'optional, steps separated by newlines' },
      run: async ({ problem, steps }) => { if (problem) $('#problem').value = problem; if (steps) $('#steps').value = Array.isArray(steps) ? steps.join('\n') : steps; Router.go('check'); await check(); return lastRun.firstBad >= 0 ? `Step ${lastRun.firstBad} is wrong: ${lastRun.res[lastRun.firstBad].why}` : 'Every step checks out'; } },
    { name: 'worked_solution', description: 'Show a verified step-by-step solution', params: { problem: 'e.g. Solve 2x^2 - 3x + 1 = 0' }, run: ({ problem }) => { openSolver(problem); return `Solved ${problem}`; } },
    { name: 'graph', description: 'Plot an equation or expression in one variable', params: { expression: 'e.g. x^2 - 5x + 6 = 0' }, run: async ({ expression }) => { $('#plotIn').value = expression; Router.go('graph'); await new Promise((r) => setTimeout(r, 40)); plot(true); return $('#plotInfo').textContent || `Plotted ${expression}`; } },
    { name: 'practice_set', description: 'Start a practice set. kind "auto" targets the weakest misconception.', params: { kind: ['auto', ...Object.keys(KINDS)].join(' | '), count: 'number of problems' },
      run: ({ kind, count }) => { Router.go('practice'); $('#pKind').value = kind && (kind === 'auto' || KINDS[kind]) ? kind : 'auto'; if (count) { const sel = $('#pCount'); sel.value = String(count); if (sel.value !== String(count) && sel.options) sel.value = [...sel.options].map((o) => o.value).reduce((a, b) => (Math.abs(b - count) < Math.abs(a - count) ? b : a)); } newSet(); return `${set.length} problems: ${set.map((p) => p.problem).join('; ')}`; } },
    { name: 'add_practice_problem', description: 'Add one problem you write to the top of the practice set (it is verified first)', params: { problem: 'e.g. Solve 5(x - 3) = 2x + 6' },
      run: ({ problem }) => { const s = solveSteps(problem); if (!s || (!s.answer && !s.steps.length)) throw new Error('Could not verify that problem'); Router.go('practice'); set.unshift({ kind: 'linear', problem, work: '', solved: false, tries: 0 }); renderSet(); return `Added ${problem}`; } },
    { name: 'progress', query: true, description: 'Look up the misconception profile and recent history', params: {}, run: () => JSON.stringify({ misconceptions: Object.entries(profile).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ tag: k, meaning: TAGS[k], weight: +v.toFixed(2) })), recent: log.slice(0, 10).map((x) => ({ problem: x.problem, clean: x.firstBad < 0, tag: x.tag })) }) },
  ],
});
