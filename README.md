# algebra-step-checker

[![tests](https://github.com/dguywhoknows/algebra-step-checker/actions/workflows/tests.yml/badge.svg)](https://github.com/dguywhoknows/algebra-step-checker/actions/workflows/tests.yml)

A math tutor that checks every line of your work, pinpoints the first wrong step, names the misconception and coaches with Socratic hints.

Live: https://dguywhoknows.github.io/algebra-step-checker/

## Overview

Most tutors only check the final answer. Step Check verifies your reasoning line by line. Each step is parsed with math.js and compared to the previous one numerically: expressions must agree at random sample points, and equations must be scalar multiples of each other or keep exactly the same solution set (found by sign-change scanning, bisection and ternary search for double roots). The first wrong step is classified locally (sign error? off by a constant? lost solutions?). The AI then names the specific misconception, gives three progressively stronger Socratic hints and finally the correct step. A per-student misconception profile tracks your error patterns and generates targeted practice.

## Pages

- **Check**
- **Solver**
- **Graph**
- **Practice**
- **Progress**
- **Settings**

## Features

- Line-by-line verification of algebra: expressions, equations and 'x = 2 or x = 3' answer sets
- Numerical equivalence engine: random-point testing, proportionality test, root finding with bisection + ternary search
- Local error classification (sign flip, constant offset, scale factor, lost/extra solutions)
- KaTeX-rendered steps with / status and evidence
- AI misconception tagging against a fixed taxonomy (exponent over addition, partial division, sign moves …)
- Progressive hints: 3 Socratic nudges, then the correct step
- Persistent misconception profile that grows with errors and decays with clean solutions; targeted practice generator
- Solver page: worked solutions for linear and quadratic equations (factoring when roots are rational, the quadratic formula otherwise) and polynomial expansion, with every step run back through the checker
- Graph page: plots both sides of an equation or an expression on a canvas, marks the solutions, and auto-fits the window to the roots
- Practice page: generated problem sets per topic, or aimed at your weakest misconception; each answer must be a finished form and every step must verify
- Progress page: misconception profile, clean-solution rate and recent checks
- AI practice problems are only accepted if the local solver can verify them

## How it works

LLM calls are used for:

- Misconception diagnosis grounded in verifier evidence (JSON, fixed taxonomy)
- Practice-problem generation aimed at the student's weakest misconception

Everything else (parsing, verification, root finding, error classification, rendering, profile) runs locally in the browser.

## Getting started

No build step and no dependencies. Serve the folder with any static server:

```bash
git clone https://github.com/dguywhoknows/algebra-step-checker.git
cd algebra-step-checker
python -m http.server 8000
```

Then open http://localhost:8000.

`index.html` is the public home page, `login.html` handles accounts and `app.html` is the app.

### Telling the app what to do

Every page has an **Ask AI** box (Ctrl/Cmd+K). Type a request in plain words and the model plans a sequence of
calls to the app's own functions, runs them and reports back. The **Instructions** tab stores standing
preferences that are added to every AI request the app makes.

### Configuration

`src/lib/config.js` is generated from the build settings: the Supabase project (accounts) and the AI proxy URL.
Signed-in users get the built-in AI through the proxy, which keeps the provider key as a server-side secret.
Without those settings the app runs for guests, in demo mode, or with a personal [Groq](https://console.groq.com/keys)
or [OpenRouter](https://openrouter.ai/keys) key entered under **Settings → Model provider** (stored only in this
browser and sent only to that provider).

## Testing

`src/core.js` holds the app's logic as pure functions and is covered by 11 unit tests.

```bash
node tests/run-node.js        # CI runs this on every push
```

Or open `tests/index.html` in a browser ([live](https://dguywhoknows.github.io/algebra-step-checker/tests/)).

## Project structure

```
index.html           public home page (generated)
login.html           sign-in and sign-up (generated)
app.html             the app: markup for every page
src/app.js           UI, page wiring and event handlers
src/core.js          pure logic with no DOM access (unit-tested)
src/lib/ai.js        LLM client: Groq / OpenRouter, streaming, JSON mode, retries
src/lib/dom.js       DOM helpers, namespaced storage, markdown renderer
src/lib/router.js    hash router and the Settings page
src/lib/copilot.js   AI command box that drives the app's own functions
src/lib/auth.js      accounts (Supabase Auth) and the sign-in gate
styles/base.css      design tokens and shared components
styles/app.css       app-specific styles
tests/               unit tests (browser runner + Node runner for CI)
```

## Tech

- math.js expression parser/compiler
- KaTeX rendering
- Numerical analysis: bisection, ternary search, randomized identity testing
- Parsing, numeric equivalence, root finding, polynomial fitting, the solver and the problem generator in src/core.js, covered by unit tests run in the browser and in CI (mathjs installed from npm)
- Vanilla JavaScript, no framework or bundler
- Deployed with GitHub Pages

## License

MIT
