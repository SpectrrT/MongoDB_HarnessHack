import {useState} from 'react';
import {Check} from 'lucide-react';
import {THEMES,importCodexTheme} from '../../shared/themes';
import {useWorkspace} from '../store';
export default function Appearance(){
 const {state,act}=useWorkspace(),[code,setCode]=useState(''),[error,setError]=useState('');
 const select=theme=>act('settings',{theme}).catch(()=>{});
 return <section className="settings-section appearance-section"><h2>Appearance</h2><p>Choose a palette for your workspace.</p>
  {['Offload','Codex','Claude','Editor palettes'].map(group=><div className="theme-group" key={group}><h3>{group}</h3><div className="theme-grid">{THEMES.filter(t=>t.group===group).map(t=><button className="theme-option" key={t.id} aria-pressed={state.settings.theme===t.id} onClick={()=>select(t.id)}><span className="theme-preview" style={{background:t.bg,color:t.ink}}><i style={{background:t.surface}}/><span style={{background:t.surface}}><i style={{background:t.ink}}/><i style={{background:t.ink}}/><b style={{background:t.accent}}/></span></span><span className="theme-name">{t.name}{state.settings.theme===t.id&&<Check size={13}/>}</span></button>)}</div>{['Codex','Claude'].includes(group)&&<button className="text-button" aria-pressed={state.settings.theme===(group==='Claude'?'claude-system':'system')} onClick={()=>select(group==='Claude'?'claude-system':'system')}>Match system{state.settings.theme===(group==='Claude'?'claude-system':'system')?' ✓':''}</button>}</div>)}
  <details className="theme-import"><summary>Import a Codex theme</summary><p>Paste the theme you copied from Codex's Appearance settings.</p><textarea aria-label="Codex theme" rows={3} value={code} onChange={e=>setCode(e.target.value)} placeholder="codex-theme-v1:…"/><button className="button small secondary" onClick={async()=>{try{const themeCustom=importCodexTheme(code);await act('settings',{theme:'custom',themeCustom});setError('');setCode('');}catch(e){setError(e.message);}}}>Apply theme</button>{error&&<p role="alert">{error}</p>}</details>
 </section>;
}
