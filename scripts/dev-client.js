// Local preview only: CSS HMR, with state-preserving reload for other changes.
(() => {
  const config = window.__finjixDevPreview;
  const stateKey = '__finjixDevReload';
  const saved = history.state?.[stateKey];
  if (saved) {
    history.replaceState(saved.previous, '');
    if (Date.now() - saved.time < 30000) config.restore = saved.app;
  }
  if (config.restore?.started) {
    const style = document.createElement('style');
    style.textContent = '.app-launch{display:none!important}.terminal-page *{animation:none!important;transition:none!important}';
    document.head.append(style);
    config.restoringStyle = style;
  }
  let applied = config.files;
  let pending = null;
  const versioned = (href, revision) => {
    const url = new URL(href, location.href);
    url.searchParams.set('__dev', revision);
    return url.href;
  };
  const replaceStyles = async (revision) => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter(link => new URL(link.href).origin === location.origin);
    if (!links.length) return false;
    const replacements = links.map(old => {
      const next = old.cloneNode();
      next.href = versioned(old.href, revision);
      return { old, next };
    });
    try {
      await Promise.all(replacements.map(({ old, next }) => new Promise((resolve, reject) => {
        next.onload = resolve;
        next.onerror = reject;
        old.after(next);
      })));
      replacements.forEach(({ old }) => old.remove());
      // Recompute media layout too, even when the viewport width did not change.
      window.dispatchEvent(new Event('finjix:styles-updated'));
      return true;
    } catch {
      replacements.forEach(({ next }) => next.remove());
      return false; // Keep the working styles; retry after the next poll.
    }
  };
  const reload = () => {
    try {
      history.replaceState({ [stateKey]: {
        previous: history.state,
        time: Date.now(),
        app: config.capture?.(),
      } }, '');
    } catch (error) {
      console.warn('[preview] Could not save page state', error);
    }
    location.reload();
  };
  async function check() {
    try {
      const response = await fetch('/__dev_manifest', { cache: 'no-store' });
      if (response.ok) {
        const next = await response.json();
        if (next.revision !== config.revision && next.revision === pending) {
          const changed = [...new Set([...Object.keys(applied), ...Object.keys(next.files)])]
            .filter(path => applied[path] !== next.files[path]);
          if (changed.length && changed.every(path => path.endsWith('.css'))) {
            if (await replaceStyles(next.revision)) {
              applied = next.files;
              config.revision = next.revision;
            }
          } else {
            reload();
            return;
          }
        }
        pending = next.revision;
      }
    } catch { /* Keep checking while the local server restarts or files are being saved. */ }
    setTimeout(check, 600);
  }
  setTimeout(check, 600);
})();
