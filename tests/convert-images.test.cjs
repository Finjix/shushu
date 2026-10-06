const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main, run, pixels } = require('../scripts/convert-images.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const asset = path.join(root, 'public', 'asset');
  fs.mkdirSync(asset, { recursive: true });
  return { root, asset };
}
function image(file) {
  run('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'color=red:s=16x16', '-frames:v', '1', file]);
}
test('lossy quality 100, archive and references', t => {
  const { root, asset } = fixture(t);
  const source = path.join(asset, 'example.png');
  image(source);
  const original = fs.readFileSync(source);
  const expected = pixels(source);
  const html = path.join(root, 'public', 'index.html');
  fs.writeFileSync(html, '<img src="/asset/example.png">');
  main(root);
  assert.ok(!fs.existsSync(source));
  assert.deepEqual(fs.readFileSync(path.join(root, 'original-assets', 'example.png')), original);
  const output = path.join(asset, 'example.webp');
  assert.equal(pixels(output).length, expected.length);
  const webp = fs.readFileSync(output);
  assert.ok(webp.includes(Buffer.from('VP8 ')), 'Must use lossy VP8, not lossless VP8L');
  const reference = path.join(root, 'reference.webp');
  run('ffmpeg', ['-v', 'error', '-nostdin', '-i', path.join(root, 'original-assets', 'example.png'), '-frames:v', '1', '-c:v', 'libwebp', '-lossless', '0', '-quality', '100', '-compression_level', '6', '-pix_fmt', 'bgra', reference]);
  assert.deepEqual(webp, fs.readFileSync(reference));
  assert.match(fs.readFileSync(html, 'utf8'), /example.webp/);
});
test('archive conflict rejects entire batch', t => {
  const { root, asset } = fixture(t);
  image(path.join(asset, 'a.png'));
  image(path.join(asset, 'z.png'));
  fs.mkdirSync(path.join(root, 'original-assets'));
  fs.writeFileSync(path.join(root, 'original-assets', 'z.png'), 'keep');
  assert.throws(() => main(root), /Refusing to overwrite/);
  assert.ok(fs.existsSync(path.join(asset, 'a.png')));
  assert.ok(!fs.existsSync(path.join(asset, 'a.webp')));
});
test('same stem collision', t => {
  const { root, asset } = fixture(t);
  image(path.join(asset, 'same.png'));
  image(path.join(asset, 'same.jpg'));
  assert.throws(() => main(root), /Refusing to overwrite/);
});
test('animation is rejected without flattening', t => {
  const { root, asset } = fixture(t);
  const source = path.join(asset, 'animated.gif');
  run('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'testsrc=s=16x16:r=2', '-frames:v', '2', source]);
  assert.throws(() => main(root), /manual conversion/);
  assert.ok(fs.existsSync(source));
  assert.ok(!fs.existsSync(path.join(asset, 'animated.webp')));
});
