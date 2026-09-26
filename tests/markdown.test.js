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
 assert.match(html,/<pre><code class="language-js">/);assert.match(html,/&lt;script&gt;/);assert.match(html,/<ol>/);
});
