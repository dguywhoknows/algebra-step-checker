/* Parsing, numeric equivalence checking, error classification, worked solutions and problem generation (pure, unit-tested; needs mathjs as `math`). */

var TAGS = {
  MOVE_TERM_SIGN: 'Keeps the sign when moving a term across “=”',
  NEG_DISTRIBUTION: 'Forgets to distribute a negative sign',
  EXP_OVER_ADD: 'Distributes an exponent over addition, e.g. (a+b)² = a²+b²',
  PARTIAL_DIVISION: 'Divides only one term instead of the whole side',
  CANCEL_TERMS: 'Cancels terms instead of common factors',
  FRACTION_ADD: 'Adds numerators and denominators separately',
  SQRT_OVER_ADD: 'Takes the square root term by term',
  INVERSE_OP: 'Uses the wrong inverse operation',
  INCOMPLETE_EXPANSION: 'Misses terms when expanding brackets',
  ARITHMETIC: 'Basic arithmetic slip',
  OTHER: 'Other reasoning error',
};

/* ---------- parsing ---------- */
function normalizeInput(s) {
  return String(s).replace(/^\s*(solve|simplify|expand|factor|evaluate|find x|find|show that|prove)\b[:\s]*/i, '').replace(/\s*,?\s*for\s+[a-z]\s*$/i, '')
    .replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/√\s*\(/g, 'sqrt(').trim();
}
function parseLine(raw) {
  var s = normalizeInput(raw);
  if (!s) return null;
  var multi = s.match(/^([a-z])\s*=\s*[^=]+(\s*(,|\bor\b)\s*(\1\s*=\s*)?[^=,]+)+$/i);
  if (multi) {
    var v = multi[1];
    s = s.split(/,|\bor\b/i).map(function (p) { return p.replace(/^\s*[a-z]\s*=\s*/i, '').trim(); }).filter(Boolean).map(function (x) { return '(' + v + ' - (' + x + '))'; }).join(' * ') + ' = 0';
  }
  var parts = s.split(/(?<![<>!])=(?!=)/);
  if (parts.length > 2) throw new Error('Use one “=” per line');
  var nodes = parts.map(function (p) { return math.parse(p.trim()); });
  var vars = {};
  nodes.forEach(function (n) { n.traverse(function (x, path, parent) { if (x.isSymbolNode && !(parent && parent.isFunctionNode && path === 'fn') && typeof math[x.name] !== 'function' && ['e', 'pi', 'i', 'E', 'PI'].indexOf(x.name) < 0) vars[x.name] = 1; }); });
  var fns = nodes.map(function (n) { return n.compile(); });
  return {
    raw: s, eq: parts.length === 2, nodes: nodes, vars: Object.keys(vars), multi: !!multi,
    f: parts.length === 2 ? function (sc) { return fns[0].evaluate(sc) - fns[1].evaluate(sc); } : function (sc) { return fns[0].evaluate(sc); },
    side: function (k, sc) { return fns[k].evaluate(sc); },
    tex: nodes.map(function (n) { try { return n.toTex({ parenthesis: 'auto', implicit: 'hide' }); } catch (e) { return n.toString(); } }).join(' = '),
  };
}

