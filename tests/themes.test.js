import test from 'node:test';
import assert from 'node:assert/strict';
import {THEMES,resolveTheme,importCodexTheme} from '../shared/themes.js';
import {createWorkspace,transition} from '../shared/workspace.js';
test('palettes have valid colors and survive workspace edits',()=>{
 for(const t of THEMES){for(const key of ['bg','surface','ink','accent'])assert.match(t[key],/^#[\da-f]{6}$/i);const s=transition(createWorkspace(),{type:'settings',payload:{theme:t.id}});assert.equal(s.settings.theme,t.id);}
 assert.equal(resolveTheme('system',true).id,'codex-dark');
 assert.equal(resolveTheme('claude-system',false).id,'claude-light');
 assert.throws(()=>transition(createWorkspace(),{type:'settings',payload:{theme:'invalid'}}),/Unknown theme/);
});
test('Codex theme import accepts colors only and rejects arbitrary CSS',()=>{
 const custom=importCodexTheme('codex-theme-v1:{"variant":"dark","theme":{"surface":"#121212","ink":"#eeeeee","accent":"#8899ff"}}');
 assert.equal(custom.surface,'#121212');
 assert.throws(()=>importCodexTheme('{"variant":"dark","theme":{"surface":"url(https://evil.example)","ink":"#eeeeee","accent":"#8899ff"}}'));
});
