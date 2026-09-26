import test from 'node:test';
import assert from 'node:assert/strict';
import {localDomainConfig} from '../scripts/local-domain-config.mjs';

test('local domain redirects HTTP, stays on loopback and follows the selected frontend port',()=>{
 const settings={socket:'/private/offload/admin.sock',certificate:'/path with spaces/offload.pem',key:'/private/offload-key.pem'};
 for(const port of [5193,5194,6200]){
  const config=localDomainConfig({...settings,port});
  assert.match(config,/redir https:\/\/offload\.ai\{uri\} 308/);
  assert.equal(config.match(/bind 127\.0\.0\.1 ::1/g).length,2);
  assert.ok(config.includes(`reverse_proxy 127.0.0.1:${port}`));
  assert.ok(config.includes('tls "/path with spaces/offload.pem"'));
  assert.match(config,/admin "unix\//);
  assert.doesNotMatch(config,/0\.0\.0\.0|tls internal|acme|skip_verify/);
 }
 for(const port of [0,65536,'5194',NaN])assert.throws(()=>localDomainConfig({...settings,port}),/Invalid frontend port/);
});
