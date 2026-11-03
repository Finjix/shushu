const terminalPage = document.querySelector(".terminal-page");
const appLaunchIcon = document.querySelector("#app-launch-icon");
const terminalWindow = document.querySelector("#terminal-window");
const bootActivity = document.querySelector("#boot-activity");
const catCommand = document.querySelector("#cat-command");
const terminalPrompt = catCommand?.querySelector(".terminal-prompt");
const catText = document.querySelector("#cat-text");
const welcomeContent = document.querySelector("#welcome-content");
const welcomeText = document.querySelector("#welcome-text");
const typingCursor = document.querySelector("#typing-cursor");
const terminalReady = document.querySelector("#terminal-ready");
const terminalCursor = document.querySelector("#terminal-cursor");
const scrollHint = document.querySelector("#scroll-hint");
const internships = [...document.querySelectorAll(".intern-section")].map((section) => ({
  id: section.dataset.section,
  section,
  command: section.querySelector(".terminal-command"),
  commandText: section.querySelector(".cat-text"),
  content: section.querySelector(".intern-content"),
  logo: section.querySelector(".intern-logo"),
  logoWrap: section.querySelector(".intern-logo-wrap"),
  gallery: section.querySelector(".intern-gallery"),
  mediaItems: [...section.querySelectorAll(".intern-media")],
  videos: [...section.querySelectorAll(".intern-media video, .intern-image-slot video")],
  // 需要预加载的图片和视频（data-src 在加载开始时移除，这里先记下来）。
  assets: [...section.querySelectorAll("img[data-src], video[data-src]")],
  // 穿插在正文中的揭晓块（ABOUT ME 的头像、技能标签），打字进行到其后的第一段文字前揭晓。
  reveals: [...section.querySelectorAll("[data-reveal]")],
}));
const internImageViewer = document.querySelector("#intern-image-viewer");
const internImageViewerStage = internImageViewer?.querySelector("#intern-image-viewer-stage");
const internImageViewerImage = internImageViewer?.querySelector("#intern-image-viewer-image");
const internVideoViewer = document.querySelector("#intern-video-viewer");
const internVideoViewerStage = internVideoViewer?.querySelector("#intern-video-viewer-stage");
const terminalScreen = document.querySelector(".terminal-screen");
const settingsMenuToggle = document.querySelector("#settings-menu-toggle");
const settingsMenu = document.querySelector("#terminal-settings-menu");
const animationToggle = document.querySelector("#animation-toggle");
const startupPageToggle = document.querySelector("#startup-page-toggle");

