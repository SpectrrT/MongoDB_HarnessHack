import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findCodex, codexInstalled, CODEX_INSTALL, CODEX_MISSING } from '../server/codex-installation.js';
import { createChatGPTLogin } from '../server/codex-login.js';

test('a missing Codex CLI is detected and explained; installs on PATH or in the usual folders are found', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'offload-no-codex-'));
  const nothing = { env: { PATH: empty }, home: empty, platform: 'darwin', executable: () => false };
  assert.equal(findCodex(nothing), 'codex');
  assert.equal(codexInstalled(nothing), false);

  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'offload-codex-bin-'));
  const file = path.join(bin, 'codex');
  fs.writeFileSync(file, '#!/bin/sh\n');
  fs.chmodSync(file, 0o755);
  assert.equal(findCodex({ env: { PATH: bin }, home: empty, platform: 'darwin' }), file);
  assert.equal(codexInstalled({ env: { PATH: bin }, home: empty, platform: 'darwin' }), true);

  const brewOnly = { env: { PATH: '' }, home: empty, platform: 'darwin', executable: (f) => f === '/opt/homebrew/bin/codex' };
  assert.equal(findCodex(brewOnly), '/opt/homebrew/bin/codex', 'Homebrew installs are found even with a short PATH');

  assert.equal(CODEX_INSTALL, 'npm install -g @openai/codex');
  assert.match(CODEX_MISSING, /npm install -g @openai\/codex/);
});

test('ChatGPT sign-in stops with the install message before launching anything', async () => {
  let spawned = 0;
  const login = createChatGPTLogin({ installed: () => false, createClient: () => (spawned++, {}) });
  await assert.rejects(login.start('owner'), (error) => error.message === CODEX_MISSING);
  assert.equal(spawned, 0);
});
