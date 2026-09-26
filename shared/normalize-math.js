const isEscaped = (text, index) => {
  let slashes = 0;
  while (index > 0 && text[--index] === '\\') slashes++;
  return slashes % 2 === 1;
};

function normalizeProse(text, before = '', after = '') {
  let output = '', start = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '\\' || isEscaped(text, index)) continue;
    const delimiter = text[index + 1];
    if (delimiter !== '(' && delimiter !== '[') continue;
    const closing = delimiter === '(' ? '\\)' : '\\]';
    let end = text.indexOf(closing, index + 2);
    while (end !== -1 && isEscaped(text, end)) end = text.indexOf(closing, end + 2);
    if (end === -1) continue; // Streaming responses may not have a closing delimiter yet.
    const body = text.slice(index + 2, end);
    if (!body.trim()) continue;
    output += text.slice(start, index);
    if (delimiter === '(') {
      output += '$' + body + '$';
    } else {
      const previous = index > 0 ? text[index - 1] : before;
      const next = end + 2 < text.length ? text[end + 2] : after;
      if (previous && previous !== '\n') output += '\n';
      output += '$$' + (body.startsWith('\n') || body.startsWith('\r\n') ? '' : '\n');
      output += body + (body.endsWith('\n') ? '' : '\n') + '$$';
      if (next && next !== '\n' && next !== '\r') output += '\n';
    }
    index = end + 1;
    start = end + 2;
  }
  return output + text.slice(start);
}

function normalizeOutsideInlineCode(text) {
  let output = '', start = 0;
  const ticks = /`+/g;
  let opening;
  while ((opening = ticks.exec(text))) {
    if (isEscaped(text, opening.index)) continue;
    let closing;
    while ((closing = ticks.exec(text)) && closing[0].length !== opening[0].length) {}
    if (!closing) {
      ticks.lastIndex = opening.index + opening[0].length;
      continue;
    }
    output += normalizeProse(text.slice(start, opening.index), text[start - 1], '`');
    start = closing.index + closing[0].length;
    output += text.slice(opening.index, start);
  }
  return output + normalizeProse(text.slice(start), text[start - 1]);
}

// Accept ChatGPT's LaTeX delimiters while leaving Markdown code and native dollars intact.
export function normalizeMath(text) {
  let output = '', start = 0, fence = null;
  const lines = /[^\n]*(?:\n|$)/g;
  let line;
  while ((line = lines.exec(text)) && line[0]) {
    const content = line[0].replace(/\r?\n$/, '');
    const marker = content.match(/^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})(.*)$/);
    if (!marker) continue;
    if (!fence) {
      if (marker[1][0] === '`' && marker[2].includes('`')) continue;
      output += normalizeOutsideInlineCode(text.slice(start, line.index));
      start = line.index;
      fence = marker[1];
    } else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
      output += text.slice(start, lines.lastIndex);
      start = lines.lastIndex;
      fence = null;
    }
  }
  return output + (fence ? text.slice(start) : normalizeOutsideInlineCode(text.slice(start)));
}
