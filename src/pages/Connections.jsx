import { useState } from 'react';
import { Search, ArrowRight, Shield, Check } from 'lucide-react';
import { CONNECTIONS } from '../../shared/connections';
import { useWorkspace } from '../store';
import { Modal } from '../components/Modal';
import { ConnectionLogo } from '../components/ConnectionLogo';
import '../connections.css';
import ModelConnection from '../components/ModelConnection';
import OpenRouterConnection from '../components/OpenRouterConnection';
import '../live-chat.css';
export function Connections({ onConnect }) {
  const { state } = useWorkspace();
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All');
  const list = CONNECTIONS.filter(c => c.id !== "openrouter" && (category === 'All' || category === c.category) && `${c.name} ${c.detail}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="standard-page services-page">
    <header className="services-heading"><h1>Connect your tools</h1><p>Choose the apps you want Offload to work with.</p></header>
    <ModelConnection/>
    <OpenRouterConnection/>
    <div className="catalog-search"><Search size={18}/><input aria-label="Search connections" placeholder="Find an app…" value={query} onChange={e => setQuery(e.target.value)}/><span>{list.length}</span></div>
    <div className="filter-strip catalog-filters">{['All', 'Work', 'Development', 'Design', 'Models', 'Personal'].map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <div className="service-catalog">{list.map(c => {
      const configured = state.connections.find(x => x.id === c.id)?.requested;
      return <article className="service-row" key={c.id}><div className="brand-tile"><ConnectionLogo id={c.id} size={28}/></div><div className="service-description"><h2>{c.name}</h2><p>{c.detail}</p>{configured && <small>Added · setup needed</small>}</div><button className="button small secondary" onClick={() => onConnect(c.id)}>{configured ? 'Set up' : 'Connect'}<ArrowRight size={14}/></button></article>;
    })}</div>
    {!list.length && <p className="catalog-empty">No apps match "{query}". Try another name.</p>}
    <p className="catalog-note"><Shield size={15}/> Account authorization will be available when the integrations are connected.</p>
    <details className="context-provider"><summary>Context decisions · Jev</summary><p>Sleep's REM runs support Jev context selection when configured. See Sleep > Context memory for the active selector. Native chat does not yet use this selector.</p></details>
  </div>;
}
export function ConnectDialog({ id, onClose }) {
  const { state, act } = useWorkspace();
  const c = CONNECTIONS.find(x => x.id === id);
  const [busy, setBusy] = useState(false);
  const configured = state.connections.find(x => x.id === id)?.requested;
  if (!c) return null;
  return <Modal title={`${c.name} setup`} onClose={onClose}>
    <div className="setup-service"><div className="brand-tile"><ConnectionLogo id={id} size={32}/></div><div><strong>{c.name}</strong><p>Setup needed</p></div></div>
    <p>{c.detail}. Add this app to your workspace now; account authorization comes next.</p>
    <div className="permissions-list"><p><Check size={16}/> Your choice is saved on this device.</p><p><Shield size={16}/> No account access or credentials are requested.</p></div>
    <button className="button" disabled={busy} onClick={async () => { setBusy(true); try { await act('request-connection', {id, requested: !configured}); onClose(); } finally { setBusy(false); } }}>{configured ? 'Remove from workspace' : 'Add to workspace'}<ArrowRight size={16}/></button>
  </Modal>;
}
