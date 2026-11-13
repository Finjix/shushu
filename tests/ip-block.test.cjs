const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = () => import(pathToFileURL(path.join(__dirname, '../functions/_middleware.js')).href);

test('blocks all 512 addresses and permits adjacent networks', async () => {
  const { isBlockedIP } = await load();
  for (const third of [190, 191]) {
    for (let last = 0; last < 256; last++) assert.equal(isBlockedIP(`23.248.${third}.${last}`), true);
  }
  for (const ip of ['23.248.189.255', '23.248.192.0', '24.248.190.1', '23.247.190.1', '23.248.190.256', '', null, '::1', '23.248.190.1, 1.1.1.1']) {
    assert.equal(isBlockedIP(ip), false, String(ip));
  }
  assert.equal(isBlockedIP('::ffff:23.248.190.1'), true);
});

test('rejects all methods and asset paths before serving content without caching denial', async () => {
  const { onRequest } = await load();
  for (const pathname of ['/', '/index.html', '/main.js', '/asset/about/avatar.jpg', '/asset/video.webm']) {
    for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS']) {
      const response = await onRequest({
        request: new Request(`https://shushu.example${pathname}`, { method, headers: { 'CF-Connecting-IP': '23.248.191.255', 'X-Forwarded-For': '1.1.1.1', Range: 'bytes=0-1' } }),
        next() { assert.fail('blocked visitors must not reach assets'); },
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.equal(await response.text(), method === 'HEAD' ? '' : 'Forbidden\n');
    }
  }
});

test('preserves downstream responses for allowed visitors and ignores forwarded headers', async () => {
  const { onRequest } = await load();
  for (const ip of [null, '1.1.1.1', '23.248.192.0', '2001:db8::1']) {
    const headers = { 'X-Forwarded-For': '23.248.190.1' };
    if (ip) headers['CF-Connecting-IP'] = ip;
    const expected = new Response('video', { status: 206 });
    assert.equal(await onRequest({ request: new Request('https://shushu.example/', { headers }), next: () => expected }), expected);
  }
});
