#!/usr/bin/env node
import { copyFile, lstat, mkdir, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const installation = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owner = 'offload-query-regression-demo-v1';
const files = ['scripts/query-demo.mjs', 'docs/QUERY-DEMO.md', 'fixtures/query-demo/issue.md', 'fixtures/query-demo/pipeline.json'];

export async function prepareQueryDemo() {
  const destination = path.join(os.homedir(), '.offload/demos/query-regression');
  await mkdir(destination, { recursive: true });
  if (!(await lstat(destination)).isDirectory()) throw new Error('Query-demo destination must be a directory, not a link');
  const marker = path.join(destination, '.offload-demo.json');
  const entries = await readdir(destination);
  if (entries.length) {
    let previous;
    try { previous = JSON.parse(await readFile(marker, 'utf8')); } catch {}
    if (previous?.owner !== owner) throw new Error('Refusing to overwrite an unrelated query-demo directory: ' + destination);
    if (!(await lstat(marker)).isFile()) throw new Error('Query-demo ownership marker must be a regular file');
  }
  const dependencies = path.join(destination, 'node_modules');
  const expected = await realpath(path.join(installation, 'node_modules'));
  const existing = await lstat(dependencies).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing) {
    if (!existing.isSymbolicLink() || await realpath(dependencies) !== expected) throw new Error('Refusing to replace query-demo dependencies: ' + dependencies);
  } else await symlink(expected, dependencies, 'dir');
  await writeFile(marker, JSON.stringify({ owner, files }, null, 2) + '\n');
  for (const directory of ['scripts', 'docs', 'fixtures', 'fixtures/query-demo']) {
    const target = path.join(destination, directory);
    await mkdir(target, { recursive: true });
    if (!(await lstat(target)).isDirectory()) throw new Error('Refusing a linked demo subdirectory: ' + target);
  }
  for (const file of files) {
    const target = path.join(destination, file);
    const existingFile = await lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (existingFile && !existingFile.isFile()) throw new Error('Refusing a linked demo file: ' + target);
    await copyFile(path.join(installation, file), target);
  }
  return { directory: destination, runbook: path.join(destination, 'docs/QUERY-DEMO.md'), runner: path.join(destination, 'scripts/query-demo.mjs') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await prepareQueryDemo(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
