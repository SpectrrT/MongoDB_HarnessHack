import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMath } from '../shared/normalize-math.js';

test('normalizes an integral display without changing its LaTeX content', () => {
  const expression = String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`;
  assert.equal(normalizeMath(`\\[\n${expression}\n\\]`), `$$\n${expression}\n$$`);
  assert.equal(normalizeMath(`Result: \\[${expression}\\] Next.`), `Result: \n$$\n${expression}\n$$\n Next.`);
  const laplace = String.raw`\mathcal{L}\{t^2\}=\int_0^\infty t^2e^{-st}\,dt=\frac{2}{s^3}`;
  assert.equal(normalizeMath(`\\[${laplace}\\]`), `$$\n${laplace}\n$$`);
});

test('normalizes inline math and keeps surrounding prose', () => {
  assert.equal(normalizeMath(String.raw`Use \(x^2 + y^2 = r^2\), then \(r = 2\).`), 'Use $x^2 + y^2 = r^2$, then $r = 2$.');
});

test('preserves backtick, tilde, and unfinished fenced code', () => {
  for (const fence of ['```', '~~~~']) {
    const code = `${fence}latex\n\\[x^2\\]\n\\(x\\)\n${fence}`;
    assert.equal(normalizeMath(`${code}\n\n\\(y\\)`), `${code}\n\n$y$`);
    assert.equal(normalizeMath(`${fence}latex\n\\[x^2\\]`), `${fence}latex\n\\[x^2\\]`);
  }
  const quoted = '> ```latex\n> \\(x\\)\n> ```';
  assert.equal(normalizeMath(quoted), quoted);
});

test('preserves code spans with single, multiple, and multiline backticks', () => {
  for (const code of ['`\\(x\\)`', '``literal ` \\[x\\]``', '`first\n\\(x\\)\nlast`']) {
    assert.equal(normalizeMath(`${code} and \\(y\\)`), `${code} and $y$`);
  }
  const unmatched = '`unmatched then ``\\(literal\\)``';
  assert.equal(normalizeMath(unmatched), unmatched);
  assert.equal(normalizeMath('`code`\\[x\\]`code`'), '`code`\n$$\nx\n$$\n`code`');
});

test('preserves escaped delimiters and does not close on an escaped closing delimiter', () => {
  const literal = String.raw`\\(literal\\) and \\[literal\\]`;
  assert.equal(normalizeMath(literal), literal);
  assert.equal(normalizeMath(String.raw`\(x + \\) + y\)`), String.raw`$x + \\) + y$`);
});

test('leaves dollars, currency, and ordinary text unchanged', () => {
  for (const text of ['Pay $5 or $10.', String.raw`Escaped \$5; (parentheses) and [brackets].`, '$x^2$ and $$x$$', '', 'No math here.']) {
    assert.equal(normalizeMath(text), text);
  }
});

test('preserves incomplete delimiters while streaming without throwing', () => {
  for (const text of ['\\', '\\(', '\\(x^2', '\\[\n\\int_0^', 'x \\)', '\\[x\\', '\\(\\)']) {
    assert.equal(normalizeMath(text), text);
  }
});
