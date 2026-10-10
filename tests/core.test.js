const verified = (problem, steps) => checkSteps(problem, steps.filter((s) => !s.note).map((s) => s.text));

test('normalizeInput strips instructions and unicode operators', () => {
  assert.eq(normalizeInput('Solve 3×x − 2 = 7, for x'), '3*x - 2 = 7');
  assert.eq(normalizeInput('Expand (x+1)²'), '(x+1)^2');
  assert.eq(normalizeInput('√(x) ÷ 2'), 'sqrt(x) / 2');
});

test('parseLine reads equations, expressions and multiple answers', () => {
  const e = parseLine('2x + 3 = 7');
  assert.ok(e.eq); assert.deepEq(e.vars, ['x']);
  assert.eq(e.f({ x: 2 }), 0);
  const x = parseLine('sqrt(y) + pi');
  assert.ok(!x.eq); assert.deepEq(x.vars, ['y']);
  const m = parseLine('x = 2 or x = 3');
  assert.ok(m.multi); assert.deepEq(roots(m), [2, 3]);
  assert.throws(() => parseLine('a = b = c'));
});

test('sameExpr and proportional detect equivalence', () => {
  assert.ok(sameExpr(parseLine('(x+1)^2'), parseLine('x^2 + 2x + 1')));
  assert.ok(!sameExpr(parseLine('(x+1)^2'), parseLine('x^2 + 1')));
  assert.ok(proportional(parseLine('2x + 4 = 10'), parseLine('x + 2 = 5')));
  assert.ok(!proportional(parseLine('2x + 4 = 10'), parseLine('x + 4 = 5')));
});

test('roots finds simple, double and irrational roots', () => {
  assert.deepEq(roots(parseLine('x^2 - 5x + 6 = 0')), [2, 3]);
  assert.deepEq(roots(parseLine('(x - 3)^2 = 0')), [3]);
  const r = roots(parseLine('x^2 = 2'));
  assert.near(r[0], -Math.SQRT2, 1e-6); assert.near(r[1], Math.SQRT2, 1e-6);
  assert.deepEq(roots(parseLine('x^2 + 1 = 0')), []);
});

test('checkSteps verifies correct work and stops at the first error', () => {
  const ok = checkSteps('Solve x^2 - 5x + 6 = 0', ['(x - 2)(x - 3) = 0', 'x = 2 or x = 3']);
  assert.eq(ok.firstBad, -1);
  assert.deepEq(ok.res.map((r) => r.state), ['given', 'ok', 'ok']);
  const bad = checkSteps('Solve 3(x - 2) + 4 = 2x + 9', ['3x - 6 + 4 = 2x + 9', '3x - 2 = 2x + 9', '3x - 2x = 9 - 2', 'x = 7']);
  assert.eq(bad.firstBad, 3);
  assert.eq(bad.res[3].cls, 'root moved by -4: a constant was added or subtracted incorrectly');
  assert.eq(bad.res[4].state, 'skip');
});

test('error classification for expressions', () => {
  const r = checkSteps('Expand (x + 3)^2', ['x^2 + 9']);
  assert.eq(r.firstBad, 1);
  assert.ok(/depends on the variable/.test(r.res[1].cls));
  assert.ok(/flipped sign/.test(checkSteps('Simplify -(x - 2)', ['x - 2']).res[1].cls));
  assert.ok(/wrong sign/.test(classifyEq([3], [-3])));
  assert.ok(/lost/.test(classifyEq([2, 3], [3])));
});

test('isFinished recognises final answers', () => {
  assert.ok(isFinished(parseLine('x = 7')));
  assert.ok(isFinished(parseLine('x = 2 or x = 3')));
  assert.ok(!isFinished(parseLine('x + 1 = 8')));
  assert.ok(isFinished(parseLine('x^2 + 6x + 9')));
  assert.ok(!isFinished(parseLine('(x + 3)^2')));
});

test('fitPoly and fmtPoly', () => {
  assert.deepEq(fitPoly((x) => 3 * x * x - 2 * x + 1), [1, -2, 3]);
  assert.deepEq(fitPoly((x) => (2 * x * x + 4 * x) / (2 * x)), [2, 1]);
  assert.eq(fitPoly((x) => 1 / x), null);
  assert.eq(fmtPoly([1, -2, 3]), '3x^2 - 2x + 1');
  assert.eq(fmtPoly([0, -1]), '-x');
  assert.eq(fmtPoly([-0.5, 1.5]), '3x/2 - 1/2');
  assert.eq(fmtNum(0.75), '3/4'); assert.eq(fmtNum(-4), '-4');
});

test('solveSteps writes linear solutions the checker accepts', () => {
  const s = solveSteps('Solve 3(x - 2) + 4 = 2x + 9');
  assert.deepEq(s.answer, [11]);
  assert.deepEq(s.steps.map((x) => x.text), ['3x - 2 = 2x + 9', 'x - 2 = 9', 'x = 11']);
  assert.eq(verified('Solve 3(x - 2) + 4 = 2x + 9', s.steps).firstBad, -1);
  assert.ok(/no solution/.test(solveSteps('2x + 1 = 2x + 3').note));
});

test('solveSteps factors quadratics and falls back to the formula', () => {
  const f = solveSteps('x^2 - 5x + 6 = 0');
  assert.deepEq(f.steps.map((x) => x.text), ['(x - 2)(x - 3) = 0', 'x = 2 or x = 3']);
  const g = solveSteps('2x^2 - 3x + 1 = 0');
  assert.ok(g.steps.some((x) => x.text === '(2x - 1)(x - 1) = 0'));
  assert.eq(verified('2x^2 - 3x + 1 = 0', g.steps).firstBad, -1);
  const h = solveSteps('x^2 - 3x + 1 = 0');
  assert.ok(h.steps.some((x) => x.note));
  assert.eq(verified('x^2 - 3x + 1 = 0', h.steps).firstBad, -1);
  assert.ok(/no real solutions/.test(solveSteps('x^2 + 4 = 0').note));
  assert.eq(solveSteps('Expand (x + 3)^2').answer, 'x^2 + 6x + 9');
});

test('generated practice problems are well formed and solvable', () => {
  Object.keys(KINDS).forEach((kind) => {
    for (let seed = 1; seed <= 15; seed++) {
      const p = generateProblem(kind, seed * 7919);
      const s = solveSteps(p.problem);
      if (p.answer) { assert.ok(s.answer, p.problem); assert.deepEq(s.answer.map((x) => +x.toFixed(6)), p.answer, p.problem); }
      else assert.eq(s.answer, p.expr, p.problem);
      assert.eq(verified(p.problem, s.steps).firstBad, -1, p.problem);
    }
  });
  assert.eq(generateProblem('linear', 42).problem, generateProblem('linear', 42).problem);
});
