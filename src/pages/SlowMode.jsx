import { useState } from 'react';
import '../slow-mode.css';
import ContextMemory from '../components/ContextMemory';
import SleepTasks from '../components/SleepTasks';
import PersonalSuggestions from '../components/PersonalSuggestions';

export default function SlowMode({ children }) {
  const [tab, setTab] = useState('tasks');
  return <>
    <div className="slow-tabs"><button className={tab === 'suggestions' ? 'active' : ''} onClick={() => setTab('suggestions')}>Next actions</button><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Overnight tasks</button><button className={tab === 'memory' ? 'active' : ''} onClick={() => setTab('memory')}>Memory review</button><button className={tab === 'suggestions' ? <PersonalSuggestions/> : tab === 'context' ? 'active' : ''} onClick={() => setTab('context')}>Context memory</button></div>
    {tab === 'suggestions' ? <PersonalSuggestions/> : tab === 'context' ? <ContextMemory/> : tab === 'memory' ? children : <SleepTasks/>}
  </>;
}
