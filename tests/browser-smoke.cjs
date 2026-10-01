// Optional browser regression checks. See README for setup.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8000/';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
  });
  const errors = [];
  const watch = page => page.on('pageerror', error => errors.push(error.message));
  const jump = async (page, target) => {
    await page.locator('#settings-menu-toggle').click();
    await page.locator(`[data-section-target="${target}"]`).click();
  };
  try {
    const fallback = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
    await fallback.goto(url);
    const gallery = fallback.locator('noscript .intern-gallery');
    assert.equal(await gallery.isVisible(), true);
    assert.equal(await gallery.locator('img').count(), 3);
    for (const image of await gallery.locator('img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(img => img.decode());
    }
    assert.equal(await fallback.locator('.intern-logo').evaluate(img => getComputedStyle(img).opacity), '1');
    assert.equal(await fallback.locator('.fallback-video').isVisible(), true);
    assert.equal(await fallback.locator('.fallback-video').evaluate(video => video.controls), true);
    assert.equal(await fallback.locator('.terminal-screen').evaluate(screen => screen.scrollWidth <= screen.clientWidth), true);
    await fallback.close();

    for (const width of [320, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 720 } });
      watch(page);
      await page.addInitScript(() => {
        localStorage.setItem('finjix-no-animation', 'true');
        localStorage.setItem('finjix-skip-power-start', 'true');
      });
      await page.goto(url);
      await page.locator('#scroll-hint').waitFor({ state: 'visible' });
      await page.locator('#settings-menu-toggle').click();
      await page.locator('#terminal-settings-menu').hover();
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#intern-section').isVisible(), false, 'Menu wheel must not advance');
      await page.keyboard.press('Escape');
      await page.locator('#terminal-window').focus();
      await page.keyboard.press('Enter');
      await page.locator('#intern-gallery').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#intern02-section').isVisible(), false);
      await page.locator('.intern-image-open').first().click();
      await page.locator('#intern-image-viewer[open]').waitFor();
      await page.locator('#intern-image-viewer-stage').hover();
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#intern-image-viewer-stage').evaluate(stage => stage.classList.contains('is-zoomed')), true);
      await page.locator('#intern-image-viewer .media-viewer-close').click();
      await page.locator('#intern-image-viewer').waitFor({ state: 'hidden' });
      await page.locator('#terminal-window').focus();
      await page.keyboard.press('Enter');
      await page.locator('#intern02-media').waitFor({ state: 'visible' });
      await page.locator('.intern-video-open').click();
      await page.locator('#intern-video-viewer[open]').waitFor();
      const video = page.locator('#intern-video-viewer video');
      assert.equal(await video.evaluate(element => element.controls), true);
      assert.equal(await video.getAttribute('aria-hidden'), null);
      await video.click({ position: { x: 10, y: 10 } });
      assert.equal(await page.locator('#intern-video-viewer').evaluate(dialog => dialog.open), true);
      await page.locator('#intern-video-viewer .media-viewer-close').click();
      await page.locator('#intern-video-viewer').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.intern-video-open video').evaluate(element => element.controls), false);
      assert.equal(await page.locator('#scroll-hint').isVisible(), false);
      assert.equal(await page.locator('.terminal-screen').evaluate(screen => screen.scrollWidth <= screen.clientWidth), true);
      await jump(page, 'welcome');
      assert.equal(await page.locator('#cat-command').isVisible(), true);
      await page.close();
    }

    const fullAnimation = await browser.newPage();
    watch(fullAnimation);
    await fullAnimation.goto(url);
    await fullAnimation.locator('#power-start').click();
    await fullAnimation.locator('#scroll-hint').waitFor({ state: 'visible' });
    await fullAnimation.locator('#terminal-window').focus();
    await fullAnimation.keyboard.press('Enter');
    await fullAnimation.locator('#scroll-hint').waitFor({ state: 'visible' });
    assert.equal(await fullAnimation.locator('#intern-gallery').isVisible(), true);
    await fullAnimation.locator('#terminal-window').focus();
    await fullAnimation.keyboard.press('Enter');
    await fullAnimation.waitForFunction(() => !document.querySelector('#terminal-window').classList.contains('is-typing'));
    assert.equal(await fullAnimation.locator('#intern02-media').isVisible(), true);
    assert.equal(await fullAnimation.locator('#scroll-hint').isVisible(), false);
    await fullAnimation.close();

    const animated = await browser.newPage();
    watch(animated);
    await animated.goto(url);
    await animated.locator('#power-start').click();
    await animated.locator('#settings-menu-toggle').click();
    await animated.locator('#animation-toggle').uncheck();
    await animated.keyboard.press('Escape');
    await animated.locator('#scroll-hint').waitFor({ state: 'visible' });
    assert.equal(await animated.evaluate(() => localStorage.getItem('finjix-no-animation')), 'true');
    await animated.reload();
    assert.equal(await animated.locator('html').evaluate(html => html.classList.contains('no-animation')), true);
    await animated.locator('#power-start').click();
    await animated.locator('#scroll-hint').waitFor({ state: 'visible' });
    await animated.locator('#settings-menu-toggle').click();
    await animated.locator('#animation-toggle').check();
    await animated.locator('[data-section-target="internship"]').click();
    await animated.waitForTimeout(100);
    await jump(animated, 'internship02');
    await animated.locator('#settings-menu-toggle').click();
    await animated.locator('#animation-toggle').uncheck();
    await animated.keyboard.press('Escape');
    await animated.locator('#intern02-media').waitFor({ state: 'visible' });
    assert.equal(await animated.locator('#intern-section').isVisible(), false, 'Cancelled output must stay hidden');
    await animated.waitForFunction(() => !document.querySelector('#terminal-window').classList.contains('is-typing'));
    await animated.close();

    const blocked = await browser.newPage();
    watch(blocked);
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
    });
    await blocked.goto(url);
    await blocked.locator('#power-start').click();
    await blocked.locator('#settings-menu-toggle').click();
    await blocked.locator('#animation-toggle').uncheck();
    await blocked.keyboard.press('Escape');
    await blocked.locator('#scroll-hint').waitFor({ state: 'visible' });
    await blocked.close();
    assert.deepEqual(errors, []);
    console.log('Browser regression checks passed (desktop, 320px, no JS, settings, media, cancellation, blocked storage).');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