/* ---------- numeric equivalence ---------- */
function seededRandom(seed) { var s = seed || 12345; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
function samplePoints(vars, n, seed) {
  var r = seededRandom(seed || 12345), out = [];
  for (var i = 0; i < n; i++) { var p = {}; vars.forEach(function (v) { p[v] = r() * 6 - 3 + (r() < 0.5 ? 0.37 : -0.61); }); out.push(p); }
  return out;
}
function real(v) { return typeof v === 'number' ? v : v && typeof v.re === 'number' && Math.abs(v.im) < 1e-9 ? v.re : NaN; }
function close(a, b) { return Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b)); }
function unionVars(A, B) { var o = {}; A.vars.concat(B.vars).forEach(function (v) { o[v] = 1; }); return Object.keys(o); }
function sameExpr(A, B) {
  var n = 0, pts = samplePoints(unionVars(A, B), 9);
  for (var i = 0; i < pts.length; i++) {
    var a = real(A.f(pts[i])), b = real(B.f(pts[i]));
    if (!isFinite(a) || !isFinite(b)) continue;
    n++;
    if (!close(a, b)) return false;
  }
  return n >= 3;
}
function proportional(A, B) {
  var k = null, n = 0, pts = samplePoints(unionVars(A, B), 9);
  for (var i = 0; i < pts.length; i++) {
    var a = real(A.f(pts[i])), b = real(B.f(pts[i]));
    if (!isFinite(a) || !isFinite(b) || Math.abs(a) < 1e-9) continue;
    var r = b / a;
    if (k === null) k = r; else if (!close(k, r)) return false;
    n++;
  }
  return n >= 3 && k !== null && Math.abs(k) > 1e-12;
}
function roots(L) {
  if (L.vars.length !== 1) return null;
  var v = L.vars[0], f = function (x) { var sc = {}; sc[v] = x; return real(L.f(sc)); };
  var out = [], push = function (r) { if (!out.some(function (o) { return Math.abs(o - r) < 1e-6; })) out.push(+r.toFixed(9)); };
  var px = -60, pf = f(px);
  for (var x = -60 + 0.01; x <= 60; x += 0.01) {
    var fx = f(x);
    if (isFinite(fx) && Math.abs(fx) < 1e-12) push(x);
    else if (isFinite(fx) && isFinite(pf) && Math.sign(fx) !== Math.sign(pf) && Math.abs(fx - pf) < 1e3) {
      var a = px, b = x;
      for (var i = 0; i < 60; i++) { var m = (a + b) / 2; if (Math.sign(f(m)) === Math.sign(f(a))) a = m; else b = m; }
      push((a + b) / 2);
    }
    px = x; pf = fx;
  }
  for (x = -60; x <= 60; x += 0.05) {
    var A = Math.abs(f(x - 0.05)), B = Math.abs(f(x)), C = Math.abs(f(x + 0.05));
    if (B < A && B < C && B < 1e-3) {
      var lo = x - 0.05, hi = x + 0.05;
      for (var k = 0; k < 80; k++) { var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (Math.abs(f(m1)) < Math.abs(f(m2))) hi = m2; else lo = m1; }
      var r = (lo + hi) / 2;
      if (Math.abs(f(r)) < 1e-8) push(r);
    }
  }
  return out.map(function (r) { return Math.abs(r - Math.round(r)) < 1e-6 ? Math.round(r) : +r.toFixed(6); }).sort(function (a, b) { return a - b; });
}
function sameSet(A, B) { return A.length === B.length && A.every(function (a, i) { return Math.abs(a - B[i]) < 1e-5; }); }

