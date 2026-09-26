import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useWorkspace } from '../store';
import { resolveTheme, themeStyle } from '../../shared/themes';
import '../example-workflow.css';

const artifact = '/evidence/mongodb-example-workflow.md';
export default function ExampleWorkflow() {
  const { state } = useWorkspace();
  const [text, setText] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const palette = resolveTheme(state?.settings.theme || 'light', matchMedia('(prefers-color-scheme: dark)').matches, state?.settings.themeCustom);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    fetch(artifact, { signal: controller.signal }).then(async response => {
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw Error('The prepared example could not be loaded.');
      setText(await response.text());
    }).catch(failure => { if (failure.name !== 'AbortError') setError(failure.message); });
    return () => controller.abort();
  }, [attempt]);
  return <div className="example-workflow" style={themeStyle(palette)}>
    <nav aria-label="Example navigation"><Link to="/" className="wordmark">offload</Link><Link to="/"><ArrowLeft size={15} />Back to home</Link></nav>
    <main><header><p className="example-label">EXAMPLE WORKFLOW</p><h1>A database engineer's next step.</h1><p>A prepared example from sample data. Live runs stay separate.</p></header>
      {error ? <div role="alert"><p>{error}</p><button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>
        : text ? <article className="example-output"><Markdown skipHtml components={{ h1: ({ children }) => <h2>{children}</h2>, a: ({ href, children }) => <a href={href} rel="noreferrer">{children}</a> }}>{text}</Markdown></article>
          : <p role="status">Loading prepared example...</p>}
      <div className="example-actions"><Link className="button" to="/app/sleep?view=suggestions">Try in your local workspace<ArrowRight size={16} /></Link><a href={artifact} download>Download example</a></div>
      <p className="example-footnote">Load the example in Next actions, then choose which draft to start. Your local service and configured model handle a new run.</p>
    </main>
  </div>;
}
