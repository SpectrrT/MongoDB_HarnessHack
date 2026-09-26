import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { remAccess } from '../server/rem-access.js';

function app(options, remoteAddress) {
  const server = express();
  if (remoteAddress) server.use((req, res, next) => {
    Object.defineProperty(req.socket, 'remoteAddress', { value: remoteAddress });
    next();
  });
  server.use('/api/rem', remAccess(options));
  server.all('/api/rem/{*path}', (req, res) => res.json({ reached: true }));
  return server;
}

test('REM mutations require an explicit local client and reject forged origins and hosts', async () => {
  const server = app({ enabled: true });
  for (const path of ['run', 'sleep', 'simulate', 'reset', 'asks/id', 'connection']) {
    await request(server).post(`/api/rem/${path}`).expect(403);
    await request(server).post(`/api/rem/${path}`).set('X-Offload-Client', 'local').expect(200);
    await request(server).post(`/api/rem/${path}`).set('X-Offload-Client', 'local').set('Host', 'attacker.example').expect(403);
    await request(server).post(`/api/rem/${path}`).set('X-Offload-Client', 'local').set('Origin', 'https://attacker.example').expect(403);
    await request(server).post(`/api/rem/${path}`).set('X-Offload-Client', 'local').set('Origin', 'null').expect(403);
  }
});

test('REM rejects non-loopback transport even with a forged local Host header', async () => {
  const server = app({ enabled: true }, '203.0.113.9');
  await request(server).post('/api/rem/reset').set('Host', '127.0.0.1:5194').set('X-Offload-Client', 'local').expect(403);
  await request(server).get('/api/rem/state').set('Host', '127.0.0.1:5194').expect(403);
});

test('local HTTPS and browser SSE work while hosted mode and cross-port origins are rejected', async () => {
  const server = app({ enabled: true });
  await request(server).get('/api/rem/stream').set('Host', 'offload.ai').set('Origin', 'https://offload.ai').expect(200);
  await request(server).post('/api/rem/run').set('Host', 'offload.ai').set('Origin', 'https://offload.ai').set('X-Offload-Client', 'local').expect(200);
  await request(server).post('/api/rem/run').set('Host', '127.0.0.1:5194').set('Origin', 'http://127.0.0.1:9999').set('X-Offload-Client', 'local').expect(403);
  const denied = await request(app({ enabled: false })).get('/api/rem/state').expect(403);
  assert.equal(denied.body.reached, undefined);
});