function classifyEq(r1, r2) {
  if (r1.length === 1 && r2.length === 1) {
    var a = r1[0], b = r2[0];
    if (close(a, -b)) return 'root has the wrong sign: likely a sign error';
    if (a && close(b / a, Math.round(b / a))) return 'root is ' + Math.round(b / a) + '× too big: multiplication/division slip';
    if (b && close(a / b, Math.round(a / b))) return 'root is ' + Math.round(a / b) + '× too small: multiplication/division slip';
    return 'root moved by ' + +(b - a).toFixed(4) + ': a constant was added or subtracted incorrectly';
  }
  if (r2.length < r1.length) return 'solutions were lost (e.g. dividing by an expression that can be 0, or a missing ± with square roots)';
  return 'extra solutions appeared';
}
function classifyExpr(A, B) {
  var ps = samplePoints(unionVars(A, B), 6);
  var d = ps.map(function (p) { return real(B.f(p)) - real(A.f(p)); }), q = ps.map(function (p) { return real(B.f(p)) / real(A.f(p)); });
  if (d.every(function (x) { return close(x, d[0]); })) return 'off by a constant (' + +d[0].toFixed(4) + '): a term was dropped or mis-added';
  if (q.every(function (x) { return close(x, q[0]); })) return close(q[0], -1) ? 'the whole expression flipped sign: a negative was not distributed' : 'off by a factor of ' + +q[0].toFixed(4);
  return 'the difference depends on the variable: terms were combined, cancelled or expanded incorrectly';
}
function compareLines(prev, cur) {
  if (prev.eq !== cur.eq) return { ok: false, why: prev.eq ? 'An equation turned into an expression (the “=” disappeared)' : 'An expression turned into an equation' };
  if (!cur.eq) return sameExpr(prev, cur) ? { ok: true, why: 'Equivalent expression' } : { ok: false, why: 'Not equal to the previous line', cls: classifyExpr(prev, cur) };
  if (proportional(prev, cur)) return { ok: true, why: 'Same equation, rearranged or scaled' };
  var r1 = roots(prev), r2 = roots(cur);
  if (r1 && r2) return sameSet(r1, r2) ? { ok: true, why: 'Same solution set {' + r1.join(', ') + '}' } : { ok: false, why: 'Solution set changed: {' + (r1.join(', ') || '∅') + '} → {' + (r2.join(', ') || '∅') + '}', cls: classifyEq(r1, r2), r1: r1, r2: r2 };
  return { ok: false, why: 'Not equivalent to the previous equation' };
}
/* Check a whole solution. Returns {res:[{raw, L, state, why, cls}], firstBad}. States: given, ok, bad, skip, err. */
function checkSteps(problem, steps) {
  var lines = [problem].concat(steps).map(function (s) { return String(s).trim(); }).filter(Boolean), res = [], prev = null, firstBad = -1;
  lines.forEach(function (raw, i) {
    var L = null, err = null;
    try { L = parseLine(raw); } catch (e) { err = e.message; }
    if (!L) { res.push({ raw: raw, state: 'err', why: err || 'Could not read this line' }); return; }
    if (i === 0) { res.push({ raw: raw, L: L, state: 'given', why: 'Problem' }); prev = L; return; }
    if (firstBad >= 0) { res.push({ raw: raw, L: L, state: 'skip', why: 'Not checked (after the first error)' }); return; }
    var c;
    try { c = compareLines(prev, L); } catch (e) { c = { ok: false, why: 'Could not evaluate: ' + e.message }; }
    res.push({ raw: raw, L: L, state: c.ok ? 'ok' : 'bad', why: c.why, cls: c.cls, r1: c.r1, r2: c.r2 });
    if (!c.ok) firstBad = res.length - 1; else prev = L;
  });
  return { res: res, firstBad: firstBad };
}
/* Is the last line a finished answer: "x = number(s)" for equations, or a bracket-free polynomial/simplified form for expressions? */
function isFinished(L) {
  if (!L) return false;
  if (L.eq) {
    if (L.multi) return true;
    var lhs = L.nodes[0], rhs = L.nodes[1];
    return (lhs.isSymbolNode && rhs.toString().indexOf(lhs.name) < 0) || (rhs.isSymbolNode && lhs.toString().indexOf(rhs.name) < 0);
  }
  return !/\(/.test(L.nodes[0].toString().replace(/sqrt\(/g, ''));
}

/* ---------- polynomial fitting and worked solutions ---------- */
function fraction(x, maxDen) {
  maxDen = maxDen || 50;
  for (var d = 1; d <= maxDen; d++) { var n = Math.round(x * d); if (Math.abs(n / d - x) < 1e-9) return [n, d]; }
  return null;
}
function fmtNum(x) {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  var f = fraction(x);
  return f ? f[0] + '/' + f[1] : String(+x.toFixed(6));
}
/* Fit a polynomial of degree ≤ maxDeg in one variable to a numeric function. Returns ascending coefficients or null. */
function fitPoly(fn, maxDeg) {
  maxDeg = maxDeg || 4;
  var xs = [1, 2, 3, 4, 5, 6].slice(0, maxDeg + 1), ys = xs.map(fn);
  if (ys.some(function (y) { return !isFinite(y); })) return null;
  var n = xs.length, A = xs.map(function (x, i) { var row = []; for (var k = 0; k < n; k++) row.push(Math.pow(x, k)); row.push(ys[i]); return row; });
  for (var c = 0; c < n; c++) {
    var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    var t = A[c]; A[c] = A[p]; A[p] = t;
    for (r = 0; r < n; r++) if (r !== c) { var m = A[r][c] / A[c][c]; for (var k2 = c; k2 <= n; k2++) A[r][k2] -= m * A[c][k2]; }
  }
  var coef = A.map(function (row, i) { var v = row[n] / row[i]; return Math.abs(v - Math.round(v)) < 1e-7 ? Math.round(v) : v; });
  var check = [7.5, -2.5, 0.5];
  for (var j = 0; j < check.length; j++) {
    var want = fn(check[j]);
    if (!isFinite(want)) continue;
    var got = coef.reduce(function (a, cf, i) { return a + cf * Math.pow(check[j], i); }, 0);
    if (!close(want, got)) return null;
  }
  while (coef.length > 1 && Math.abs(coef[coef.length - 1]) < 1e-9) coef.pop();
  return coef;
}
function fmtPoly(coef, v) {
  v = v || 'x';
  var parts = [];
  for (var i = coef.length - 1; i >= 0; i--) {
    var c = coef[i];
    if (Math.abs(c) < 1e-12) continue;
    var sign = c < 0 ? '-' : '+', a = Math.abs(c), f = fraction(a), body;
    var pow = i === 0 ? '' : i === 1 ? v : v + '^' + i;
    if (!pow) body = fmtNum(a);
    else if (f && f[1] !== 1) body = (f[0] === 1 ? '' : f[0]) + pow + '/' + f[1];
    else body = (Math.abs(a - 1) < 1e-12 ? '' : fmtNum(a)) + pow;
    parts.push({ sign: sign, body: body });
  }
  if (!parts.length) return '0';
  return parts.map(function (p, i) { return i === 0 ? (p.sign === '-' ? '-' : '') + p.body : ' ' + p.sign + ' ' + p.body; }).join('');
}
function sideFn(L, k) { var v = L.vars[0] || 'x'; return function (x) { var sc = {}; sc[v] = x; return real(L.side(k, sc)); }; }
/* Worked solution: [{text, why}] where every text line is checkable by checkSteps (except purely explanatory ones flagged note:true). */
function solveSteps(problem) {
  var L = parseLine(problem);
  if (!L) return null;
  if (L.vars.length > 1) return { steps: [], note: 'Only one variable is supported by the solver.' };
  var v = L.vars[0] || 'x', steps = [], squash = function (t) { return t.replace(/\s+/g, '').replace(/\*/g, ''); }, given = squash(normalizeInput(problem));
  var add = function (text, why, note) { if (squash(text) !== given && (!steps.length || steps[steps.length - 1].text !== text)) steps.push({ text: text, why: why, note: !!note }); };
  if (!L.eq) {
    var p = fitPoly(sideFn(L, 0), 4);
    if (!p) return { steps: [], note: 'This expression is not a polynomial, so the solver cannot simplify it.' };
    add(fmtPoly(p, v), 'Expand and collect like terms');
    return { steps: steps, answer: fmtPoly(p, v) };
  }
  var lp = fitPoly(sideFn(L, 0), 2), rp = fitPoly(sideFn(L, 1), 2);
  if (!lp || !rp) return { steps: [], note: 'The solver handles linear and quadratic equations.' };
  var deg = Math.max(lp.length, rp.length) - 1;
  var diff = []; for (var i = 0; i <= deg; i++) diff.push((lp[i] || 0) - (rp[i] || 0));
  while (diff.length > 1 && Math.abs(diff[diff.length - 1]) < 1e-12) diff.pop();
  if (diff.length <= 2) {
    var a = lp[1] || 0, b = lp[0] || 0, c = rp[1] || 0, d = rp[0] || 0;
    add(fmtPoly(lp, v) + ' = ' + fmtPoly(rp, v), 'Expand brackets on both sides');
    if (Math.abs(a - c) < 1e-12) return { steps: steps, note: Math.abs(b - d) < 1e-12 ? 'Both sides are identical: every value of ' + v + ' works.' : 'The ' + v + ' terms cancel and leave a false statement: no solution.' };
    if (c && b !== d) add(fmtPoly([0, a - c], v) + ' + ' + fmtNum(b) + ' = ' + fmtNum(d), (c > 0 ? 'Subtract ' + fmtPoly([0, c], v) + ' from' : 'Add ' + fmtPoly([0, -c], v) + ' to') + ' both sides');
    add(fmtPoly([0, a - c], v) + ' = ' + fmtNum(d - b), b ? (b > 0 ? 'Subtract ' + fmtNum(b) : 'Add ' + fmtNum(-b)) + ' on both sides' : 'Collect the ' + v + ' terms');
    add(v + ' = ' + fmtNum((d - b) / (a - c)), 'Divide both sides by ' + fmtNum(a - c));
    return { steps: steps.map(function (s) { return { text: s.text.replace(/ \+ -/g, ' - '), why: s.why, note: s.note }; }), answer: [(d - b) / (a - c)] };
  }
  var A2 = diff[2], B2 = diff[1] || 0, C2 = diff[0] || 0;
  add(fmtPoly(diff, v) + ' = 0', 'Move every term to one side');
  if (A2 !== 1 && Number.isInteger(A2) && [B2, C2].every(function (x) { return Number.isInteger(x / A2); })) { diff = diff.map(function (x) { return x / A2; }); add(fmtPoly(diff, v) + ' = 0', 'Divide every term by ' + fmtNum(A2)); A2 = 1; B2 = diff[1]; C2 = diff[0]; }
  var D = B2 * B2 - 4 * A2 * C2;
  if (D < -1e-12) return { steps: steps, note: 'The discriminant b² − 4ac = ' + fmtNum(D) + ' is negative: no real solutions.', answer: [] };
  var sq = Math.sqrt(D), r1 = (-B2 - sq) / (2 * A2), r2 = (-B2 + sq) / (2 * A2);
  var nice = function (r) { return fraction(r, 12); };
  if (nice(r1) && nice(r2)) {
    var lin = function (r) { return '(' + (fraction(r, 1) ? fmtPoly([-r, 1], v) : fmtPoly([-r * nice(r)[1], nice(r)[1]], v)) + ')'; };
    var lead = A2 / (fraction(r1, 1) ? 1 : nice(r1)[1]) / (fraction(r2, 1) ? 1 : nice(r2)[1]);
    add((Math.abs(lead - 1) < 1e-12 ? '' : fmtNum(lead)) + (Math.abs(D) < 1e-12 ? lin(r1) + '^2' : lin(r1) + lin(r2)) + ' = 0', 'Factor');
    add(Math.abs(D) < 1e-12 ? v + ' = ' + fmtNum(r1) : v + ' = ' + fmtNum(r1) + ' or ' + v + ' = ' + fmtNum(r2), 'Set each factor equal to zero');
  } else {
    add(v + ' = (' + fmtNum(-B2) + ' ± sqrt(' + fmtNum(D) + ')) / ' + fmtNum(2 * A2), 'Quadratic formula with a = ' + fmtNum(A2) + ', b = ' + fmtNum(B2) + ', c = ' + fmtNum(C2), true);
    add(v + ' = (' + fmtNum(-B2) + ' - sqrt(' + fmtNum(D) + ')) / ' + fmtNum(2 * A2) + ' or ' + v + ' = (' + fmtNum(-B2) + ' + sqrt(' + fmtNum(D) + ')) / ' + fmtNum(2 * A2), 'Write out both solutions');
  }
  return { steps: steps, answer: Math.abs(D) < 1e-12 ? [r1] : [r1, r2] };
}

/* ---------- practice problems ---------- */
var KIND_FOR_TAG = { MOVE_TERM_SIGN: 'linear', NEG_DISTRIBUTION: 'negative', EXP_OVER_ADD: 'square', PARTIAL_DIVISION: 'fraction', INCOMPLETE_EXPANSION: 'square', INVERSE_OP: 'linear', ARITHMETIC: 'linear', CANCEL_TERMS: 'fraction', SQRT_OVER_ADD: 'quadratic', FRACTION_ADD: 'fraction', OTHER: 'quadratic' };
var KINDS = { linear: 'Linear, variables on both sides', negative: 'Brackets with a negative in front', square: 'Expand a squared bracket', fraction: 'Divide a polynomial by a monomial', quadratic: 'Quadratic with whole-number roots' };
function generateProblem(kind, seed) {
  var r = seededRandom(seed), int = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, nz = function (lo, hi) { var x = 0; while (!x) x = int(lo, hi); return x; };
  var s = function (n) { return n < 0 ? '- ' + -n : '+ ' + n; };
  if (kind === 'linear') {
    var x = int(-6, 9), a = int(3, 8), c = int(1, a - 1), b = nz(-9, 9), d = a * x + b - c * x;
    return { kind: kind, problem: 'Solve ' + a + 'x ' + s(b) + ' = ' + c + 'x ' + s(d), answer: [x] };
  }
  if (kind === 'negative') {
    var x2 = int(-5, 8), k = int(2, 5), m = nz(-6, 6), c0 = int(5, 20), rhsK = int(1, 4);
    var rhsC = c0 - k * (x2 + m) - rhsK * x2;
    return { kind: kind, problem: 'Solve ' + c0 + ' - ' + k + '(x ' + s(m) + ') = ' + rhsK + 'x ' + s(rhsC), answer: [x2] };
  }
  if (kind === 'square') { var p = nz(-7, 7); return { kind: kind, problem: 'Expand (x ' + s(p) + ')^2', expr: fmtPoly([p * p, 2 * p, 1]) }; }
  if (kind === 'fraction') { var kk = int(2, 5), q1 = nz(1, 4), q2 = nz(-6, 6); return { kind: kind, problem: 'Simplify (' + kk * q1 + 'x^2 ' + s(kk * q2) + 'x) / (' + kk + 'x)', expr: fmtPoly([q2, q1]) }; }
  var r1 = int(-6, 6), r2 = int(-6, 6);
  return { kind: 'quadratic', problem: 'Solve ' + fmtPoly([r1 * r2, -(r1 + r2), 1]) + ' = 0', answer: r1 === r2 ? [r1] : [Math.min(r1, r2), Math.max(r1, r2)] };
}
