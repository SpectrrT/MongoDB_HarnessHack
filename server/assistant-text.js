// Only visible assistant text enters this reducer. Native reasoning events are not supported.
export function createAssistantTextState() {
  const items = new Map();
  return {
    accept(event) {
      if (!['messageStart', 'delta', 'message'].includes(event.type)) return false;
      const id = event.id || 'legacy-answer';
      let item = items.get(id);
      if (!item) {
        item = { id, text: '', phase: null, complete: false };
        items.set(id, item);
      }
      if (event.phase === 'commentary' || event.phase === 'final_answer') item.phase = event.phase;
      if (event.type === 'message') {
        // Completed snapshots are authoritative; replay replaces the same item rather than appending.
        item.text = String(event.text || '').slice(-40000);
        item.complete = true;
      } else if (!item.complete) {
        if (event.type === 'delta') item.text = (item.text + String(event.text || '')).slice(-40000);
        else if (!item.text && event.text) item.text = String(event.text).slice(-40000);
      }
      return true;
    },
    snapshot() {
      const visible = [...items.values()].filter(item => item.text);
      return {
        commentary: visible.filter(item => item.phase === 'commentary').map(({ id, text }) => ({ id, text })),
        // Missing phase is the protocol's legacy compatibility case, never evidence of reasoning.
        stream: visible.filter(item => item.phase !== 'commentary').at(-1)?.text || '',
      };
    },
  };
}