if (terminalPage && appLaunchIcon && terminalWindow && bootActivity && catCommand && terminalPrompt && catText && welcomeContent && welcomeText && typingCursor && terminalReady && terminalCursor && internships.length && internships.every((internship) => internship.id && internship.command && internship.commandText && internship.content) && internImageViewer && internImageViewerStage && internImageViewerImage && internVideoViewer && internVideoViewerStage && terminalScreen && settingsMenuToggle && settingsMenu && animationToggle && startupPageToggle && scrollHint) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const textTargets = [welcomeText, ...terminalWindow.querySelectorAll("[data-typewriter]")];
  const charactersByTarget = textTargets.map((target) => Array.from(target.textContent));
  const commandCharacters = Array.from(catText.textContent);
  internships.forEach((internship) => {
    internship.targets = [...internship.content.querySelectorAll("[data-intern-typewriter]")];
    internship.characters = internship.targets.map((target) => Array.from(target.textContent));
    internship.commandCharacters = Array.from(internship.commandText.textContent);
    internship.started = false;
    internship.finished = false;
    internship.followOutput = true;
  });
  let welcomeFinished = false;
  let currentSection = "welcome";
  let navigationInProgress = false;
  // 与 styles.css 中移动端布局的断点一致。
  const mobileLayout = window.matchMedia("(max-width: 700px)");
  const getInternship = (target) => internships.find((internship) => internship.id === target);
  const getNextInternship = () => {
    const currentIndex = internships.findIndex((internship) => internship.id === currentSection);
    return internships.slice(currentIndex + 1).find((internship) => !internship.started);
  };
  const updateContinueHint = () => {
    scrollHint.hidden = !welcomeFinished || navigationInProgress || !getNextInternship();
  };
  // 资源预加载队列。板块由 cat 手动触发，下一个板块是可预知的：
  // 当前板块（now）立即加载且不受并发限制；下一板块（next）在后台预取；再往后或跳转时上方的旧板块（background）
  // 只在前两者都没有排队时加载。预取限制并发，大文件不会和当前板块抢带宽；
  // 视频预取只拉元数据和首帧，轮到当前板块时再改为完整缓冲。省流量模式或 2G 网络下只加载当前板块。
  const PRIORITY = { now: 0, next: 1, background: 2 };
  const MAX_PREFETCH = 2;
  const connection = navigator.connection;
  const isLowBandwidth = () => Boolean(connection?.saveData) || /(^|-)2g$/.test(connection?.effectiveType || "");
  const assetJobs = new Map();
  const pendingJobs = [];
  let activePrefetches = 0;
  let jobSequence = 0;
  const applyAssetPriority = (job) => {
    const urgent = job.priority === PRIORITY.now;
    if (job.element.tagName === "IMG") job.element.fetchPriority = urgent ? "high" : "low";
    else job.element.preload = urgent ? "auto" : "metadata";
  };
  const startAssetJob = (job) => {
    const { element } = job;
    job.started = true;
    const counted = job.priority !== PRIORITY.now;
    if (counted) activePrefetches += 1;
    let released = false;
    // 预取名额在图片下载完、视频拿到首帧（预取时拿到元数据）、出错或超时后释放，之后浏览器继续在后台缓冲。
    const release = () => {
      if (released) return;
      released = true;
      job.fetched = true;
      window.clearTimeout(releaseTimer);
      if (counted) activePrefetches -= 1;
      pumpAssetJobs();
    };
    const releaseTimer = window.setTimeout(release, 8000);
    const finish = () => {
      if (job.done) return;
      job.done = true;
      job.resolve(element);
      release();
      pumpAssetJobs();
    };
    applyAssetPriority(job);
    element.addEventListener("error", finish, { once: true });
    if (element.tagName === "IMG") {
      element.addEventListener("load", () => {
        // 下载完就把名额让给下一个资源；解码只影响何时揭晓。
        release();
        if (typeof element.decode === "function") element.decode().then(finish).catch(finish);
        else finish();
      }, { once: true });
    } else {
      element.addEventListener("loadeddata", finish, { once: true });
      element.addEventListener("loadedmetadata", () => { if (job.priority !== PRIORITY.now) release(); }, { once: true });
    }
    // 视频封面随视频一起由队列加载，不在页面打开时就请求。
    if (element.dataset.poster) {
      element.poster = element.dataset.poster;
      element.removeAttribute("data-poster");
    }
    element.src = element.dataset.src;
    element.removeAttribute("data-src");
  };
  const pumpAssetJobs = () => {
    pendingJobs.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
    while (pendingJobs.length) {
      const job = pendingJobs[0];
      if (job.priority !== PRIORITY.now) {
        if (activePrefetches >= MAX_PREFETCH || isLowBandwidth()) return;
        // 后台资源只在没有当前/下一板块资源排队时才开始。
        if (job.priority === PRIORITY.background && [...assetJobs.values()].some((item) => item.priority < PRIORITY.background && !item.fetched)) return;
      }
      pendingJobs.shift();
      startAssetJob(job);
    }
  };
  const requestAsset = (element, priority) => {
    let job = assetJobs.get(element);
    if (!job) {
      if (!element.dataset.src) return Promise.resolve(element);
      job = { element, priority, sequence: jobSequence += 1, started: false, fetched: false, done: false };
      job.promise = new Promise((resolve) => { job.resolve = resolve; });
      assetJobs.set(element, job);
      pendingJobs.push(job);
    } else if (priority < job.priority) {
      job.priority = priority;
      // 已拿到首帧的预取视频也要升级，才会继续完整缓冲。
      if (job.started) applyAssetPriority(job);
    }
    pumpAssetJobs();
    return job.promise;
  };
  // 试玩 iframe 运行 WebGL，较重：揭晓后等浏览器空闲、且出现在视口内时才加载，不参与下一模块预取。
  // iframe 带 sandbox（不同源），支持的浏览器会放到独立进程，加载和渲染不再卡住本页。
  // 预览离开视口或弹窗打开时通过 postMessage 暂停渲染。
  const playables = new Map();
  const whenIdle = (callback) => (window.requestIdleCallback ? window.requestIdleCallback(callback, { timeout: 1500 }) : window.setTimeout(callback, 300));
  const syncPlayable = (media) => {
    const state = playables.get(media);
    const frame = media.querySelector("iframe");
    if (!state || !frame) return;
    if (frame.dataset.src) {
      if (!state.wanted || !state.visible || state.loading) return;
      state.loading = true;
      whenIdle(() => {
        state.loading = false;
        if (!state.wanted || !frame.dataset.src) return;
        frame.src = frame.dataset.src;
        frame.removeAttribute("data-src");
      });
      return;
    }
    frame.contentWindow?.postMessage({ playable: state.visible && !state.covered ? "resume" : "pause" }, "*");
  };
  const playableObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const state = playables.get(entry.target);
      if (state) state.visible = entry.isIntersecting;
      syncPlayable(entry.target);
    });
  }) : null;
  document.querySelectorAll(".case-playable").forEach((media) => {
    playables.set(media, { wanted: false, visible: !playableObserver, covered: false, loading: false });
    playableObserver?.observe(media);
    // 加载完成时补发一次当前状态：页面已滚走或弹窗已打开时立即暂停。
    media.querySelector("iframe")?.addEventListener("load", () => syncPlayable(media));
  });
  const loadFrames = (media) => {
    const state = playables.get(media);
    if (!state) return;
    state.wanted = true;
    syncPlayable(media);
  };
  const unloadFrames = (media) => {
    const state = playables.get(media);
    if (state) state.wanted = false;
    media.querySelectorAll("iframe[src]:not([data-src])").forEach((frame) => {
      frame.dataset.src = frame.getAttribute("src");
      frame.src = "about:blank";
    });
  };
  const playMedia = (media) => {
    if (!media) return;
    const playback = media.play();
    if (playback?.catch) playback.catch(() => {});
  };
  // 内联视频离开视口时暂停、回到视口且已揭晓时继续，视频变多后不会在屏外同时解码。
  // 观察器只在可见状态变化时回调：揭晓（含菜单跳转一次性揭晓上方板块）时若视频在屏外，
  // 要按记录的状态跳过播放，等它滚入视口再由观察器开始。
  const inlineVideoVisible = new WeakMap();
  const playInlineVideo = (video) => {
    if (video && inlineVideoVisible.get(video) !== false) playMedia(video);
  };
  const inlineVideoObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach(({ target: video, isIntersecting }) => {
      inlineVideoVisible.set(video, isIntersecting);
      if (video.closest("dialog")) return;
      if (!isIntersecting) video.pause();
      else if (video.currentSrc && video.closest(".intern-media, .intern-image-slot")?.classList.contains("is-visible")) playMedia(video);
    });
  }) : null;
  internships.forEach((internship) => internship.videos.forEach((video) => inlineVideoObserver?.observe(video)));
  const loadSectionAssets = (target, priority = PRIORITY.now) => {
    const internship = getInternship(target);
    return Promise.all(internship ? internship.assets.map((element) => requestAsset(element, priority)) : []);
  };
  // 浏览当前板块时预取下一板块，再往后的一个板块排在后台，避免首屏一次加载全部资源。
  const preloadNextSection = () => {
    const currentIndex = internships.findIndex((internship) => internship.id === currentSection);
    const upcoming = internships.slice(currentIndex + 1).filter((internship) => !internship.started);
    if (upcoming[0]) void loadSectionAssets(upcoming[0].id, PRIORITY.next);
    if (upcoming[1]) void loadSectionAssets(upcoming[1].id, PRIORITY.background);
  };
  const waitForSectionAssets = (target, timeout = 5000) => Promise.race([
    loadSectionAssets(target),
    new Promise((resolve) => window.setTimeout(resolve, timeout)),
  ]);
  let noAnimation = document.documentElement.classList.contains("no-animation");
  let skipPowerStart = false;
  try { skipPowerStart = localStorage.getItem("finjix-skip-power-start") === "true"; } catch {}
  let flowVersion = 0;
  const pendingAnimations = new Set();
  const wait = (duration, version = flowVersion) => new Promise((resolve) => {
    if (noAnimation || version !== flowVersion) return resolve();
    const finish = () => {
      window.clearTimeout(timer);
      pendingAnimations.delete(finish);
      resolve();
    };
    const timer = window.setTimeout(finish, duration);
    pendingAnimations.add(finish);
  });
  const invalidateFlow = () => {
    scrollHint.hidden = true;
    flowVersion += 1;
    [...pendingAnimations].forEach((finish) => finish());
    return flowVersion;
  };
  let hasStarted = false;
  let audioContext = null;
  let masterVolume = null;
  let typingNoiseBuffer = null;

  const updateAnimationToggle = () => {
    animationToggle.checked = !noAnimation;
    document.documentElement.classList.toggle("no-animation", noAnimation);
  };
  updateAnimationToggle();
  settingsMenuToggle.disabled = false;
  startupPageToggle.checked = !skipPowerStart;
  animationToggle.addEventListener("change", () => {
    noAnimation = !animationToggle.checked;
    updateAnimationToggle();
    try { localStorage.setItem("finjix-no-animation", String(noAnimation)); } catch {}
    if (masterVolume) masterVolume.gain.setValueAtTime(noAnimation ? 0 : 0.5, audioContext.currentTime);
    if (noAnimation) [...pendingAnimations].forEach((finish) => finish());
  });
  startupPageToggle.addEventListener("change", () => {
    skipPowerStart = !startupPageToggle.checked;
    document.documentElement.classList.toggle("skip-power-start", skipPowerStart);
    try { localStorage.setItem("finjix-skip-power-start", String(skipPowerStart)); } catch {}
  });
  const closeSettingsMenu = (restoreFocus = false) => {
    settingsMenu.hidden = true;
    settingsMenuToggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) settingsMenuToggle.focus();
  };
  settingsMenuToggle.addEventListener("click", () => {
    const opening = settingsMenu.hidden;
    settingsMenu.hidden = !opening;
    settingsMenuToggle.setAttribute("aria-expanded", String(opening));
    // preventScroll：矮屏上聚焦菜单底部的开关会把整个终端窗口顶上去。
    if (opening) animationToggle.focus({ preventScroll: true });
  });
  settingsMenu.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      const focusable = [...settingsMenu.querySelectorAll("button:not([disabled]), input:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const wrapped = event.shiftKey ? active === first : active === last;
      if (wrapped || !settingsMenu.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeSettingsMenu(true);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || settingsMenu.hidden) return;
    event.preventDefault();
    closeSettingsMenu(true);
  });
  document.addEventListener("pointerdown", (event) => {
    if (settingsMenu.hidden || settingsMenu.contains(event.target) || settingsMenuToggle.contains(event.target)) return;
    closeSettingsMenu();
  });

  textTargets.forEach((target) => {
    target.textContent = "";
  });
  catText.textContent = "";
  internships.forEach((internship) => {
    internship.targets.forEach((target) => { target.textContent = ""; });
    internship.commandText.textContent = "";
    internship.section.hidden = true;
    internship.content.hidden = true;
    internship.gallery?.querySelectorAll(".intern-image-open").forEach((button) => { button.disabled = true; });
  });
  welcomeContent.hidden = true;
  terminalReady.hidden = true;
  terminalWindow.setAttribute("aria-hidden", "true");

  const prepareAudio = () => {
    if (noAnimation || !AudioContextClass) return false;

    try {
      if (!audioContext) {
        audioContext = new AudioContextClass();
        masterVolume = audioContext.createGain();
        masterVolume.gain.setValueAtTime(0.5, audioContext.currentTime);
        masterVolume.connect(audioContext.destination);

        const bufferLength = Math.ceil(audioContext.sampleRate * 0.06);
        typingNoiseBuffer = audioContext.createBuffer(1, bufferLength, audioContext.sampleRate);
        const noiseSamples = typingNoiseBuffer.getChannelData(0);
        for (let index = 0; index < noiseSamples.length; index += 1) {
          noiseSamples[index] = Math.random() * 2 - 1;
        }
      }

      if (audioContext.state !== "running") {
        audioContext.resume().catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  };

  // 全站统一的点击/揭晓音效：打开图标、打开任意预览、图片和视频揭晓都用这一声。
  const playImageRevealSound = () => {
    if (!prepareAudio()) return;

    const playPing = () => {
      if (noAnimation || audioContext.state !== "running") return;

      const startTime = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const envelope = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(587.33, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(783.99, startTime + 0.09);
      envelope.gain.setValueAtTime(0.0001, startTime);
      envelope.gain.exponentialRampToValueAtTime(0.12, startTime + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);
      oscillator.connect(envelope);
      envelope.connect(masterVolume);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.23);
    };

    if (audioContext.state === "running") {
      playPing();
    } else {
      audioContext.resume().then(playPing).catch(() => {});
    }
  };

  const playTypingSound = (character) => {
    if (noAnimation || !audioContext || audioContext.state !== "running" || !typingNoiseBuffer) return;

    const startTime = audioContext.currentTime;
    const noise = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    const isWhitespace = /\s/.test(character);

    noise.buffer = typingNoiseBuffer;
    noise.playbackRate.setValueAtTime(0.82 + Math.random() * 0.36, startTime);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1500 + Math.random() * 1700, startTime);
    filter.Q.setValueAtTime(0.8, startTime);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.exponentialRampToValueAtTime(isWhitespace ? 0.11 : 0.28, startTime + 0.0015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.028);

    noise.connect(filter);
    filter.connect(envelope);
    envelope.connect(masterVolume);
    noise.start(startTime, 0, 0.035);
    noise.stop(startTime + 0.036);
  };

  const revealLogo = async (internship, version = flowVersion) => {
    const { logo, logoWrap } = internship;
    if (!logo || !logoWrap || version !== flowVersion) return;
    const characterDelays = Array.from({ length: 6 }, () => 20 + Math.random() * 15);
    const duration = characterDelays.reduce((total, delay) => total + delay, 0);
    if (noAnimation) {
      logo.classList.add("is-visible");
      return;
    }

    logoWrap.style.setProperty("--logo-type-duration", `${duration}ms`);
    logo.classList.add("is-visible");
    for (const delay of characterDelays) {
      if (noAnimation) break;
      playTypingSound("x");
      await wait(delay, version);
      if (version !== flowVersion) return;
    }
    logoWrap.style.removeProperty("--logo-type-duration");
  };

  const followRevealedElement = (internship, element) => {
    if (!internship.followOutput) return;
    const overflow = element.getBoundingClientRect().bottom - terminalScreen.getBoundingClientRect().bottom + 24;
    if (overflow > 0) terminalScreen.scrollTop += overflow;
  };

  const revealBlock = async (internship, block, version) => {
    const image = block.querySelector("img");
    // 头像体积小，揭晓前最多等 1.5 秒，不显示 Loading 提示；技能标签整块直接出现。
    if (image && !noAnimation) await Promise.race([requestAsset(image, PRIORITY.now), new Promise((resolve) => window.setTimeout(resolve, 1500))]);
    if (version !== flowVersion) return;
    playImageRevealSound();
    block.classList.add("is-visible");
    followRevealedElement(internship, block);
    await wait(330, version);
  };

  // 揭晓所有排在 target 之前、尚未揭晓的块；target 为 null 时揭晓剩余全部。
  const revealBlocksBefore = async (internship, target, version) => {
    for (const block of internship.reveals) {
      if (version !== flowVersion) return;
      if (block.classList.contains("is-visible")) continue;
      if (target && !(block.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
      await revealBlock(internship, block, version);
    }
  };

  const playEnterKeySound = () => {
    if (noAnimation || !audioContext || audioContext.state !== "running" || !typingNoiseBuffer) return;

    const startTime = audioContext.currentTime;
    const click = audioContext.createBufferSource();
    const clickFilter = audioContext.createBiquadFilter();
    const clickEnvelope = audioContext.createGain();
    const thock = audioContext.createOscillator();
    const thockEnvelope = audioContext.createGain();

    click.buffer = typingNoiseBuffer;
    clickFilter.type = "bandpass";
    clickFilter.frequency.setValueAtTime(1850, startTime);
    clickFilter.Q.setValueAtTime(0.7, startTime);
    clickEnvelope.gain.setValueAtTime(0.0001, startTime);
    clickEnvelope.gain.exponentialRampToValueAtTime(1.15, startTime + 0.0015);
    clickEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.045);
    click.connect(clickFilter);
    clickFilter.connect(clickEnvelope);
    clickEnvelope.connect(masterVolume);
    click.start(startTime, 0, 0.05);
    click.stop(startTime + 0.051);

    thock.type = "triangle";
    thock.frequency.setValueAtTime(230, startTime);
    thock.frequency.exponentialRampToValueAtTime(125, startTime + 0.065);
    thockEnvelope.gain.setValueAtTime(0.0001, startTime);
    thockEnvelope.gain.exponentialRampToValueAtTime(0.8, startTime + 0.003);
    thockEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.075);
    thock.connect(thockEnvelope);
    thockEnvelope.connect(masterVolume);
    thock.start(startTime);
    thock.stop(startTime + 0.08);
  };

  const typeCharacters = async (target, characters, delayForCharacter, followOutput = false, version = flowVersion) => {
    for (let index = 0; index < characters.length; index += 1) {
      if (version !== flowVersion) return false;
      if (noAnimation) {
        target.textContent += characters.slice(index).join("");
        if (followOutput) terminalScreen.scrollTop = terminalScreen.scrollHeight;
        return true;
      }
      const character = characters[index];
      target.textContent += character;
      playTypingSound(character);
      if (followOutput) terminalScreen.scrollTop = terminalScreen.scrollHeight;
      await wait(delayForCharacter(character), version);
    }
    return version === flowVersion;
  };

  const blinkCursor = async (duration, keepFinishedState = false, version = flowVersion) => {
    if (noAnimation || version !== flowVersion) return;
    typingCursor.style.animationDuration = `${duration}ms`;
    typingCursor.classList.add("is-blinking-once");
    await wait(duration, version);
    if (version !== flowVersion) return;
    if (!keepFinishedState) {
      typingCursor.classList.remove("is-blinking-once");
      typingCursor.style.animationDuration = "";
    }
  };

  const typeAllText = async (version = flowVersion) => {
    if (version !== flowVersion) return false;
    typingCursor.classList.remove("is-blinking-once");
    typingCursor.style.animationDuration = "";
    for (let targetIndex = 0; targetIndex < textTargets.length; targetIndex += 1) {
      if (version !== flowVersion) return false;
      const target = textTargets[targetIndex];
      target.after(typingCursor);

      await typeCharacters(target, charactersByTarget[targetIndex],
        (character) => "，。！？；：".includes(character) ? 100 : 20 + Math.random() * 15, false, version);
      if (version !== flowVersion) return false;

      if (targetIndex < textTargets.length - 1) await wait(100, version);
    }

    typingCursor.remove();
    terminalWindow.classList.remove("is-typing");
    return version === flowVersion;
  };

  const revealTerminal = () => {
    hasStarted = true;
    appLaunchIcon.disabled = true;
    appLaunchIcon.setAttribute("aria-hidden", "true");
    terminalWindow.setAttribute("aria-hidden", "false");
    terminalPage.classList.add("is-started");
    terminalWindow.focus({ preventScroll: true });
  };

  const resetWelcomeOutput = () => {
    textTargets.forEach((target) => { target.textContent = ""; });
    catText.textContent = "";
    catCommand.hidden = true;
    catCommand.classList.remove("is-prompting");
    welcomeContent.hidden = true;
    scrollHint.hidden = true;
    terminalReady.hidden = true;
    welcomeFinished = false;
  };

  const resetInternshipOutput = (internship) => {
    internship.targets.forEach((target) => { target.textContent = ""; });
    internship.commandText.textContent = "";
    internship.command.hidden = true;
    internship.command.classList.remove("is-prompting");
    internship.content.hidden = true;
    if (internship.gallery) internship.gallery.hidden = true;
    internship.logo?.classList.remove("is-visible");
    internship.logoWrap?.style.removeProperty("--logo-type-duration");
    internship.gallery?.querySelectorAll(".intern-image-slot").forEach((imageSlot) => {
      imageSlot.classList.remove("is-visible");
      const openButton = imageSlot.querySelector(".intern-image-open, .intern-video-open");
      if (openButton) openButton.disabled = true;
    });
    internship.mediaItems.forEach((media) => {
      media.hidden = true;
      media.classList.remove("is-visible");
      media.style.removeProperty("max-width");
      const openButton = media.querySelector(".intern-video-open, .intern-image-open");
      if (openButton) openButton.disabled = true;
      unloadFrames(media);
    });
    internship.videos.forEach((video) => {
      video.pause();
      if (video.readyState > 0) video.currentTime = 0;
    });
    internship.reveals.forEach((block) => block.classList.remove("is-visible"));
    internship.section.hidden = true;
    internship.section.classList.remove("has-screen-padding", "is-current-screen", "is-screen-reserved");
    internship.section.style.removeProperty("--reserved-gap");
    if (terminalReady.parentElement === internship.section) welcomeContent.after(terminalReady);
    terminalReady.hidden = !welcomeFinished;
    internship.started = false;
    internship.finished = false;
    internship.followOutput = true;
  };

  const prepareSectionNavigation = () => {
    navigationInProgress = false;
    bootActivity.hidden = true;
    typingCursor.remove();
    typingCursor.classList.remove("is-blinking-once");
    typingCursor.style.animationDuration = "";
    terminalWindow.classList.remove("is-typing");
    if (!welcomeFinished) resetWelcomeOutput();
    internships.forEach((internship) => {
      if (!internship.finished) resetInternshipOutput(internship);
    });
  };

  const scrollCommandIntoView = (commandLine) => {
    const offset = commandLine.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top - 24;
    if (Math.abs(offset) > 1) terminalScreen.scrollTop += offset;
  };

  const keepCommandAtPosition = (commandLine, top) => {
    if (top === null) {
      scrollCommandIntoView(commandLine);
      return;
    }
    const offset = commandLine.getBoundingClientRect().top - top;
    if (Math.abs(offset) > 1) terminalScreen.scrollTop += offset;
  };

  // 自动把内容滚进视野时，最多只能滚到让命令行仍停在段落顶部留白处，
  // 否则会把段落上方的正文顶出视口。
  const getCommandScrollRoom = (internship, screenRect) => {
    const sectionInset = parseFloat(getComputedStyle(internship.section).paddingTop) || 0;
    return internship.command.getBoundingClientRect().top - screenRect.top - sectionInset;
  };

  // 揭晓媒体和结尾提示符时的自动滚动量。桌面端最多滚到命令行停在段落顶部；
  // 手机上段落本就高于一屏、命令行早已滚出视口，直接跟到底部，媒体和「单击继续」提示才不会落在屏幕外。
  const limitFollowScroll = (internship, overflow, screenRect) => (mobileLayout.matches
    ? overflow
    : Math.min(overflow, Math.max(0, getCommandScrollRoom(internship, screenRect))));

  // 顶部留白（has-screen-padding）在段落首次显示后一直保留，切换时只动最小高度，
  // 避免旧内容因为留白的增删而上下位移。
  // 菜单跳转/切屏：整屏显示。输入阶段：收起旧段最小高度，新段用与旧提示符
  // 相同的上边距，命令行正好落在旧提示符位置，整个页面完全不动。
  const clearInternshipScreens = () => {
    internships.forEach((item) => {
      item.section.classList.remove("is-current-screen", "is-screen-reserved");
      item.section.style.removeProperty("--reserved-gap");
    });
  };

  const setCurrentInternship = (internship) => {
    clearInternshipScreens();
    if (internship) internship.section.classList.add("has-screen-padding", "is-current-screen");
  };

  const reserveInternshipScreen = (internship) => {
    clearInternshipScreens();
    internship.section.classList.add("is-screen-reserved");
  };

  const restartTerminalCursorBlink = () => {
    terminalCursor.style.animation = "none";
    void terminalCursor.offsetWidth;
    terminalCursor.style.animation = "";
  };

  const typeSectionCommand = async (target, version, commandTop = null) => {
    const internship = getInternship(target);
    const commandLine = internship?.command || catCommand;
    const commandText = internship?.commandText || catText;
    const characters = internship?.commandCharacters || commandCharacters;
    if (internship) {
      internship.section.hidden = false;
      // 与旧提示符保持同样的上边距，输入阶段页面不再因为间距差而位移。
      const readyGap = commandTop === null ? null : getComputedStyle(terminalReady).marginTop;
      reserveInternshipScreen(internship);
      if (readyGap) internship.section.style.setProperty("--reserved-gap", readyGap);
    }
    commandLine.hidden = false;
    commandText.textContent = "";
    terminalWindow.classList.add("is-typing");
    keepCommandAtPosition(commandLine, commandTop);

    commandLine.classList.add("is-prompting");
    commandLine.querySelector(".terminal-prompt").after(typingCursor);
    if (!internship) await blinkCursor(650, false, version);
    if (version !== flowVersion) return false;
    commandLine.classList.remove("is-prompting");
    commandText.after(typingCursor);
    const typed = await typeCharacters(commandText, characters, () => 30 + Math.random() * 15, false, version);
    if (typed && version === flowVersion) keepCommandAtPosition(commandLine, commandTop);
    return typed;
  };

  const completeWelcomeImmediately = () => {
    catCommand.hidden = false;
    catText.textContent = commandCharacters.join("");
    welcomeContent.hidden = false;
    textTargets.forEach((target, index) => {
      target.textContent = charactersByTarget[index].join("");
    });
    typingCursor.remove();
    terminalWindow.classList.remove("is-typing");
    terminalReady.hidden = false;
    welcomeContent.after(terminalReady);
    welcomeFinished = true;
  };

  const scrollToSection = (target) => {
    const internship = getInternship(target);
    if (!internship) {
      terminalScreen.scrollTop = 0;
      return;
    }
    terminalScreen.scrollTop += internship.section.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top;
  };

  const executeSection = async (target, version) => {
    if (version !== flowVersion) return;
    playEnterKeySound();
    await wait(180, version);
    if (version !== flowVersion) return;
    typingCursor.classList.remove("is-blinking-once");
    typingCursor.style.animationDuration = "";
    typingCursor.remove();

    if (target === "welcome") {
      welcomeContent.hidden = false;
      terminalReady.hidden = false;
      welcomeContent.after(terminalReady);
      if (!welcomeFinished) {
        terminalWindow.classList.add("is-typing");
        const completed = await typeAllText(version);
        if (!completed || version !== flowVersion) return;
        welcomeFinished = true;
      }
      terminalWindow.classList.remove("is-typing");
      terminalScreen.scrollTop = 0;
      navigationInProgress = false;
      updateContinueHint();
      return;
    }

    const internship = getInternship(target);
    internship.started = true;
    internship.section.hidden = false;
    internship.content.hidden = false;
    terminalReady.hidden = false;
    internship.section.append(terminalReady);
    // 回车声响起后才切屏：命令行顶到左上角，旧内容被推上去。
    setCurrentInternship(internship);
    scrollToSection(target);
    terminalWindow.classList.add("is-typing");

    for (let index = 0; index < internship.targets.length; index += 1) {
      if (version !== flowVersion) return;
      await revealBlocksBefore(internship, internship.targets[index], version);
      if (version !== flowVersion) return;
      internship.targets[index].after(typingCursor);
      await typeCharacters(internship.targets[index], internship.characters[index],
        (character) => {
          if (internship.followOutput) {
            const overflow = typingCursor.getBoundingClientRect().bottom - terminalScreen.getBoundingClientRect().bottom + 24;
            if (overflow > 0) terminalScreen.scrollTop += overflow;
          }
          return "，。！？；：".includes(character) ? 100 : 20 + Math.random() * 15;
        }, false, version);
      if (version !== flowVersion) return;
      if (index === 0 && internship.logo) {
        typingCursor.remove();
        await revealLogo(internship, version);
        if (version !== flowVersion) return;
        internship.targets[index + 1]?.after(typingCursor);
      }
      await wait(100, version);
    }

    if (version !== flowVersion) return;
    typingCursor.remove();
    await revealBlocksBefore(internship, null, version);
    if (version !== flowVersion) return;
    if (!noAnimation && (internship.gallery || internship.mediaItems.length)) {
      // 大文件还没到位时，借用启动页的 Loading 提示，避免长时间没有反馈。
      const loadingTimer = window.setTimeout(() => {
        if (version !== flowVersion) return;
        internship.content.append(bootActivity);
        bootActivity.hidden = false;
      }, 300);
      await waitForSectionAssets(internship.id);
      window.clearTimeout(loadingTimer);
      if (bootActivity.parentElement === internship.content) {
        bootActivity.hidden = true;
        catCommand.before(bootActivity);
      }
      if (version !== flowVersion) return;
    }
    if (internship.gallery) {
      internship.gallery.hidden = false;
      const imageSlots = [...internship.gallery.querySelectorAll(".intern-image-slot")];
      for (const imageSlot of imageSlots) {
        if (version !== flowVersion) return;
        if (internship.followOutput) {
          const overflow = imageSlot.getBoundingClientRect().bottom - terminalScreen.getBoundingClientRect().bottom + 20;
          if (overflow > 0) terminalScreen.scrollTop += overflow;
        }
        const openButton = imageSlot.querySelector(".intern-image-open, .intern-video-open");
        if (openButton) openButton.disabled = false;
        playImageRevealSound();
        imageSlot.classList.add("is-visible");
        playInlineVideo(imageSlot.querySelector("video"));
        await wait(330, version);
      }
    }
    if (internship.mediaItems.length) {
      const { mediaItems } = internship;
      mediaItems.forEach((media) => {
        media.hidden = false;
        media.style.removeProperty("max-width");
      });
      // 按可用高度缩放视频，避免自动滚动把上方正文顶出视口；并排的多个视频按同一高度缩放。
      if (internship.followOutput) {
        // 揭晓阶段提示符被 is-typing 隐藏，先临时恢复以便正确测量。
        terminalWindow.classList.remove("is-typing");
        const screenRect = terminalScreen.getBoundingClientRect();
        const promptOverflow = terminalReady.getBoundingClientRect().bottom - screenRect.bottom + 24;
        const allowedScroll = getCommandScrollRoom(internship, screenRect);
        // 与正文上下对齐的资源位不增加高度，只缩小超出正文底部的部分，避免破坏对齐。
        const mainBottom = internship.content.querySelector(".case-main")?.getBoundingClientRect().bottom ?? -Infinity;
        const mediaBottom = Math.max(...mediaItems.map((media) => media.getBoundingClientRect().bottom));
        const excess = Math.min(promptOverflow - allowedScroll, mediaBottom - mainBottom);
        terminalWindow.classList.add("is-typing");
        // 手机布局媒体按屏宽排布，不缩小，用户自行下滑查看。
        if (excess > 0 && !mobileLayout.matches && !internship.content.classList.contains("case-content-agent")) {
          // 试玩缩小后无法操作，保持原尺寸；拼图内各资源位比例互锁，单独缩小会错位。
          mediaItems.filter((media) => !media.querySelector("iframe") && !media.closest(".case-mosaic")).forEach((media) => {
            const rect = media.getBoundingClientRect();
            const height = Math.max(120, rect.height - excess);
            media.style.maxWidth = `${height * rect.width / rect.height}px`;
          });
        }
      }
      for (const media of mediaItems) {
        if (version !== flowVersion) return;
        playImageRevealSound();
        media.classList.add("is-visible");
        const openButton = media.querySelector(".intern-video-open, .intern-image-open");
        if (openButton) openButton.disabled = false;
        if (internship.followOutput) {
          const screenRect = terminalScreen.getBoundingClientRect();
          const overflow = media.getBoundingClientRect().bottom - screenRect.bottom + 20;
          if (overflow > 0) terminalScreen.scrollTop += limitFollowScroll(internship, overflow, screenRect);
        }
        playInlineVideo(media.querySelector("video"));
        loadFrames(media);
        await wait(330, version);
      }
      if (version !== flowVersion) return;
    }
    if (version !== flowVersion) return;
    internship.finished = true;
    terminalWindow.classList.remove("is-typing");
    restartTerminalCursorBlink();
    if (internship.followOutput) {
      const screenRect = terminalScreen.getBoundingClientRect();
      const overflow = terminalReady.getBoundingClientRect().bottom - screenRect.bottom + 24;
      if (overflow > 0) terminalScreen.scrollTop += limitFollowScroll(internship, overflow, screenRect);
    }
    navigationInProgress = false;
    updateContinueHint();
  };

  const typeAndExecuteSection = async (target, version, commandTop = null) => {
    const typed = await typeSectionCommand(target, version, commandTop);
    if (!typed || version !== flowVersion) return;
    await blinkCursor(350, true, version);
    if (version !== flowVersion) return;
    await executeSection(target, version);
  };

  const requestSection = async (target, immediate = false) => {
    const internship = getInternship(target);
    if (target !== "welcome" && !internship) return;
    const version = invalidateFlow();
    prepareSectionNavigation();
    currentSection = target;
    void loadSectionAssets(target);
    preloadNextSection();
    if (immediate) {
      navigationInProgress = true;
      completeWelcomeImmediately();
      const preceding = internship ? internships.slice(0, internships.indexOf(internship) + 1) : [];
      // 跳转只短暂等待目标板块本身；上方的旧板块排到后台加载，图片和视频有固定比例，加载完原位出现，不会挤动布局。
      preceding.forEach((item) => { if (item !== internship) void loadSectionAssets(item.id, PRIORITY.background); });
      if (internship) await waitForSectionAssets(internship.id, 1500);
      if (version !== flowVersion) return;
      preceding.forEach((item) => {
        item.section.hidden = false;
        item.command.hidden = false;
        item.command.classList.remove("is-prompting");
        item.commandText.textContent = item.commandCharacters.join("");
        item.content.hidden = false;
        item.targets.forEach((text, index) => { text.textContent = item.characters[index].join(""); });
        item.logo?.classList.add("is-visible");
        if (item.gallery) {
          item.gallery.hidden = false;
          item.gallery.querySelectorAll(".intern-image-slot").forEach((slot) => {
            slot.classList.add("is-visible");
            const button = slot.querySelector(".intern-image-open, .intern-video-open");
            if (button) button.disabled = false;
            playInlineVideo(slot.querySelector("video"));
          });
        }
        item.mediaItems.forEach((media) => {
          media.hidden = false;
          media.style.removeProperty("max-width");
          media.classList.add("is-visible");
          const button = media.querySelector(".intern-video-open, .intern-image-open");
          if (button) button.disabled = false;
          playInlineVideo(media.querySelector("video"));
          loadFrames(media);
        });
        item.reveals.forEach((block) => block.classList.add("is-visible"));
        item.section.classList.add("has-screen-padding");
        item.started = true;
        item.finished = true;
      });
      navigationInProgress = false;
    }
    const alreadyLoaded = internship ? internship.finished : welcomeFinished;
    if (alreadyLoaded) {
      terminalReady.hidden = false;
      if (internship) {
        internship.section.append(terminalReady);
        setCurrentInternship(internship);
      } else {
        welcomeContent.after(terminalReady);
        setCurrentInternship(null);
      }
      restartTerminalCursorBlink();
      terminalWindow.focus({ preventScroll: true });
      scrollToSection(target);
      updateContinueHint();
      return;
    }
    navigationInProgress = true;
    if (internship && !welcomeFinished) completeWelcomeImmediately();
    const commandTop = internship && !terminalReady.hidden
      ? terminalReady.getBoundingClientRect().top
      : null;
    terminalWindow.focus({ preventScroll: true });
    await typeAndExecuteSection(target, version, commandTop);
  };

  const startExperience = async () => {
    if (hasStarted) return;
    const version = flowVersion;
    revealTerminal();
    // 点击即用户手势：解锁音频（后面的键盘音效才能出声）并播放统一的点击音效。
    playImageRevealSound();
    preloadNextSection();
    // 等终端窗口从图标处展开完，直接输入 cat welcome.html。
    await wait(480, version);
    if (version !== flowVersion) return;
    await typeAndExecuteSection("welcome", version);
  };

  const startWelcomeDirectly = () => {
    if (hasStarted) return;
    revealTerminal();
    void requestSection("welcome");
  };

  // 图片/视频预览打开期间及关闭后片刻，点击、滚轮、回车都不触发下一板块：
  // 触屏上关闭预览的那次点按，可能在预览消失后落到下面的终端上。
  let mediaViewerClosedAt = -Infinity;
  const isMediaViewerActive = () => internImageViewer.open || internVideoViewer.open || performance.now() - mediaViewerClosedAt < 400;
  const playNextSection = () => {
    if (isMediaViewerActive()) return;
    const next = getNextInternship();
    if (!welcomeFinished || !next || navigationInProgress) return;
    prepareAudio();
    void requestSection(next.id);
  };

  let imageZoomScale = 1;
  let imageZoomX = 0;
  let imageZoomY = 0;
  let imagePointerGesture = null;
  const imageTouchPointers = new Map();
  let imagePinchGesture = null;
  const beginImagePinch = () => {
    const [first, second] = [...imageTouchPointers.values()];
    if (!second) { imagePinchGesture = null; return; }
    const rect = internImageViewerStage.getBoundingClientRect();
    imagePinchGesture = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      scale: imageZoomScale,
      x: ((first.x + second.x) / 2 - rect.left - imageZoomX) / imageZoomScale,
      y: ((first.y + second.y) / 2 - rect.top - imageZoomY) / imageZoomScale,
    };
  };
  let suppressViewerClick = false;
  let imageViewerClosing = false;
  let imageViewerCloseTimer = 0;
  let imageViewerToken = 0;
  let imageViewerCloseEndListener = null;
  const cancelImagePointerGesture = (event) => {
    if (event?.pointerId !== undefined && imagePointerGesture && event.pointerId !== imagePointerGesture.pointerId) return;
    imagePointerGesture = null;
    suppressViewerClick = false;
    internImageViewerStage.classList.remove("is-dragging");
  };
  const setImageZoomTransform = () => {
    internImageViewerStage.classList.toggle("is-zoomed", imageZoomScale > 1);
    // Resize the image's layout box instead of magnifying a cached compositor layer.
    internImageViewerImage.style.width = `${imageZoomScale * 100}%`;
    internImageViewerImage.style.height = `${imageZoomScale * 100}%`;
    internImageViewerImage.style.transform = `translate(${imageZoomX}px, ${imageZoomY}px)`;
  };
  const resetImageZoom = () => {
    cancelImagePointerGesture();
    imageTouchPointers.clear();
    imagePinchGesture = null;
    imageZoomScale = 1;
    imageZoomX = 0;
    imageZoomY = 0;
    setImageZoomTransform();
  };
  const clearImageViewerCloseAnimation = () => {
    window.clearTimeout(imageViewerCloseTimer);
    imageViewerCloseTimer = 0;
    if (imageViewerCloseEndListener) internImageViewer.removeEventListener("animationend", imageViewerCloseEndListener);
    imageViewerCloseEndListener = null;
    imageViewerClosing = false;
    internImageViewer.classList.remove("is-closing");
  };
  const finishImageViewerClose = () => {
    window.clearTimeout(imageViewerCloseTimer);
    imageViewerCloseTimer = 0;
    if (imageViewerCloseEndListener) internImageViewer.removeEventListener("animationend", imageViewerCloseEndListener);
    imageViewerCloseEndListener = null;
    if (internImageViewer.open) internImageViewer.close();
  };
  const closeImageViewer = () => {
    if (!internImageViewer.open || imageViewerClosing) return;
    if (document.documentElement.classList.contains("no-animation")) {
      internImageViewer.close();
      return;
    }
    imageViewerClosing = true;
    internImageViewer.classList.add("is-closing");
    imageViewerCloseEndListener = (event) => {
      if (event.target === internImageViewer && event.animationName === "intern-image-viewer-exit") finishImageViewerClose();
    };
    internImageViewer.addEventListener("animationend", imageViewerCloseEndListener);
    imageViewerCloseTimer = window.setTimeout(finishImageViewerClose, 260);
  };

  terminalScreen.addEventListener("click", (event) => {
    const openButton = event.target.closest(".intern-image-open");
    const image = openButton?.querySelector("img.is-active") || openButton?.querySelector("img");
    if (!image || openButton.disabled || typeof internImageViewer.showModal !== "function") return;
    // width/height 写的是原图尺寸，比例以它为准（内联可能是缩小的展示版本）。
    const width = Number(image.getAttribute("width")) || image.naturalWidth;
    const height = Number(image.getAttribute("height")) || image.naturalHeight;
    if (width && height) internImageViewer.style.setProperty("--image-ratio", String(width / height));
    // 先显示已解码的内联图，原图（data-full）下载并解码后再替换，打开时不会空白。
    const viewerToken = imageViewerToken += 1;
    internImageViewerImage.src = image.currentSrc || image.src;
    if (image.dataset.full) {
      const full = new Image();
      full.src = image.dataset.full;
      full.decode().then(() => {
        if (viewerToken === imageViewerToken && internImageViewer.open) internImageViewerImage.src = full.src;
      }).catch(() => {});
    }
    internImageViewerImage.alt = image.alt;
    clearImageViewerCloseAnimation();
    resetImageZoom();
    internImageViewer.showModal();
    playImageRevealSound();
  });
  terminalScreen.addEventListener("click", (event) => {
    const openButton = event.target.closest(".intern-video-open");
    if (!openButton || openButton.disabled) return;
    const video = openButton.querySelector("video");
    if (video) openVideoViewer(video);
    else if (openButton.closest(".case-playable")) openPlayableViewer(openButton.closest(".case-playable"));
  });
  // Safari may otherwise perform native page zoom alongside our pointer gestures.
  const preventNativeImageGesture = (event) => {
    if (event.type === "touchstart" && event.touches.length < 2) return;
    if (internImageViewer.open && event.cancelable) event.preventDefault();
  };
  for (const type of ["touchstart", "touchmove", "gesturestart", "gesturechange", "gestureend"]) {
    internImageViewer.addEventListener(type, preventNativeImageGesture, { passive: false });
  }
  internImageViewerStage.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (!event.deltaY) return;

    const nextScale = Math.max(1, Math.min(4, imageZoomScale * Math.exp(-event.deltaY * 0.0012)));
    if (nextScale === imageZoomScale) return;

    const stageRect = internImageViewerStage.getBoundingClientRect();
    const pointerX = event.clientX - stageRect.left;
    const pointerY = event.clientY - stageRect.top;
    const imagePointX = (pointerX - imageZoomX) / imageZoomScale;
    const imagePointY = (pointerY - imageZoomY) / imageZoomScale;
    imageZoomX = pointerX - imagePointX * nextScale;
    imageZoomY = pointerY - imagePointY * nextScale;
    imageZoomScale = nextScale;

    if (imageZoomScale === 1) {
      imageZoomX = 0;
      imageZoomY = 0;
    }
    setImageZoomTransform();
  }, { passive: false });
  internImageViewerStage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      if (imageTouchPointers.size === 0) suppressViewerClick = false;
      imageTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      internImageViewerStage.setPointerCapture(event.pointerId);
      if (imageTouchPointers.size >= 2) {
        imagePointerGesture = null;
        suppressViewerClick = true;
        beginImagePinch();
        return;
      }
    }
    if (imageZoomScale <= 1 || (event.pointerType !== "touch" && !event.isPrimary) || (event.pointerType === "mouse" && event.button !== 0)) return;
    const gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    imagePointerGesture = gesture;
    internImageViewerStage.classList.add("is-dragging");
    internImageViewerStage.setPointerCapture(gesture.pointerId);
  });
  internImageViewerStage.addEventListener("pointermove", (event) => {
    if (imageTouchPointers.has(event.pointerId)) {
      imageTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (imagePinchGesture && imageTouchPointers.size >= 2) {
        const [first, second] = [...imageTouchPointers.values()];
        const rect = internImageViewerStage.getBoundingClientRect();
        imageZoomScale = Math.max(1, Math.min(4, imagePinchGesture.scale * Math.hypot(second.x - first.x, second.y - first.y) / imagePinchGesture.distance));
        imageZoomX = (first.x + second.x) / 2 - rect.left - imagePinchGesture.x * imageZoomScale;
        imageZoomY = (first.y + second.y) / 2 - rect.top - imagePinchGesture.y * imageZoomScale;
        if (imageZoomScale === 1) imageZoomX = imageZoomY = 0;
        setImageZoomTransform();
        event.preventDefault();
        return;
      }
    }
    const gesture = imagePointerGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const stageRect = internImageViewerStage.getBoundingClientRect();
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4) gesture.moved = true;
    imageZoomX = Math.max(stageRect.width * (1 - imageZoomScale), Math.min(0, imageZoomX + event.clientX - gesture.lastX));
    imageZoomY = Math.max(stageRect.height * (1 - imageZoomScale), Math.min(0, imageZoomY + event.clientY - gesture.lastY));
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    setImageZoomTransform();
    event.preventDefault();
  });
  const finishImageTouch = (event) => {
    if (!imageTouchPointers.delete(event.pointerId)) return;
    imagePinchGesture = null;
    imagePointerGesture = null;
    internImageViewerStage.classList.remove("is-dragging");
    if (imageTouchPointers.size >= 2) beginImagePinch();
    else if (imageTouchPointers.size === 1) {
      const [pointerId, point] = [...imageTouchPointers.entries()][0];
      imagePointerGesture = { pointerId, startX: point.x, startY: point.y, lastX: point.x, lastY: point.y, moved: true };
    }
  };
  internImageViewerStage.addEventListener("pointerup", (event) => {
    if (imagePointerGesture?.moved) suppressViewerClick = true;
    finishImageTouch(event);
    const gesture = imagePointerGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.moved) suppressViewerClick = true;
    imagePointerGesture = null;
    internImageViewerStage.classList.remove("is-dragging");
  });
  internImageViewerStage.addEventListener("pointercancel", (event) => {
    const wasGesture = Boolean(imagePinchGesture) || imageTouchPointers.size >= 2 || Boolean(imagePointerGesture?.moved);
    finishImageTouch(event);
    cancelImagePointerGesture(event);
    if (wasGesture) suppressViewerClick = true;
  });
  internImageViewer.addEventListener("click", (event) => {
    if (suppressViewerClick) {
      suppressViewerClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    closeImageViewer();
  });
  internImageViewer.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeImageViewer();
  });
  internImageViewer.addEventListener("close", (event) => {
    mediaViewerClosedAt = performance.now();
    clearImageViewerCloseAnimation();
    resetImageZoom();
  });
  window.addEventListener("resize", () => {
    if (internImageViewer.open) resetImageZoom();
  });
  // 揭晓时按当时可用高度缩小的媒体（内联 max-width），窗口尺寸变化或旋转后恢复自然尺寸，不沿用旧视口的结果。
  let viewportSize = `${window.innerWidth}x${window.innerHeight}`;
  window.addEventListener("resize", () => {
    const size = `${window.innerWidth}x${window.innerHeight}`;
    if (size === viewportSize) return;
    viewportSize = size;
    internships.forEach((item) => {
      if (item.finished) item.mediaItems.forEach((media) => media.style.removeProperty("max-width"));
    });
  });

  let activeInlineVideo = null;
  let inlineVideoHome = null;
  let videoControlsEvents = null;
  const videoControls = document.querySelector("#video-viewer-controls");
  const videoToggle = document.querySelector("#video-viewer-toggle");
  const videoProgress = document.querySelector("#video-viewer-progress");
  let scrubPointerId = null;
  let resumeAfterScrub = false;
  let pendingSeekTime = null;
  let scrubEndedAt = -Infinity;
  const formatVideoTime = (seconds) => {
    const total = Math.floor(Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };
  const syncVideoControls = () => {
    const video = activeInlineVideo;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    videoProgress.disabled = duration <= 0;
    videoProgress.max = String(duration);
    // 待跳转值只在真正 seeking 时保留；失败或被浏览器校正后显示实际播放位置。
    if (!video.seeking) pendingSeekTime = null;
    // 拖动时由滑块自己持有数值；异步 seek 完成前也不写回旧播放时间。
    if (scrubPointerId === null) videoProgress.value = String(pendingSeekTime ?? video.currentTime);
    const current = formatVideoTime(Number(videoProgress.value));
    const total = formatVideoTime(duration);
    videoProgress.setAttribute("aria-valuetext", `${current} / ${total}`);
    videoToggle.dataset.paused = String(video.paused);
    videoToggle.setAttribute("aria-label", video.paused ? "播放视频" : "暂停视频");
  };
  const toggleViewerVideo = () => {
    if (!activeInlineVideo || scrubPointerId !== null || performance.now() - scrubEndedAt < 250) return;
    if (activeInlineVideo.paused) playMedia(activeInlineVideo);
    else activeInlineVideo.pause();
    syncVideoControls();
  };
  videoToggle.addEventListener("click", toggleViewerVideo);
  const seekViewerVideo = () => {
    if (!activeInlineVideo || videoProgress.disabled) return;
    pendingSeekTime = Number(videoProgress.value);
    activeInlineVideo.currentTime = pendingSeekTime;
    syncVideoControls();
  };
  videoProgress.addEventListener("input", seekViewerVideo);
  videoProgress.addEventListener("pointerdown", (event) => {
    if (!activeInlineVideo || videoProgress.disabled || event.button !== 0 || scrubPointerId !== null) return;
    scrubPointerId = event.pointerId;
    resumeAfterScrub = !activeInlineVideo.paused;
    activeInlineVideo.pause();
    videoProgress.setPointerCapture(event.pointerId);
  });
  const finishVideoScrub = (event) => {
    if (scrubPointerId === null || event.pointerId !== scrubPointerId) return;
    const pointerId = scrubPointerId;
    scrubPointerId = null;
    scrubEndedAt = performance.now();
    const shouldResume = resumeAfterScrub;
    resumeAfterScrub = false;
    seekViewerVideo();
    if (videoProgress.hasPointerCapture(pointerId)) videoProgress.releasePointerCapture(pointerId);
    if (shouldResume && activeInlineVideo) playMedia(activeInlineVideo);
    syncVideoControls();
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    videoProgress.addEventListener(type, finishVideoScrub);
  }
  internVideoViewer.addEventListener("keydown", (event) => {
    if (!activeInlineVideo || event.target.closest("button, input") || ![" ", "Enter"].includes(event.key)) return;
    event.preventDefault();
    toggleViewerVideo();
  });
  const openVideoViewer = (inlineVideo) => {
    if (!inlineVideo || typeof internVideoViewer.showModal !== "function") return;
    activeInlineVideo = inlineVideo;
    // 直接复用内联的那个 video 元素，已缓冲的数据不会丢；弹窗里从头开始播放。
    inlineVideoHome = inlineVideo.parentElement;
    inlineVideo.currentTime = 0;
    inlineVideo.muted = false;
    inlineVideo.controls = false;
    inlineVideo.removeAttribute("aria-hidden");
    inlineVideo.setAttribute("tabindex", "0");
    inlineVideo.setAttribute("aria-label", inlineVideo.dataset.label || "视频");
    const width = inlineVideo.videoWidth || Number(inlineVideo.getAttribute("width"));
    const height = inlineVideo.videoHeight || Number(inlineVideo.getAttribute("height"));
    if (width && height) internVideoViewer.style.setProperty("--video-ratio", String(width / height));
    internVideoViewerStage.append(inlineVideo);
    videoControlsEvents = new AbortController();
    inlineVideo.addEventListener("seeked", () => {
      if (!inlineVideo.seeking) pendingSeekTime = null;
      syncVideoControls();
    }, { signal: videoControlsEvents.signal });
    for (const type of ["timeupdate", "durationchange", "loadedmetadata", "play", "pause", "ended", "seeking"]) {
      inlineVideo.addEventListener(type, syncVideoControls, { signal: videoControlsEvents.signal });
    }
    videoControls.hidden = false;
    videoToggle.hidden = false;
    syncVideoControls();
    internVideoViewer.showModal();
    playImageRevealSound();
    playMedia(inlineVideo);
  };
  // 弹窗里从头加载一份完整帧率的试玩；内联预览只暂停不卸载，关闭弹窗后无需重新加载。
  let activePlayable = null;
  let playableViewerFrame = null;
  let playableViewerTimer = 0;
  const openPlayableViewer = (media) => {
    const inlineFrame = media.querySelector("iframe");
    const src = (inlineFrame?.dataset.src || inlineFrame?.getAttribute("src") || "").replace(/\?preview$/, "");
    if (!src || src === "about:blank" || typeof internVideoViewer.showModal !== "function") return;
    activePlayable = media;
    const state = playables.get(media);
    if (state) state.covered = true;
    syncPlayable(media);
    const frame = document.createElement("iframe");
    frame.title = inlineFrame.title;
    frame.setAttribute("sandbox", "allow-scripts");
    // 打开弹窗的点击把自动播放权限交给试玩，BGM 可直接响起；被拦截时试玩在首次触摸后再开始。
    frame.setAttribute("allow", "autoplay");
    playableViewerFrame = frame;
    internVideoViewer.style.setProperty("--video-ratio", String(9 / 16));
    internVideoViewer.setAttribute("aria-label", "试玩");
    internVideoViewerStage.append(frame);
    internVideoViewer.showModal();
    playImageRevealSound();
    // 等弹窗展开动画结束再加载，加载占用不会让动画掉帧；试玩自带加载封面。
    playableViewerTimer = window.setTimeout(() => {
      frame.src = src;
      frame.focus();
    }, noAnimation ? 0 : 300);
  };
  // 沙箱试玩内的 Escape 由试玩页转发过来。
  window.addEventListener("message", (event) => {
    if (event.data?.playable === "escape" && playableViewerFrame && event.source === playableViewerFrame.contentWindow) closeVideoViewer();
  });
  const closeVideoViewer = () => {
    if (internVideoViewer.open) internVideoViewer.close();
  };
  // 控件操作不关闭弹窗；点击画面切换播放，点击画面外区域关闭。
  internVideoViewer.addEventListener("click", (event) => {
    if (event.target.closest(".video-viewer-controls, .video-viewer-toggle")) return;
    // 拖动释放可能落在画面/背景上，不应切换播放或关闭弹窗。
    if (scrubPointerId !== null || performance.now() - scrubEndedAt < 250) return;
    if (event.target.closest("video")) toggleViewerVideo();
    else closeVideoViewer();
  });
  internVideoViewer.addEventListener("close", () => {
    mediaViewerClosedAt = performance.now();
    if (activePlayable) {
      window.clearTimeout(playableViewerTimer);
      playableViewerFrame?.remove();
      playableViewerFrame = null;
      internVideoViewer.setAttribute("aria-label", "视频播放");
      const state = playables.get(activePlayable);
      if (state) state.covered = false;
      syncPlayable(activePlayable);
      activePlayable = null;
    }
    videoControlsEvents?.abort();
    videoControlsEvents = null;
    videoControls.hidden = true;
    videoToggle.hidden = true;
    const pointerId = scrubPointerId;
    scrubPointerId = null;
    resumeAfterScrub = false;
    pendingSeekTime = null;
    scrubEndedAt = -Infinity;
    if (pointerId !== null && videoProgress.hasPointerCapture(pointerId)) videoProgress.releasePointerCapture(pointerId);
    const video = activeInlineVideo;
    activeInlineVideo = null;
    if (!video) return;
    video.pause();
    video.muted = true;
    video.controls = false;
    video.setAttribute("aria-hidden", "true");
    video.setAttribute("tabindex", "-1");
    video.removeAttribute("aria-label");
    if (inlineVideoHome) inlineVideoHome.append(video);
    inlineVideoHome = null;
    playInlineVideo(video);
  });

  let pointerStart = null;
  let pointerMoved = false;
  terminalScreen.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    pointerMoved = false;
  });
  terminalScreen.addEventListener("pointermove", (event) => {
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 10) pointerMoved = true;
  });
  terminalScreen.addEventListener("pointercancel", () => {
    pointerStart = null;
    pointerMoved = true;
  });
  terminalScreen.addEventListener("click", (event) => {
    // 按下也必须发生在终端内；按下在预览弹窗上、松开后落到终端的点击不算。
    if (pointerStart && !event.target.closest("button, input, a") && !pointerMoved) playNextSection();
    pointerStart = null;
  });
  // 输入/揭晓阶段屏幕禁止滚动（is-typing），此时的滑动、带位移的点按或上滚并没有真正回看，
  // 不能关闭自动跟随，否则后面打出的正文和媒体会落在屏幕外且无法滚动查看。
  const isScreenLocked = () => terminalWindow.classList.contains("is-typing");
  terminalScreen.addEventListener("touchmove", () => {
    const internship = getInternship(currentSection);
    if (internship?.started && !isScreenLocked()) internship.followOutput = false;
  }, { passive: true });
  terminalWindow.addEventListener("wheel", (event) => {
    if (!settingsMenu.hidden) return;
    const internship = getInternship(currentSection);
    if (event.deltaY < 0 && internship?.started && !isScreenLocked()) internship.followOutput = false;
    const atBottom = terminalScreen.scrollHeight - terminalScreen.clientHeight - terminalScreen.scrollTop <= 2;
    if (event.deltaY > 0 && !event.ctrlKey && atBottom) playNextSection();
  }, { passive: true });
  settingsMenu.querySelectorAll("[data-section-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.sectionTarget;
      closeSettingsMenu();
      terminalWindow.focus({ preventScroll: true });
      void requestSection(target, true);
    });
  });
  terminalWindow.addEventListener("keydown", (event) => {
    if (event.target.closest("button, input, a")) return;
    const next = getNextInternship();
    if (["Enter", " "].includes(event.key) && welcomeFinished && next && !navigationInProgress) {
      event.preventDefault();
      playNextSection();
    }
  });

  const startFromLaunchScreen = () => {
    if (!hasStarted) void startExperience();
  };
  syncCaseMediaWidth(internships);
  startMediaRotators((rotator) => internships.some((item) => item.finished && item.section.contains(rotator)));
  terminalPage.addEventListener("click", startFromLaunchScreen);
  document.documentElement.classList.remove("js-loading");
  document.documentElement.classList.add("js-ready");
  // The local server injects this bridge; production has no dev client or saved state.
  const devPreview = window.__finjixDevPreview;
  if (devPreview) {
    devPreview.capture = () => {
      const screenTop = terminalScreen.getBoundingClientRect().top;
      const visible = [welcomeContent, ...internships.map((item) => item.section)]
        .filter((element) => !element.hidden);
      const anchor = visible.find((element) => element.getBoundingClientRect().bottom > screenTop);
      return {
        started: hasStarted,
        currentSection,
        scrollTop: terminalScreen.scrollTop,
        anchor: anchor ? { id: anchor.id, top: anchor.getBoundingClientRect().top - screenTop } : null,
        sections: internships.filter((item) => !item.section.hidden).map((item) => ({
          id: item.id,
          classes: ["has-screen-padding", "is-current-screen", "is-screen-reserved"]
            .filter((name) => item.section.classList.contains(name)),
          gap: item.section.style.getPropertyValue("--reserved-gap"),
          mediaWidths: item.mediaItems.map((media) => media.style.maxWidth),
        })),
      };
    };
    const restore = async (state) => {
      if (!state.started) return;
      revealTerminal();
      const sections = state.sections.filter((item) => getInternship(item.id));
      const last = sections.at(-1)?.id || "welcome";
      await requestSection(last, true);
      const target = state.currentSection === "welcome" || getInternship(state.currentSection)
        ? state.currentSection : last;
      if (target !== last) await requestSection(target, true);
      sections.forEach((saved) => {
        const item = getInternship(saved.id);
        ["has-screen-padding", "is-current-screen", "is-screen-reserved"].forEach((name) => {
          item.section.classList.toggle(name, saved.classes.includes(name));
        });
        item.section.style.setProperty("--reserved-gap", saved.gap);
        item.mediaItems.forEach((media, index) => { media.style.maxWidth = saved.mediaWidths[index] || ""; });
      });
      await document.fonts?.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      terminalScreen.scrollTop = state.scrollTop;
      const anchor = state.anchor && document.getElementById(state.anchor.id);
      if (anchor && !anchor.hidden) {
        terminalScreen.scrollTop += anchor.getBoundingClientRect().top
          - terminalScreen.getBoundingClientRect().top - state.anchor.top;
      }
    };
    if (devPreview.restore) {
      void restore(devPreview.restore).catch((error) => {
        console.warn("[preview] Could not fully restore page state", error);
      }).finally(() => devPreview.restoringStyle?.remove());
    } else if (skipPowerStart) startWelcomeDirectly();
  } else if (skipPowerStart) startWelcomeDirectly();
}

