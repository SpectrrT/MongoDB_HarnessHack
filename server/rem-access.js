// REM is a shared, local demonstration engine, not an authenticated hosted service.
export function remAccess({ enabled = process.env.NODE_ENV !== 'production', label = 'REM' } = {}) {
  return (req, res, next) => {
    const deny = () => res.status(403).json({ error: `${label} is available only in the local Offload app.` });
    const peer = req.socket.remoteAddress || '';
    if (!enabled || !/^(?:127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/.test(peer)) return deny();
    try {
      const host = req.get('host') || '';
      const local = new URL(`http://${host}`);
      if (!['127.0.0.1', 'localhost', '[::1]', 'offload.ai'].includes(local.hostname) || local.host !== host) return deny();
      const origin = req.get('origin');
      if (origin) {
        const source = new URL(origin);
        if (!['http:', 'https:'].includes(source.protocol) || source.host !== host || source.origin !== origin) return deny();
        if (source.hostname === 'offload.ai' && source.protocol !== 'https:') return deny();
      }
      if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Offload-Client') !== 'local') return deny();
      next();
    } catch { return deny(); }
  };
}
