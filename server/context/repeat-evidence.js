// Lossless run-length encoding for decision input only. Exact text, order and
// multiplicity remain recoverable; archived and retained source records are unchanged.
export function encodeRepeatedEvidence(text) {
  if (typeof text !== 'string' || text.length < 256 || text.length > 8000) return text;
  const words = text.match(/\S+\s*|\s+/gu) || [];
  // Bound CPU independently of input character count. Unsupported inputs stay raw.
  if (words.length > 512) return text;
  const segments = [];
  let literal = '';
  for (let start = 0; start < words.length;) {
    let best = null;
    for (let width = 1; width <= Math.min(64, Math.floor((words.length - start) / 2)); width++) {
      let repeats = 1;
      while (start + width * (repeats + 1) <= words.length) {
        let same = true;
        for (let offset = 0; offset < width; offset++) {
          if (words[start + offset] !== words[start + width * repeats + offset]) {same = false; break;}
        }
        if (!same) break;
        repeats++;
      }
      if (repeats < 2) continue;
      const block = words.slice(start, start + width).join('');
      const saving = JSON.stringify(block.repeat(repeats)).length - JSON.stringify({text: block, repeat: repeats}).length;
      if (saving > 64 && (!best || saving > best.saving)) best = {width, repeats, block, saving};
    }
    if (!best) {literal += words[start++]; continue;}
    if (literal) {segments.push(literal); literal = '';}
    segments.push({text: best.block, repeat: best.repeats});
    start += best.width * best.repeats;
  }
  if (literal) segments.push(literal);
  const encoded = {encoding: 'exact-repeat-v1', segments};
  return JSON.stringify(encoded).length + 128 < JSON.stringify(text).length ? encoded : text;
}

export function expandRepeatedEvidence(value) {
  if (typeof value === 'string') return value;
  if (value?.encoding !== 'exact-repeat-v1' || !Array.isArray(value.segments)) throw Error('Invalid repeated evidence.');
  let text = '';
  for (const segment of value.segments) {
    if (typeof segment === 'string') text += segment;
    else if (typeof segment?.text === 'string' && Number.isSafeInteger(segment.repeat) && segment.repeat >= 2 && segment.repeat <= 512 && segment.text.length * segment.repeat <= 8000) text += segment.text.repeat(segment.repeat);
    else throw Error('Invalid repeated evidence segment.');
    if (text.length > 8000) throw Error('Repeated evidence exceeds its source bound.');
  }
  return text;
}
