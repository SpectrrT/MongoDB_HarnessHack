import { RefreshCw, Plug } from 'lucide-react';

export default function SleepServiceNotice({ message, onRetry, busy = false }) {
  return <div className="sleep-service-notice" role="alert">
    <Plug size={18} aria-hidden="true" />
    <p>{message}</p>
    {onRetry && <button type="button" className="button secondary small" disabled={busy} onClick={onRetry}>
      <RefreshCw size={14} aria-hidden="true" />{busy ? 'Checking...' : 'Try again'}
    </button>}
  </div>;
}
