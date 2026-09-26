import { Plug, FileText } from 'lucide-react';
import { CONNECTIONS, connectionBySource } from '../../shared/connections';
export function ConnectionLogo({ id, source, size = 25 }) {
  const service = source ? connectionBySource(source) : CONNECTIONS.find(c => c.id === id);
  if (!service) return source === 'Notes' ? <FileText size={size} aria-hidden="true" /> : <Plug size={size} aria-hidden="true" />;
  return <img className="service-logo" data-monochrome={["github","notion","vercel","openai","anthropic","elevenlabs","openrouter"].includes(service.id)||undefined} src={`/connections/${service.logo}`} width={size} height={size} alt="" aria-hidden="true" />;
}