// 同一资源位轮播多张配图：每 2.5s 切换一次，前一张逆向收起后再展开下一张。
// 所在板块的打字与揭晓动画全部结束（isReady）后才开始计时，板块被重置后重新等待。
function startMediaRotators(isReady) {
  document.querySelectorAll(".media-rotator").forEach((rotator) => {
    const images = [...rotator.querySelectorAll("img")];
    const frame = rotator.querySelector(".intern-image-open");
    if (images.length < 2 || !frame) return;
    let index = 0;
    let lastSwitch = null;
    window.setInterval(() => {
      if (rotator.hidden || !rotator.classList.contains("is-visible") || !isReady(rotator)) {
        lastSwitch = null;
        return;
      }
      const now = performance.now();
      if (lastSwitch === null) lastSwitch = now;
      if (document.hidden || now - lastSwitch < 2500) return;
      lastSwitch = now;
      frame.classList.remove("is-revealing");
      frame.classList.add("is-hiding");
      window.setTimeout(() => {
        images[index].classList.remove("is-active");
        index = (index + 1) % images.length;
        images[index].classList.add("is-active");
        frame.classList.remove("is-hiding");
        frame.classList.add("is-revealing");
      }, 330);
    }, 250);
  });
}

// 为对齐两栏而缩小正文的下限，低于它字号难以阅读。
const MIN_CASE_TEXT_SCALE = .9;

