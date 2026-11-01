// Isolated browser regression for the development update client.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

(async () => {
  const root = path.resolve(__dirname, '..');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'shushu-hmr-'));
  let server;
  let browser;
  try {
    for (const file of ['index.html', 'main.js', 'styles.css']) {
      await fs.copyFile(path.join(root, 'public', file), path.join(temp, file));
    }
    await fs.symlink(path.join(root, 'public', 'asset'), path.join(temp, 'asset'), process.platform === 'win32' ? 'junction' : 'dir');
    const code = [
      'import runpy, sys',
      'from functools import partial',
      'from pathlib import Path',
      'm = runpy.run_path(sys.argv[1])',
      'm["manifest"].__globals__["PUBLIC"] = Path(sys.argv[2])',
      'server = m["PreviewServer"](("127.0.0.1", 0), partial(m["PreviewHandler"], directory=sys.argv[2]))',
      'print(server.server_address[1], flush=True)',
      'server.serve_forever()',
    ].join('\n');
    server = spawn(process.env.PYTHON || 'python', ['-u', '-c', code, path.join(root, 'scripts', 'dev-server.py'), temp], { stdio: ['ignore', 'pipe', 'pipe'] });
    let serverErrors = '';
    server.stderr.on('data', chunk => { serverErrors += chunk; });
    const port = await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Preview exited ${code}: ${serverErrors}`)));
      server.stdout.once('data', chunk => resolve(Number(String(chunk).trim())));
    });
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${port}/`;
    await page.goto(url);
    await page.locator('#app-launch-icon').click();
    await page.locator('#settings-menu-toggle').click();
    await page.locator('[data-section-target="internship"]').click();
    await page.locator('#scroll-hint').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      history.replaceState({ unrelated: 'keep me' }, '');
      document.querySelector('.terminal-screen').scrollTop -= 85;
    });
    const originalTop = await page.locator('.terminal-screen').evaluate(el => el.scrollTop);
    const appInstance = await page.evaluate(() => {
      window.testAppInstance = Math.random();
      return window.testAppInstance;
    });
    // CSS must not navigate, reset the app, or dismiss an open media viewer.
    await page.locator('.intern-image-open').first().click();
    await page.locator('#intern-image-viewer[open]').waitFor();
    await fs.appendFile(path.join(temp, 'styles.css'), '\n:root { --hmr-test: updated; }\n');
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--hmr-test').trim() === 'updated');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.testAppInstance), appInstance);
    assert.equal(await page.locator('#intern-image-viewer').evaluate(el => el.open), true);
    assert.equal(await page.locator('link[rel="stylesheet"]').count(), 1);
    await page.keyboard.press('Escape');
    await page.locator('#intern-image-viewer').waitFor({ state: 'hidden' });
    await page.waitForTimeout(500);
    // JS is re-evaluated, but the visible section, history and exact scroll survive.
    await fs.appendFile(path.join(temp, 'main.js'), '\nwindow.testUpdatedScript = true;\n');
    await page.waitForFunction(() => window.testUpdatedScript === true);
    await page.waitForFunction(() => !window.__finjixDevPreview.restoringStyle?.isConnected);
    assert.equal(await page.locator('#intern-gallery').isVisible(), true);
    assert.equal(await page.locator('#intern02-section').isVisible(), false);
    assert.ok(Math.abs(await page.locator('.terminal-screen').evaluate(el => el.scrollTop) - originalTop) < 2);
    assert.deepEqual(await page.evaluate(() => history.state), { unrelated: 'keep me' });
    assert.equal(await page.evaluate(() => localStorage.getItem('finjix-skip-power-start')), null);
    // Revisit an earlier section after opening later ones: preserve both progress and view.
    const jump = async target => {
      await page.locator('#settings-menu-toggle').click();
      await page.locator(`[data-section-target="${target}"]`).click();
    };
    await jump('case02');
    await page.locator('#case02-content').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#case02-section')?.classList.contains('is-current-screen'));
    await jump('welcome');
    const htmlFile = path.join(temp, 'index.html');
    await fs.writeFile(htmlFile, (await fs.readFile(htmlFile, 'utf8')).replace('<title>Finjix</title>', '<title>HMR updated</title>'));
    await page.waitForFunction(() => document.title === 'HMR updated');
    await page.waitForFunction(() => !window.__finjixDevPreview.restoringStyle?.isConnected);
    assert.equal(await page.locator('#case02-content').isVisible(), true);
    assert.equal(await page.locator('.terminal-screen').evaluate(el => el.scrollTop), 0);
    assert.equal(await page.locator('#terminal-window').getAttribute('aria-hidden'), 'false');
    // A manual refresh must NOT consume an old automatic-update snapshot.
    await page.reload();
    await page.locator('#app-launch-icon').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#terminal-window').getAttribute('aria-hidden'), 'true');
    // Even with localStorage blocked, per-entry history state restores the view.
    const blocked = await browser.newPage();
    blocked.on('pageerror', error => errors.push(error.message));
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('blocked'); };
    });
    await blocked.goto(url);
    await blocked.locator('#app-launch-icon').click();
    await blocked.locator('#settings-menu-toggle').click();
    await blocked.locator('[data-section-target="internship02"]').click();
    await blocked.locator('#intern02-content').waitFor({ state: 'visible' });
    await fs.appendFile(path.join(temp, 'main.js'), '\nwindow.testSecondUpdate = true;\n');
    await blocked.waitForFunction(() => window.testSecondUpdate === true);
    await blocked.waitForFunction(() => !window.__finjixDevPreview.restoringStyle?.isConnected);
    assert.equal(await blocked.locator('#intern02-content').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('Development reload regression passed.');
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      const stopped = once(server, 'exit');
      server.kill();
      await stopped;
    }
    // Remove junction separately so cleanup never follows it into real assets.
    await fs.unlink(path.join(temp, 'asset')).catch(() => fs.rmdir(path.join(temp, 'asset')).catch(() => {}));
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
