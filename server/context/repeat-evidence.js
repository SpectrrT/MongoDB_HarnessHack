// Lossless run-length encoding for decision input only. Exact text, order and
// multiplicity remain recoverable; archived and retained source records are unchanged.
export function encodeRepeatedEvidence(text) {
  const encoded = repeatedEvidenceCandidate(text);
  return JSON.stringify(encoded).length + 128 < JSON.stringify(text).length ? encoded : text;
}

function repeatedEvidenceCandidate(text) {
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
      if (saving > 0 && (!best || saving > best.saving)) best = {width, repeats, block, saving};
    }
    if (!best) {literal += words[start++]; continue;}
    if (literal) {segments.push(literal); literal = '';}
    segments.push({text: best.block, repeat: best.repeats});
    start += best.width * best.repeats;
  }
  if (literal) segments.push(literal);
  return segments.some(segment => typeof segment !== 'string') ? {encoding: 'exact-repeat-v1', segments} : text;
}

// Intern exact repeated blocks across otherwise distinct records. Each record
// keeps its own identity and ordered segments; this does not merge decisions.
export function encodeEvidenceRecords(records) {
  // A block can pay for its encoding only after other records share it. Do not
  // discard that candidate before comparing the complete request representation.
  const encoded = records.map(record => ({...record, text: repeatedEvidenceCandidate(record.text)}));
  const counts = new Map();
  for (const record of encoded) for (const segment of record.text?.segments || []) {
    if (typeof segment?.text === 'string' && segment.text.length > 64) counts.set(segment.text, (counts.get(segment.text) || 0) + 1);
  }
  const dictionary = {}, references = new Map();
  for (const [text, count] of counts) if (count > 1) {
    const reference = `b${references.size}`;
    references.set(text, reference); dictionary[reference] = text;
  }
  for (const record of encoded) if (record.text?.segments) {
    record.text.segments = record.text.segments.map(segment => references.has(segment?.text) ? {ref: references.get(segment.text), repeat: segment.repeat} : segment);
  }
  for (const [i, record] of encoded.entries()) if (JSON.stringify(record.text).length >= JSON.stringify(records[i].text).length) record.text = records[i].text;
  const usedReferences = new Set(encoded.flatMap(record => (record.text?.segments || []).filter(segment => segment?.ref !== undefined).map(segment => segment.ref)));
  for (const reference of Object.keys(dictionary)) if (!usedReferences.has(reference)) delete dictionary[reference];
  const alternatives = [
    {records},
    {records: records.map(record => ({...record, text: encodeRepeatedEvidence(record.text)}))},
    {records: encoded, ...(usedReferences.size ? {dictionary} : {})},
  ];
  return alternatives.reduce((smallest, candidate) => JSON.stringify(candidate).length < JSON.stringify(smallest).length ? candidate : smallest);
}

export function expandRepeatedEvidence(value, dictionary = {}) {
  if (typeof value === 'string') return value;
  if (value?.encoding !== 'exact-repeat-v1' || !Array.isArray(value.segments)) throw Error('Invalid repeated evidence.');
  let text = '';
  for (const segment of value.segments) {
    if (typeof segment === 'string') text += segment;
    else {
      const block = segment?.ref !== undefined && Object.hasOwn(dictionary, segment.ref) ? dictionary[segment.ref] : segment?.text;
      if (typeof block !== 'string' || !Number.isSafeInteger(segment.repeat) || segment.repeat < 2 || segment.repeat > 512 || block.length * segment.repeat > 8000) throw Error('Invalid repeated evidence segment.');
      text += block.repeat(segment.repeat);
    }
    if (text.length > 8000) throw Error('Repeated evidence exceeds its source bound.');
  }
  return text;
}

// Share one conservative OR decision only when an identical repeated block
// dominates each candidate. Unique text remains visible for every member.
export function retentionGroups(encoded) {
  const groups = [], positions = new Map();
  for (const [index, record] of encoded.records.entries()) {
    const segments = record.text?.segments;
    const repeats = segments?.filter(segment => typeof segment !== 'string');
    const repeatedChars = repeats?.reduce((n, segment) => n + (segment.ref === undefined ? segment.text : encoded.dictionary[segment.ref]).length * segment.repeat, 0) || 0;
    const totalChars = typeof record.text === 'string' ? record.text.length : expandRepeatedEvidence(record.text, encoded.dictionary).length;
    const key = repeats?.length && repeatedChars >= totalChars * 0.75
      ? JSON.stringify(repeats.map(segment => [segment.ref === undefined ? segment.text : encoded.dictionary[segment.ref], segment.repeat])) : null;
    if (key !== null && positions.has(key)) groups[positions.get(key)].push(index);
    else {if (key !== null) positions.set(key, groups.length); groups.push([index]);}
  }
  return groups;
}
