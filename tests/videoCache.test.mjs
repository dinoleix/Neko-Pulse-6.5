import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker() {
  const handlers = {};
  const removed = [];
  vm.runInNewContext(source, {
    URL,
    self: {
      location: { hostname: 'example.com', origin: 'https://example.com' },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => ['neko-pulse-v3', 'neko-pulse-v4'],
      delete: async name => { removed.push(name); },
      match: async () => undefined,
    },
  });
  return { handlers, removed };
}

test('private playback requests bypass cache for every account and retry', () => {
  const { handlers } = worker();
  for (const token of ['admin-token', 'crew-token', 'crew-token']) {
    let intercepted = false;
    handlers.fetch({
      request: { method: 'GET', url: 'https://example.com/api/training-video?format=url&path=training/a/video.mp4', headers: { Authorization: token } },
      respondWith: () => { intercepted = true; },
    });
    assert.equal(intercepted, false);
  }
});

test('activation removes the old cache containing expired playback links', async () => {
  const { handlers, removed } = worker();
  let complete;
  handlers.activate({ waitUntil: promise => { complete = promise; } });
  await complete;
  assert.deepEqual(removed, ['neko-pulse-v3']);
});