// 资源位高度由左侧正文决定（CSS 拉伸），按 9:16（横版配图 16:9）反推列宽，避免横向溢出覆盖正文。
// 正文逐字打出、资源位稍后才出现，列宽若跟随实时内容变化会挤动正文；因此用填满全文、显示全部资源位的离屏副本预先算定列宽。
function syncCaseMediaWidth(internships) {
  const desktop = window.matchMedia("(min-width: 701px)");
  const contents = [...document.querySelectorAll(".case-content")];
  const fullTexts = new Map(internships.map((internship) => [internship.content, internship.characters.map((characters) => characters.join(""))]));
  const measuredWidths = new WeakMap();
  const retryTimers = new WeakMap();
  const update = (content) => {
    const grid = content.querySelector(".case-video-grid");
    if (!grid || !desktop.matches) {
      measuredWidths.delete(content);
      content.style.removeProperty("--case-text-scale");
      return content.style.removeProperty("--case-media-width");
    }
    const count = grid.querySelectorAll(".intern-media").length;
    const contentWidth = content.getBoundingClientRect().width;
    if (!count || !contentWidth) return;
    // 终端窗口展开动画（scale）期间 getBoundingClientRect 是缩放后的尺寸，按它算出的列宽会锁成极小值，
    // 且动画结束时布局尺寸不变、ResizeObserver 不会再触发；等动画结束再测。
    if (Math.abs(contentWidth - content.offsetWidth) > 1) {
      measuredWidths.delete(content);
      window.clearTimeout(retryTimers.get(content));
      retryTimers.set(content, window.setTimeout(() => update(content), 120));
      return;
    }
    measuredWidths.set(content, contentWidth);
    const probe = content.cloneNode(true);
    probe.removeAttribute("id");
    probe.querySelectorAll(".typing-cursor, .boot-activity").forEach((element) => element.remove());
    probe.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    const texts = fullTexts.get(content) || [];
    probe.querySelectorAll("[data-intern-typewriter]").forEach((target, index) => { target.textContent = texts[index] ?? target.textContent; });
    probe.querySelectorAll(".case-video-grid .intern-media").forEach((media) => { media.hidden = false; });
    probe.setAttribute("aria-hidden", "true");
    probe.inert = true;
    Object.assign(probe.style, { position: "absolute", visibility: "hidden", pointerEvents: "none", width: `${contentWidth}px` });
    probe.style.setProperty("--case-media-count", count);
    probe.style.removeProperty("--case-text-scale");
    content.after(probe);
    const probeGrid = probe.querySelector(".case-video-grid");
    if (content.classList.contains("case-content-agent")) {
      // 正文字号不变；调整右栏图片宽度，使图片底部与左侧正文（含指标）底部对齐。
      const main = probe.querySelector(".case-main");
      const picture = probeGrid.querySelector(".intern-media");
      const apply = (target, width) => target.style.setProperty("--case-media-width", `${width}px`);
      // 正文高度随右栏变宽按行跳变，二者不单调，二分会落空；从窄到宽扫描（先粗后细），取图片首次超出正文前的宽度。右栏最宽占一半。
      const fits = (width) => { apply(probe, width); return picture.getBoundingClientRect().height <= main.getBoundingClientRect().height; };
      let best = contentWidth * .1;
      while (best + 16 <= contentWidth * .5 && fits(best + 16)) best += 16;
      while (best + 1 <= contentWidth * .5 && fits(best + 1)) best += 1;
      // 右栏已到一半仍明显矮于正文（窄屏或放大浏览器）：等比缩小正文，取仍不矮于图片的最小比例，使两侧底部对齐。
      // 缩放不低于 MIN_CASE_TEXT_SCALE；到下限仍高于配图时保留可读字号、只保证顶部对齐，
      // 右栏回到默认的 42%，把宽度留给正文。
      let textScale = 1;
      if (best + 1 > contentWidth * .5 && fits(best)) {
        probe.style.setProperty("--case-text-scale", MIN_CASE_TEXT_SCALE);
        if (fits(best)) {
          textScale = MIN_CASE_TEXT_SCALE;
          best = Math.min(best, contentWidth * .42);
        } else {
          let low = MIN_CASE_TEXT_SCALE, high = 1;
          for (let attempt = 0; attempt < 10; attempt += 1) {
            const scale = (low + high) / 2;
            probe.style.setProperty("--case-text-scale", scale);
            if (fits(best)) high = scale;
            else low = scale;
          }
          textScale = Math.ceil(high * 1000) / 1000;
          probe.style.setProperty("--case-text-scale", textScale);
        }
      }
      if (textScale < 1) content.style.setProperty("--case-text-scale", textScale);
      else content.style.removeProperty("--case-text-scale");
      apply(content, best);
      probe.remove();
      return;
    }
    const gap = parseFloat(getComputedStyle(probeGrid).columnGap) || 0;
    probe.querySelectorAll(".case-video-grid .intern-media").forEach((media) => media.style.removeProperty("max-width"));
    // 拼图资源位内部比例固定，整体当作一个横版资源位，按实测宽高比计算列宽。
    const mosaic = probeGrid.querySelector(".case-mosaic");
    const mosaicRect = mosaic?.getBoundingClientRect();
    const wide = Boolean(mosaic) || content.classList.contains("case-content-wide");
    const ratio = mosaic ? mosaicRect.width / mosaicRect.height : wide ? 16 / 9 : 9 / 16;
    const cap = wide ? 52 : 56;
    const units = mosaic ? 1 : count;
    const firstMedia = mosaic || probeGrid.querySelector(".intern-media");
    const reachesBottom = () => firstMedia.getBoundingClientRect().height >= probeGrid.clientHeight - .5;
    // 列宽与正文高度互相影响，迭代到稳定。
    let next = probe.style.getPropertyValue("--case-media-width");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const width = Math.ceil(units * probeGrid.clientHeight * ratio + (units - 1) * gap);
      const candidate = `min(${cap}%, ${width}px)`;
      if (candidate === next) break;
      next = candidate;
      probe.style.setProperty("--case-media-width", next);
    }
    // 右栏到达上限仍矮于正文（窄屏或放大浏览器）时，加宽右栏只会让正文更高；改为等比缩小正文，使两侧上下边对齐。
    // 右栏固定为上限宽度（资源位按高度取宽、靠右）：若再收窄右栏，正文变宽少一行，资源位随之变窄，会连锁缩小。
    // 缩放不低于 MIN_CASE_TEXT_SCALE；到下限仍够不到底部时资源位占满右栏、只对齐顶部。
    let textScale = 1;
    if (!reachesBottom()) {
      next = `${cap}%`;
      probe.style.setProperty("--case-media-width", next);
      let low = MIN_CASE_TEXT_SCALE, high = 1;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const scale = (low + high) / 2;
        probe.style.setProperty("--case-text-scale", scale);
        if (reachesBottom()) low = scale;
        else high = scale;
      }
      textScale = Math.floor(low * 1000) / 1000;
    }
    if (textScale < 1) content.style.setProperty("--case-text-scale", textScale);
    else content.style.removeProperty("--case-text-scale");
    probe.remove();
    content.style.setProperty("--case-media-count", count);
    if (content.style.getPropertyValue("--case-media-width") !== next) content.style.setProperty("--case-media-width", next);
  };
  // 只在板块宽度变化时重算（显示、窗口缩放），打字与资源位揭晓过程中列宽保持不变。
  // 板块首次显示时立即测量，打字开始前定好列宽；之后的宽度变化（拖拽窗口）在停止缩放后合并重算，
  // 每次测量要克隆板块并多次强制布局，逐帧执行会让拖拽卡顿。
  const pendingUpdates = new Set();
  let pendingTimer = 0;
  const observer = new ResizeObserver((entries) => entries.forEach(({ target }) => {
    const width = target.getBoundingClientRect().width;
    if (!width) {
      measuredWidths.delete(target);
      pendingUpdates.delete(target);
      return;
    }
    if (width === measuredWidths.get(target)) return;
    if (!measuredWidths.has(target)) {
      update(target);
      return;
    }
    pendingUpdates.add(target);
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => {
      pendingUpdates.forEach(update);
      pendingUpdates.clear();
    }, 150);
  }));
  contents.forEach((content) => observer.observe(content));
  desktop.addEventListener("change", () => contents.forEach(update));
  window.addEventListener("finjix:styles-updated", () => contents.forEach(update));
  document.fonts?.ready.then(() => contents.forEach(update));
}
