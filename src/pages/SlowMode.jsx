import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Moon } from 'lucide-react';
import { modelRequest } from '../model-api';
import { useWorkspace } from '../store';
import ContextMemory from '../components/ContextMemory';
import SleepTasks from '../components/SleepTasks';
import PersonalSuggestions from '../components/PersonalSuggestions';
import '../slow-mode.css';
import { SLEEP_EXAMPLE_TITLE, SLEEP_EXAMPLE_PROMPT } from '../../shared/sleep-example';

const tabs = [['conversations', 'Conversations'], ['suggestions', 'Next actions'], ['tasks', 'Overnight tasks'], ['rem', 'REM'], ['memory', 'Memory']];
const memoryTabs = [['notes', 'Saved notes'], ['review', 'Memory review'], ['context', 'Context memory']];

function TabBar({ items, value, onChange, name, prefix, className = '' }) {
  const onKeyDown = (event, index) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % items.length
      : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    onChange(items[next][0]);
    document.getElementById(`${prefix}-tab-${items[next][0]}`)?.focus();
  };
  return <div className={`slow-tabs ${className}`} role="tablist" aria-label={name}>
    {items.map(([id, label], index) => <button type="button" role="tab" key={id}
      id={`${prefix}-tab-${id}`} aria-controls={`${prefix}-panel-${id}`} aria-selected={value === id}
      tabIndex={value === id ? 0 : -1} className={value === id ? 'active' : ''}
      onKeyDown={event => onKeyDown(event, index)} onClick={() => onChange(id)}>{label}</button>)}
  </div>;
}

export default function SlowMode({ memory, review, rem }) {
  const { state, act, sleepStates, updateSleepState } = useWorkspace(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = tabs.some(([id]) => id === params.get('view')) ? params.get('view') : 'conversations';
  const memoryView = memoryTabs.some(([id]) => id === params.get('memory')) ? params.get('memory') : 'notes';
  const [error, setError] = useState(''), [waking, setWaking] = useState(null);
  const sleeping = state.conversations.filter(conversation => !conversation.listStatus && (conversation.sleepEnabled || conversation.messages.some(message => message.sleep)));
  const progress = conversation => {
    const snapshot = sleepStates[conversation.id];
    if (snapshot?.connectionError && conversation.sleepEnabled) return 'Reconnecting to Sleep';
    if (conversation.sleepEnabled && ['starting', 'running'].includes(snapshot?.state)) return 'Working in the background';
    if (conversation.sleepEnabled && snapshot?.state === 'paused') return 'Paused. Review progress';
    if (conversation.messages.some(message => message.sleep)) return 'Review available';
    if (snapshot?.skipped) return 'No unfinished draft found';
    if (snapshot?.state === 'done') return 'Saving review';
    return conversation.sleepEnabled ? 'Waiting for idle time' : 'Sleep off';
  };
  const tryExample = async () => {
    setError('');
    try { const id = crypto.randomUUID(); await act('prepare-conversation', { id, title: SLEEP_EXAMPLE_TITLE, text: SLEEP_EXAMPLE_PROMPT }); navigate('/app/chat/' + id); }
    catch (failure) { setError(failure.message); }
  };
  const select = (key, value) => setParams(current => { const next = new URLSearchParams(current); next.set(key, value); return next; });
  const wake = async conversation => {
    setWaking(conversation.id); setError('');
    try {
      const snapshot = await modelRequest('sleep/' + conversation.id, { enabled: false });
      updateSleepState(conversation.id, snapshot);
      await act('conversation-sleep', { id: conversation.id, enabled: false, jobId: snapshot.jobId || sleepStates[conversation.id]?.jobId });
      navigate('/app/chat/' + conversation.id);
    } catch (failure) { setError(failure.message); }
    finally { setWaking(null); }
  };
  return <div className="sleep-workspace">
    <TabBar items={tabs} value={view} onChange={value => select('view', value)} name="Sleep workspace" prefix="sleep" />
    {tabs.filter(([id]) => id !== view).map(([id]) => <section key={id} id={`sleep-panel-${id}`} role="tabpanel" aria-labelledby={`sleep-tab-${id}`} hidden />)}
    <section id={`sleep-panel-${view}`} role="tabpanel" aria-labelledby={`sleep-tab-${view}`}>
      {view === 'conversations' && <div className="standard-page sleeping-conversations">
        <h1>Sleep</h1><p>Leave work for later. Return to drafts, reviewed memories and the next step.</p>
        <p><button className="button secondary" onClick={tryExample}>Try Sleep example</button></p>
        <p className="sleep-consent-note">Open a prepared query brief, then turn on Sleep and choose Run Sleep now. No database changes are made.</p>
        {sleeping.map(conversation => <article key={conversation.id} className="sleeping-chat">
          <Moon size={20} aria-hidden="true" />
          <Link to={'/app/chat/' + conversation.id}><strong>{conversation.title}</strong><span>{progress(conversation)}</span></Link>
          {conversation.sleepEnabled && <button className="text-button" disabled={waking !== null} onClick={() => wake(conversation)}>{waking === conversation.id ? 'Waking...' : 'Wake'}</button>}
        </article>)}
        {!sleeping.length && <div className="sleep-empty"><h2>No sleeping conversations yet.</h2><p>Use the moon beside a chat's model controls to leave it for later.</p><Link className="button secondary" to="/app/chat">Open a conversation</Link></div>}
        <p className="sleep-consent-note">With consent, Sleep can draft one local candidate after 30 idle minutes. The configured OpenRouter worker uses at most 10,000 tokens and 20 minutes per pass.</p>
        {error && <p role="alert">{error}</p>}
      </div>}
      {view === 'suggestions' && <PersonalSuggestions />}
      {view === 'tasks' && <SleepTasks />}
      {view === 'rem' && rem}
      {view === 'memory' && <>
        <TabBar items={memoryTabs} value={memoryView} onChange={value => select('memory', value)} name="Memory views" prefix="memory" className="memory-tabs" />
        {memoryTabs.filter(([id]) => id !== memoryView).map(([id]) => <section key={id} id={`memory-panel-${id}`} role="tabpanel" aria-labelledby={`memory-tab-${id}`} hidden />)}
        <section id={`memory-panel-${memoryView}`} role="tabpanel" aria-labelledby={`memory-tab-${memoryView}`}>
          {memoryView === 'notes' ? memory : memoryView === 'review' ? review : <ContextMemory />}
        </section>
      </>}
    </section>
  </div>;
}
