import { ArrowRight, Copy, Plug } from 'lucide-react';

// Shown when the chat's model isn't connected: why the chat is off, and the quickest way to turn it on.
export default function ConnectModelNotice({ provider, codex, openrouter, onConnect, onSwitch }) {
  const current = provider === 'openrouter' ? 'OpenRouter' : 'ChatGPT';
  const other = provider === 'openrouter' ? { id: 'codex', name: 'ChatGPT', status: codex } : { id: 'openrouter', name: 'OpenRouter', status: openrouter };
  const missingCodex = provider !== 'openrouter' && codex?.installed === false;
  return (
    <section className="connect-model-notice" aria-labelledby="connect-model-title">
      <Plug size={18} aria-hidden="true" />
      <div>
        <h2 id="connect-model-title">Connect a model to start</h2>
        <p>
          Offload answers and runs tasks with your own model account. Chat and the suggestions below stay off until{' '}
          {current} or OpenRouter is connected.
        </p>
        {missingCodex && (
          <p className="install-command">
            ChatGPT needs the Codex CLI on this Mac: <code>{codex.install}</code>
            <button type="button" className="text-button" onClick={() => navigator.clipboard?.writeText(codex.install).catch(() => {})}>
              <Copy size={12} aria-hidden="true" /> Copy
            </button>
          </p>
        )}
        <div className="connect-model-actions">
          <button type="button" className="button small" onClick={onConnect}>
            Connect a model <ArrowRight size={14} aria-hidden="true" />
          </button>
          {other.status?.connected && (
            <button type="button" className="button small secondary" onClick={() => onSwitch(other.id)}>
              Use {other.name} instead
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
