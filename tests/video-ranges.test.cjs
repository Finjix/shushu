// Cloudflare Pages Function: functions/asset/[[path]].js 为视频补上 HTTP Range（206 / 416）。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const FUNCTION = path.join(ROOT, 'functions', 'asset', '[[path]].js');
const load = () => import(pathToFileURL(FUNCTION).href);

const VIDEO = '/asset/showcase/分镜助手-vp9-1280x720.webm';
const URL_BASE = 'https://shushu.example';
const data = Buffer.from(Array.from({ length: 300000 }, (_, i) => i % 251));

// 模拟 env.ASSETS：按小块流式返回整个文件（模拟线上不带 Content-Length 的情况可选）。
function assets({ status = 200, withLength = true, extraHeaders = {} } = {}) {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      calls.push(request);
      if (status !== 200) return new Response(null, { status });
      let offset = 0;
      const body = new ReadableStream({
        pull(controller) {
          if (offset >= data.length) return controller.close();
          controller.enqueue(new Uint8Array(data.subarray(offset, offset += 7000)));
        },
      });
      const headers = { 'Content-Type': 'video/webm', ETag: '"abc"', ...extraHeaders };
      if (withLength) headers['Content-Length'] = String(data.length);
      return new Response(body, { status: 200, headers });
    },
  };
}

async function call({ method = 'GET', headers = {}, url = URL_BASE + encodeURI(VIDEO), env = assets() } = {}) {
  const { onRequest } = await load();
  const response = await onRequest({ request: new Request(url, { method, headers }), env: { ASSETS: env }, next: async () => new Response('next') });
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
  return { response, body, env };
}

test('full response advertises byte ranges', async () => {
  const { response, body, env } = await call();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Length'), String(data.length));
  assert.deepEqual(body, data);
  // 上游请求不能带 Range，确保拿到完整文件。
  assert.equal(env.calls[0].headers.get('Range'), null);
});

test('single ranges return 206 with matching bytes', async () => {
  for (const [requested, start, end] of [
    ['bytes=0-', 0, data.length - 1],
    ['bytes=123456-', 123456, data.length - 1],
    ['bytes=6999-14000', 6999, 14000],
    ['bytes=299990-999999', 299990, data.length - 1],
    ['bytes=-500', data.length - 500, data.length - 1],
    ['bytes=-999999', 0, data.length - 1],
  ]) {
    const { response, body } = await call({ headers: { Range: requested } });
    assert.equal(response.status, 206, requested);
    assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/${data.length}`, requested);
    assert.equal(response.headers.get('Content-Length'), String(end - start + 1), requested);
    assert.equal(response.headers.get('ETag'), '"abc"', requested);
    assert.deepEqual(body, data.subarray(start, end + 1), requested);
  }
});

test('unsatisfiable ranges return 416', async () => {
  for (const requested of [`bytes=${data.length}-`, 'bytes=-0']) {
    const { response, body } = await call({ headers: { Range: requested } });
    assert.equal(response.status, 416, requested);
    assert.equal(response.headers.get('Content-Range'), `bytes */${data.length}`);
    assert.equal(body.length, 0);
  }
});

test('invalid, multipart and stale If-Range requests get the full file', async () => {
  for (const headers of [
    { Range: 'bytes=20-10' },
    { Range: 'bytes=0-1,5-6' },
    { Range: 'items=0-1' },
    { Range: 'bytes=10-19', 'If-Range': '"old"' },
  ]) {
    const { response, body } = await call({ headers });
    assert.equal(response.status, 200, JSON.stringify(headers));
    assert.deepEqual(body, data);
  }
  const { response } = await call({ headers: { Range: 'bytes=10-19', 'If-Range': '"abc"' } });
  assert.equal(response.status, 206);
});

test('HEAD has headers only', async () => {
  const { response, body } = await call({ method: 'HEAD', headers: { Range: 'bytes=10-19' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), `bytes 10-19/${data.length}`);
  assert.equal(body.length, 0);
});

test('falls back to the registered size when the asset has no Content-Length', async () => {
  const { VIDEO_SIZES } = await load();
  const original = VIDEO_SIZES[VIDEO];
  VIDEO_SIZES[VIDEO] = data.length;
  try {
    const { response, body } = await call({ headers: { Range: 'bytes=100-' }, env: assets({ withLength: false }) });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), `bytes 100-${data.length - 1}/${data.length}`);
    assert.deepEqual(body, data.subarray(100));
  } finally {
    VIDEO_SIZES[VIDEO] = original;
  }
  // 未登记且没有长度：原样返回，不猜测大小。
  const { response } = await call({ url: `${URL_BASE}/asset/unknown.webm`, headers: { Range: 'bytes=100-' }, env: assets({ withLength: false }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Range'), null);
});

test('non-200 assets, compressed assets and other methods pass through', async () => {
  assert.equal((await call({ headers: { Range: 'bytes=0-' }, env: assets({ status: 404 }) })).response.status, 404);
  assert.equal((await call({ headers: { Range: 'bytes=0-' }, env: assets({ status: 304 }) })).response.status, 304);
  const compressed = await call({ headers: { Range: 'bytes=0-9' }, env: assets({ extraHeaders: { 'Content-Encoding': 'br' } }) });
  assert.equal(compressed.response.status, 200);
  assert.equal((await call({ method: 'POST' })).body.toString(), 'next');
});

test('every deployed video is registered with its size and routed to the Function', async () => {
  const { VIDEO_SIZES } = await load();
  const videos = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(webm|mp4|mov|m4v)$/i.test(entry.name)) videos[`/${path.relative(PUBLIC, full).split(path.sep).join('/')}`] = fs.statSync(full).size;
    }
  };
  walk(PUBLIC);
  assert.deepEqual({ ...VIDEO_SIZES }, videos, `Update VIDEO_SIZES in functions/asset/[[path]].js to:\n${JSON.stringify(videos, null, 2)}`);
  const routes = JSON.parse(fs.readFileSync(path.join(PUBLIC, '_routes.json'), 'utf8'));
  // 同时写原文与百分号编码两种形式，不依赖 Pages 路由匹配时是否解码路径。
  const expected = [...new Set(Object.keys(videos).sort().flatMap((video) => [video, encodeURI(video)]))];
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.exclude, []);
  assert.deepEqual(routes.include, expected, `Update public/_routes.json include to:\n${JSON.stringify(expected, null, 2)}`);
  assert.ok(routes.include.length <= 100 && routes.include.every((rule) => rule.length <= 100), 'Pages allows at most 100 rules of 100 characters');
});
