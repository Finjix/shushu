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
  const readCase03Layout = content => {
    const first = content.querySelector('.case-main > .intern-role').getBoundingClientRect();
    const last = content.querySelector('.case-body > p:last-child').getBoundingClientRect();
    const firstParagraph = content.querySelector('.case-body > p:first-child').getBoundingClientRect();
    const image = content.querySelector('.case-video-grid').getBoundingClientRect();
    const stats = content.querySelector('.case-main > .case-stats').getBoundingClientRect();
    const picture = content.querySelector('.case-video-grid img').getBoundingClientRect();
    const borders = [...content.querySelectorAll('.case-main > .case-stats .case-stat')].map(item => {
      const style = getComputedStyle(item);
      return { top: style.borderTopWidth, left: style.borderLeftWidth };
    });
    return { topDifference: first.top - image.top, bottomDifference: picture.bottom - stats.bottom, paragraphGap: last.top - firstParagraph.bottom, subtitleGap: firstParagraph.top - first.bottom, bodyBottom: last.bottom, imageTop: image.top, rightFraction: image.width / content.getBoundingClientRect().width, leftWidth: first.width, rightWidth: image.width, borders };
  };
  const checkCase03Layout = layout => {
    assert.ok(Math.abs(layout.rightFraction - 0.42) < 0.01, 'CASE 03 right column stays compact');
    assert.ok(layout.leftWidth > layout.rightWidth, 'CASE 03 gives more space to the text');
    assert.ok(Math.abs(layout.topDifference) < 1, 'CASE 03 slogan and image tops align');
    assert.ok(Math.abs(layout.bottomDifference) < 1, 'CASE 03 picture and left stats bottoms align');
    assert.ok(Math.abs(layout.paragraphGap - 24) < 1, 'CASE 03 paragraph spacing stays fixed');
    assert.ok(Math.abs(layout.paragraphGap - layout.subtitleGap) < 1, 'Paragraph and subtitle spacing match');
    assert.ok(layout.borders.every(border => border.top === '1px' && border.left === '0px'), 'CASE 03 stats sit under the body with top rules like CASE 01');
  };
  const readMosaicLayout = content => {
    const role = content.querySelector('.case-main > .intern-role').getBoundingClientRect();
    const stats = content.querySelector('.case-main > .case-stats').getBoundingClientRect();
    const [demo, portrait, strip] = ['demo', 'portrait', 'strip'].map(name => content.querySelector(`.case-mosaic-${name}`).getBoundingClientRect());
    return { topDifference: demo.top - role.top, portraitTopDifference: portrait.top - role.top, bottomDifference: strip.bottom - stats.bottom, rowDifference: demo.height - portrait.height, stripLeft: strip.left - demo.left, stripRight: strip.right - portrait.right, statsBottom: stats.bottom, mosaicTop: demo.top };
  };
  const checkMosaicLayout = layout => {
    assert.ok(Math.abs(layout.topDifference) < 1 && Math.abs(layout.portraitTopDifference) < 1, 'Marketing mosaic top aligns with the slogan');
    assert.ok(Math.abs(layout.bottomDifference) < 1, 'Marketing mosaic bottom aligns with the left stats');
    assert.ok(Math.abs(layout.rowDifference) < 1, 'Demo video and portrait deliverable share one height');
    assert.ok(Math.abs(layout.stripLeft) < 1 && Math.abs(layout.stripRight) < 1, 'Wide deliverable spans the mosaic edges');
  };
  try {
    const fallback = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
    const rangeCheck = await fallback.request.get(new URL('/asset/casex/platform-demo.mp4', url).href, {
      headers: { Range: 'bytes=0-15' },
    });
    assert.equal(rangeCheck.status(), 206, 'Video seeking needs real HTTP Range support; restart an outdated preview server');
    assert.equal((await rangeCheck.body()).length, 16);
    assert.match(rangeCheck.headers()['content-range'], /^bytes 0-15\/\d+$/);
    await fallback.goto(url);
    const gallery = fallback.locator('noscript .intern-gallery').first();
    assert.equal(await gallery.isVisible(), true);
    assert.equal(await gallery.locator('img').count(), 3);
    for (const image of await gallery.locator('img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(img => img.decode());
    }
    assert.equal(await fallback.locator('.intern-logo').first().evaluate(img => getComputedStyle(img).opacity), '1');
    assert.equal(await fallback.locator('.intern-media .fallback-video').first().isVisible(), true);
    assert.equal(await fallback.locator('.intern-media .fallback-video').first().evaluate(video => video.controls), true);
    assert.equal(await fallback.locator('.terminal-screen').evaluate(screen => screen.scrollWidth <= screen.clientWidth), true);
    await fallback.close();

    for (const width of [320, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 720 } });
      watch(page);
      // Use the actual preview server: mocking media responses masks Range/seek bugs.
      await page.addInitScript(() => {
        // Init scripts also run in the sandboxed playable iframe, which has no storage access.
        if (window !== window.top) return;
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
      await page.keyboard.press('Escape');
      await page.locator('#intern-image-viewer').waitFor({ state: 'hidden' });
      await page.waitForTimeout(450); // Ignore the intentional post-close navigation guard.
      await page.locator('#terminal-window').focus();
      await page.keyboard.press('Enter');
      await page.locator('#intern02-media').waitFor({ state: 'visible' });
      await page.locator('#intern02-media .intern-video-open').click();
      await page.locator('#intern-video-viewer[open]').waitFor();
      const video = page.locator('#intern-video-viewer video');
      assert.equal(await video.evaluate(element => element.controls), false);
      assert.equal(await video.evaluate(element => element.muted), false);
      assert.equal(await video.getAttribute('aria-hidden'), null);
      await page.waitForFunction(() => {
        const video = document.querySelector('#intern-video-viewer video');
        return video && !video.paused && video.duration > 0;
      });
      await video.click({ position: { x: 10, y: 10 } });
      assert.equal(await video.evaluate(element => element.paused), true);
      assert.equal(await page.locator('#intern-video-viewer').evaluate(dialog => dialog.open), true);
      assert.equal(await page.locator('#video-viewer-toggle').getAttribute('aria-label'), '播放视频');
      const progress = page.locator('#video-viewer-progress');
      assert.equal(await progress.isVisible(), true);
      assert.equal(await page.locator('#video-viewer-time').count(), 0);
      assert.equal(await page.locator('#video-viewer-toggle svg').count(), 2);
      assert.equal(await page.locator('#video-viewer-toggle').innerText(), '');
      await progress.evaluate(input => {
        input.value = String(Number(input.max) / 2);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForFunction(() => {
        const video = document.querySelector('#intern-video-viewer video');
        return !video.seeking && Math.abs(video.currentTime - video.duration / 2) < 0.2;
      });
      assert.equal(await video.evaluate(element => element.paused), true, 'Seeking must preserve pause');
      await progress.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#intern-video-viewer').evaluate(dialog => dialog.open), true);
      const dragProgress = async () => {
        const bounds = await progress.boundingBox();
        await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height / 2, { steps: 8 });
        await page.waitForTimeout(200);
        assert.equal(await video.evaluate(element => element.paused), true, 'Pause decoding during a scrub');
        const target = await progress.inputValue();
        await video.evaluate(element => element.dispatchEvent(new Event('timeupdate')));
        assert.equal(await progress.inputValue(), target, 'Playback updates must not overwrite a dragged slider');
        await page.mouse.up();
        await page.waitForFunction(target => {
          const video = document.querySelector('#intern-video-viewer video');
          return !video.seeking && Math.abs(video.currentTime - Number(target)) < 0.8;
        }, target);
        assert.equal(await page.locator('#intern-video-viewer').evaluate(dialog => dialog.open), true);
      };
      await dragProgress();
      assert.equal(await video.evaluate(element => element.paused), true, 'Paused scrub must stay paused');
      await page.waitForTimeout(300);
      await video.click({ position: { x: 10, y: 10 } });
      assert.equal(await video.evaluate(element => element.paused), false);
      await dragProgress();
      await page.waitForFunction(() => !document.querySelector('#intern-video-viewer video').paused);
      await page.waitForTimeout(300);
      await video.hover({ position: { x: 10, y: 10 } });
      assert.equal(await page.locator('#video-viewer-toggle').evaluate(button => getComputedStyle(button).opacity), '0', 'Hover must not show the central icon during playback');
      await video.click({ position: { x: 10, y: 10 } });
      assert.equal(await video.evaluate(element => element.paused), true);
      assert.equal(await page.locator('.media-viewer-close').count(), 0);
      if (width > 700) await page.mouse.click(1, 1);
      else await page.keyboard.press('Escape');
      await page.locator('#intern-video-viewer').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#video-viewer-controls').isVisible(), false);
      assert.equal(await page.locator('#intern02-media .intern-video-open video').evaluate(element => element.controls), false);
      assert.equal(await page.locator('#scroll-hint').isVisible(), true, 'Showcase follows internship 02');
      assert.equal(await page.locator('.terminal-screen').evaluate(screen => screen.scrollWidth <= screen.clientWidth), true);
      await jump(page, 'case02');
      await page.locator('#case02-content').waitFor({ state: 'visible' });
      await page.locator('#scroll-hint').waitFor({ state: 'visible' });
      await jump(page, 'case03');
      await page.locator('#case03-content').waitFor({ state: 'visible' });
      await page.locator('#scroll-hint').waitFor({ state: 'visible' });
      await page.waitForTimeout(100);
      const case03Layout = await page.locator('#case03-content').evaluate(readCase03Layout);
      if (width > 700) {
        checkCase03Layout(case03Layout);
      } else {
        assert.ok(case03Layout.imageTop >= case03Layout.bodyBottom, 'CASE 03 remains stacked on mobile');
      }
      await jump(page, 'casex');
      await page.locator('#casex-content').waitFor({ state: 'visible' });
      await page.locator('#scroll-hint').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.terminal-screen').evaluate(screen => screen.scrollWidth <= screen.clientWidth), true);
      // Reproduce CASE X: the displayed slider AND decoded video frames must start at the midpoint.
      await page.locator('#casex-content .intern-video-open').click();
      await page.waitForFunction(() => document.querySelector('#intern-video-viewer video')?.duration > 0);
      await page.locator('#intern-video-viewer video').evaluate(element => element.pause());
      const midpoint = await page.locator('#intern-video-viewer video').evaluate(element => element.duration / 2);
      await progress.evaluate((input, target) => {
        input.value = String(target);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, midpoint);
      await page.waitForFunction(target => {
        const video = document.querySelector('#intern-video-viewer video');
        return !video.seeking && Math.abs(video.currentTime - target) < 0.2;
      }, midpoint);
      await page.evaluate(() => {
        const video = document.querySelector('#intern-video-viewer video');
        window.testDecodedFrame = new Promise(resolve => video.requestVideoFrameCallback((_, frame) => resolve(frame.mediaTime)));
      });
      await page.locator('#video-viewer-toggle').click();
      const decodedTime = await page.evaluate(() => window.testDecodedFrame);
      assert.ok(Math.abs(decodedTime - midpoint) < 1, 'Actual decoded frame must be from the midpoint, not the start');
      await page.waitForFunction(target => {
        const video = document.querySelector('#intern-video-viewer video');
        const slider = document.querySelector('#video-viewer-progress');
        return !video.paused && video.currentTime > target + 0.3 && Math.abs(Number(slider.value) - video.currentTime) < 0.5;
      }, midpoint);
      await page.keyboard.press('Escape');
      await page.locator('#intern-video-viewer').waitFor({ state: 'hidden' });
      await jump(page, 'casex-marketing');
      await page.locator('#casex-marketing-content').waitFor({ state: 'visible' });
      await page.waitForFunction(() => [...document.querySelectorAll('#casex-marketing-content .intern-media')].every(media => media.classList.contains('is-visible')));
      assert.equal(await page.locator('#scroll-hint').isVisible(), false, 'Last section has no continue hint');
      assert.equal(await page.locator('.terminal-screen').evaluate(screen => screen.scrollWidth <= screen.clientWidth), true);
      await page.waitForTimeout(100); // Let the ResizeObserver size the media column first.
      const mosaicLayout = await page.locator('#casex-marketing-content').evaluate(readMosaicLayout);
      if (width > 700) checkMosaicLayout(mosaicLayout);
      else assert.ok(mosaicLayout.mosaicTop >= mosaicLayout.statsBottom, 'Marketing mosaic stacks below the text on mobile');
      await page.locator('#casex-marketing-content .case-mosaic-portrait .intern-image-open').click();
      await page.locator('#intern-image-viewer[open]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#intern-image-viewer').waitFor({ state: 'hidden' });
      await jump(page, 'welcome');
      assert.equal(await page.locator('#cat-command').isVisible(), true);
      await page.close();
    }

    const alignment = await browser.newPage();
    watch(alignment);
    await alignment.addInitScript(() => {
      if (window !== window.top) return;
      localStorage.setItem('finjix-no-animation', 'true');
      localStorage.setItem('finjix-skip-power-start', 'true');
    });
    await alignment.goto(url);
    await jump(alignment, 'case03');
    await alignment.locator('#scroll-hint').waitFor({ state: 'visible' });
    for (const width of [800, 1024, 1751, 1920, 2560, 1280]) {
      await alignment.setViewportSize({ width, height: 950 });
      await alignment.waitForTimeout(150);
      checkCase03Layout(await alignment.locator('#case03-content').evaluate(readCase03Layout));
    }
    await jump(alignment, 'casex-marketing');
    await alignment.locator('#casex-marketing-content').waitFor({ state: 'visible' });
    for (const width of [800, 1024, 1751, 1920, 2560, 1280]) {
      await alignment.setViewportSize({ width, height: 950 });
      await alignment.waitForTimeout(150);
      checkMosaicLayout(await alignment.locator('#casex-marketing-content').evaluate(readMosaicLayout));
    }
    await alignment.close();

    const fullAnimation = await browser.newPage();
    watch(fullAnimation);
    await fullAnimation.goto(url);
    await fullAnimation.locator('#app-launch-icon').click();
    await fullAnimation.locator('#scroll-hint').waitFor({ state: 'visible' });
    await fullAnimation.locator('#terminal-window').focus();
    await fullAnimation.keyboard.press('Enter');
    await fullAnimation.locator('#scroll-hint').waitFor({ state: 'visible' });
    assert.equal(await fullAnimation.locator('#intern-gallery').isVisible(), true);
    await fullAnimation.locator('#terminal-window').focus();
    await fullAnimation.keyboard.press('Enter');
    await fullAnimation.waitForFunction(() => !document.querySelector('#terminal-window').classList.contains('is-typing'));
    assert.equal(await fullAnimation.locator('#intern02-media').isVisible(), true);
    await fullAnimation.locator('#scroll-hint').waitFor({ state: 'visible' });
    await fullAnimation.close();

    const animated = await browser.newPage();
    watch(animated);
    await animated.goto(url);
    await animated.locator('#app-launch-icon').click();
    await animated.locator('#settings-menu-toggle').click();
    await animated.locator('#animation-toggle').uncheck();
    await animated.keyboard.press('Escape');
    await animated.locator('#scroll-hint').waitFor({ state: 'visible' });
    assert.equal(await animated.evaluate(() => localStorage.getItem('finjix-no-animation')), 'true');
    await animated.reload();
    assert.equal(await animated.locator('html').evaluate(html => html.classList.contains('no-animation')), true);
    await animated.locator('#app-launch-icon').click();
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
    // 跳转会完整显示上方的板块：被打断的第一段不能停在打了一半的状态。
    assert.equal(await animated.locator('#intern-gallery').isVisible(), true, 'Cancelled section must be completed by the jump');
    assert.match(await animated.locator('#intern-content .intern-description').innerText(), /提升内容生产效率$/);
    assert.equal(await animated.locator('#intern-section .intern-logo').evaluate(img => img.classList.contains('is-visible')), true);
    await animated.waitForFunction(() => !document.querySelector('#terminal-window').classList.contains('is-typing'));
    await animated.close();

    const blocked = await browser.newPage();
    watch(blocked);
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
    });
    await blocked.goto(url);
    await blocked.locator('#app-launch-icon').click();
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
