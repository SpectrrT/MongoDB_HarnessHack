import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import MarkdownContent from '../src/components/MarkdownContent.js';
const render=text=>renderToStaticMarkup(React.createElement(MarkdownContent,{text}));
test('saved responses render tables, source links, headings and lists',()=>{
 const html=render('## This week\n\n| Course | Assignment | Source |\n|---|---|---|\n| Mathematics | **Homework 3** | [CourseWorks](https://courseworks.example/assignment) |\n\n- Check the due date\n- Submit your work');
 assert.match(html,/<h2>This week<\/h2>/);assert.match(html,/<table>/);assert.match(html,/<th scope="col">Course<\/th>/);assert.match(html,/<strong>Homework 3<\/strong>/);assert.match(html,/href="https:\/\/courseworks.example\/assignment"/);assert.match(html,/<ul>/);assert.doesNotMatch(html,/\|---/);
});
test('model HTML and unsafe links cannot execute; remote images do not load automatically',()=>{
 const html=render('<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![secret](https://example.com/tracker.png)');
 assert.doesNotMatch(html,/<script|javascript:|<img/);assert.match(html,/noopener noreferrer/);
});
test('partial streams and code remain readable without treating code as markup',()=>{
 assert.match(render('Working **on this'),/Working/);
 const html=render('```js\nconst x = "<script>";\n```\n\n1. Review\n2. Test');
 assert.match(html,/<pre><code class="hljs language-js">/);assert.match(html,/&lt;script&gt;/);assert.match(html,/<ol>/);
});

test('inline and display math produce accessible typeset formulas',()=>{
 const html=render('The transform is $F(s)$ for $s>0$.\n\n$$\n\\mathcal{L}\\{t^2\\}=\\int_0^\\infty e^{-st}t^2\\,dt=\\frac{2}{s^3}\n$$');
 assert.match(html,/class="katex"/);assert.match(html,/class="katex-display"/);assert.match(html,/<math/);assert.match(html,/encoding="application\/x-tex"/);assert.match(html,/mfrac/);
});
test('math cannot introduce active HTML; incomplete formulas do not crash the response',()=>{
 const html=render(String.raw`$\href{javascript:alert(1)}{click}$`);assert.doesNotMatch(html,/href="javascript/);
 assert.doesNotThrow(()=>render(String.raw`$$\frac{1}{`));
 assert.match(render('Costs $10 and $20.'),/Costs \$10 and \$20/);
});
test('code highlighting preserves literal LaTeX, tasks, nested lists, quotes and unknown languages',()=>{
 const html=render('```python\nx = 3\nprint(x)\n```\n\n```unknownlang\n<x>\n```\n\n> A quote\n\n- [x] Done\n  - Detail\n- [ ] Next\n\n~~Old~~');
 assert.match(html,/hljs-number/);assert.match(html,/&lt;x&gt;/);assert.match(html,/<blockquote>/);assert.match(html,/type="checkbox"/);assert.match(html,/<del>Old<\/del>/);
});

test('ChatGPT delimiters render the saved Laplace example and preserve code literals',()=>{
 const expression=String.raw`\mathcal{L}{t^2}=\int_0^\infty e^{-st}t^2\,dt=\frac{2}{s^3}`;
 const html=render(`Example:\n\n\\[${expression}\\]\n\nAlso \\(5 x\\).`);
 assert.match(html,/katex-display/);assert.equal((html.match(/class="katex"/g)||[]).length,2);assert.doesNotMatch(html,/katex-error/);
 const code=render('```latex\n\\[x^2\\]\n```');assert.doesNotMatch(code,/class="katex"/);
});
test('footnotes remain in-page links with working anchors',()=>{
 const html=render('A fact[^1].\n\n[^1]: Supporting note.');assert.match(html,/href="#user-content-fn-1"/);assert.match(html,/id="user-content-fnref-1"/);assert.doesNotMatch(html,/href="#[^"]+"[^>]*target="_blank"/);
});
