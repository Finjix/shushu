// iOS Safari may ignore the viewport zoom restriction for pinch gestures.
for (const eventName of ["gesturestart", "gesturechange"]) {
  document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
}

const terminalPage = document.querySelector(".terminal-page");
const powerStart = document.querySelector("#power-start");
const terminalWindow = document.querySelector("#terminal-window");
const bootLog = document.querySelector("#boot-log");
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
  media: section.querySelector(".intern-media"),
  video: section.querySelector(".intern-media video"),
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

if (terminalPage && powerStart && terminalWindow && bootLog && bootActivity && catCommand && terminalPrompt && catText && welcomeContent && welcomeText && typingCursor && terminalReady && terminalCursor && internships.length && internships.every((internship) => internship.id && internship.command && internship.commandText && internship.content) && internImageViewer && internImageViewerStage && internImageViewerImage && internVideoViewer && internVideoViewerStage && terminalScreen && settingsMenuToggle && settingsMenu && animationToggle && startupPageToggle && scrollHint) {
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
  const getInternship = (target) => internships.find((internship) => internship.id === target);
  const getNextInternship = () => {
    const currentIndex = internships.findIndex((internship) => internship.id === currentSection);
    return internships.slice(currentIndex + 1).find((internship) => !internship.started);
  };
  const updateContinueHint = () => {
    scrollHint.hidden = !welcomeFinished || navigationInProgress || !getNextInternship();
  };
  const imageLoadPromises = new Map();
  const videoLoadPromises = new Map();
  const sectionAssetPromises = new Map();
  const loadImage = (image) => {
    if (!imageLoadPromises.has(image)) {
      imageLoadPromises.set(image, new Promise((resolve) => {
        const finish = () => resolve(image);
        image.addEventListener("error", finish, { once: true });
        image.addEventListener("load", () => {
          if (typeof image.decode === "function") image.decode().then(finish).catch(finish);
          else finish();
        }, { once: true });
        image.src = image.dataset.src;
        image.removeAttribute("data-src");
      }));
    }
    return imageLoadPromises.get(image);
  };
  const loadVideo = (video) => {
    if (!videoLoadPromises.has(video)) {
      videoLoadPromises.set(video, new Promise((resolve) => {
        const finish = () => resolve(video);
        video.addEventListener("error", finish, { once: true });
        video.addEventListener("loadeddata", finish, { once: true });
        video.src = video.dataset.src;
        video.removeAttribute("data-src");
      }));
    }
    return videoLoadPromises.get(video);
  };
  const playMedia = (media) => {
    if (!media) return;
    const playback = media.play();
    if (playback?.catch) playback.catch(() => {});
  };
  const loadSectionAssets = (target) => {
    if (!sectionAssetPromises.has(target)) {
      const internship = getInternship(target);
      const images = internship ? [...internship.content.querySelectorAll("img[data-src]")] : [];
      const videos = internship ? [...internship.content.querySelectorAll("video[data-src]")] : [];
      sectionAssetPromises.set(target, Promise.all([...images.map(loadImage), ...videos.map(loadVideo)]));
    }
    return sectionAssetPromises.get(target);
  };
  // 浏览当前模块时预取下一模块的图片，避免首屏一次加载全部资源。
  const preloadNextSection = () => {
    const next = getNextInternship();
    if (next) void loadSectionAssets(next.id);
  };
  const waitForSectionAssets = (target, timeout = 5000) => Promise.race([
    loadSectionAssets(target),
    new Promise((resolve) => window.setTimeout(resolve, timeout)),
  ]);
  const bootMessages = [
    { progress: 0.25, message: "Initializing hardware" },
    { progress: 0.5, message: "Loading system" },
    { progress: 0.75, message: "Starting session" },
  ];
  const bootToneFrequencies = [440, 493.88, 554.37, 659.25];
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
    if (opening) animationToggle.focus();
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

  const playStartupChime = () => {
    if (!prepareAudio()) return;

    const playNotes = () => {
      if (noAnimation || audioContext.state !== "running") return;
      const notes = [
        { frequency: 523.25, offset: 0 },
        { frequency: 659.25, offset: 0.13 },
      ];

      notes.forEach(({ frequency, offset }) => {
        const startTime = audioContext.currentTime + offset;
        const envelope = audioContext.createGain();
        const fundamental = audioContext.createOscillator();
        const overtone = audioContext.createOscillator();
        const overtoneVolume = audioContext.createGain();

        fundamental.type = "sine";
        fundamental.frequency.setValueAtTime(frequency, startTime);
        overtone.type = "sine";
        overtone.frequency.setValueAtTime(frequency * 2.01, startTime);
        overtoneVolume.gain.setValueAtTime(0.08, startTime);
        envelope.gain.setValueAtTime(0.0001, startTime);
        envelope.gain.exponentialRampToValueAtTime(0.42, startTime + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.48);

        fundamental.connect(envelope);
        overtone.connect(overtoneVolume);
        overtoneVolume.connect(envelope);
        envelope.connect(masterVolume);
        fundamental.start(startTime);
        overtone.start(startTime);
        fundamental.stop(startTime + 0.49);
        overtone.stop(startTime + 0.49);
      });

    };

    if (audioContext.state === "running") {
      playNotes();
    } else {
      // A blocked resume should not permanently close audio for later gestures.
      audioContext.resume().then(playNotes).catch(() => {});
    }
  };

  const playBootTone = (frequency) => {
    if (noAnimation || !audioContext || audioContext.state !== "running" || !masterVolume) return;

    const startTime = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.exponentialRampToValueAtTime(0.2, startTime + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.14);
    oscillator.connect(envelope);
    envelope.connect(masterVolume);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.15);
  };

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

  const playBootSequenceTone = (toneIndex) => {
    playBootTone(bootToneFrequencies[toneIndex]);
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

  const runBootAnimation = (duration, version = flowVersion) => new Promise((resolve) => {
    if (noAnimation || version !== flowVersion) return resolve();
    const startedAt = window.performance.now();
    let nextMessage = 0;
    let frame;
    const finish = () => {
      window.cancelAnimationFrame(frame);
      pendingAnimations.delete(finish);
      resolve();
    };
    pendingAnimations.add(finish);

    const update = (now) => {
      if (version !== flowVersion) return finish();
      const progress = Math.min((now - startedAt) / duration, 1);
      while (nextMessage < bootMessages.length && progress >= bootMessages[nextMessage].progress) {
        const line = document.createElement("p");
        const status = document.createElement("span");
        line.className = "boot-log-line";
        status.className = "boot-status";
        status.textContent = "[  OK  ]";
        line.append(status, document.createTextNode(` ${bootMessages[nextMessage].message}`));
        bootLog.append(line);
        playBootSequenceTone(nextMessage);
        nextMessage += 1;
      }

      if (progress < 1) {
        frame = window.requestAnimationFrame(update);
      } else {
        finish();
      }
    };

    frame = window.requestAnimationFrame(update);
  });

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
    powerStart.disabled = true;
    powerStart.setAttribute("aria-hidden", "true");
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
      const openButton = imageSlot.querySelector(".intern-image-open");
      if (openButton) openButton.disabled = true;
    });
    if (internship.media) {
      internship.media.hidden = true;
      internship.media.classList.remove("is-visible");
      internship.media.style.removeProperty("max-width");
      const openButton = internship.media.querySelector(".intern-video-open");
      if (openButton) openButton.disabled = true;
    }
    if (internship.video) {
      internship.video.pause();
      if (internship.video.readyState > 0) internship.video.currentTime = 0;
    }
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
    bootLog.replaceChildren();
    bootLog.hidden = true;
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
    if (!noAnimation && (internship.gallery || internship.media)) {
      await waitForSectionAssets(internship.id);
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
        const openButton = imageSlot.querySelector(".intern-image-open");
        if (openButton) openButton.disabled = false;
        playImageRevealSound();
        imageSlot.classList.add("is-visible");
        await wait(330, version);
      }
    }
    if (internship.media) {
      internship.media.hidden = false;
      // 按可用高度缩放视频，避免自动滚动把上方正文顶出视口。
      internship.media.style.removeProperty("max-width");
      if (internship.followOutput) {
        // 揭晓阶段提示符被 is-typing 隐藏，先临时恢复以便正确测量。
        terminalWindow.classList.remove("is-typing");
        const screenRect = terminalScreen.getBoundingClientRect();
        const promptOverflow = terminalReady.getBoundingClientRect().bottom - screenRect.bottom + 24;
        const allowedScroll = getCommandScrollRoom(internship, screenRect);
        const excess = promptOverflow - allowedScroll;
        terminalWindow.classList.add("is-typing");
        if (excess > 0) {
          const naturalHeight = internship.media.getBoundingClientRect().height;
          const height = Math.max(120, naturalHeight - excess);
          internship.media.style.maxWidth = `${height * 1.125}px`;
        }
      }
      internship.media.classList.add("is-visible");
      const openButton = internship.media.querySelector(".intern-video-open");
      if (openButton) openButton.disabled = false;
      if (internship.followOutput) {
        const screenRect = terminalScreen.getBoundingClientRect();
        const overflow = internship.media.getBoundingClientRect().bottom - screenRect.bottom + 20;
        if (overflow > 0) terminalScreen.scrollTop += Math.min(overflow, Math.max(0, getCommandScrollRoom(internship, screenRect)));
      }
      playMedia(internship.video);
      await wait(330, version);
      if (version !== flowVersion) return;
    }
    if (version !== flowVersion) return;
    internship.finished = true;
    terminalWindow.classList.remove("is-typing");
    restartTerminalCursorBlink();
    if (internship.followOutput) {
      const screenRect = terminalScreen.getBoundingClientRect();
      const overflow = terminalReady.getBoundingClientRect().bottom - screenRect.bottom + 24;
      if (overflow > 0) terminalScreen.scrollTop += Math.min(overflow, Math.max(0, getCommandScrollRoom(internship, screenRect)));
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

  const requestSection = async (target) => {
    const internship = getInternship(target);
    if (target !== "welcome" && !internship) return;
    const version = invalidateFlow();
    prepareSectionNavigation();
    currentSection = target;
    void loadSectionAssets(target);
    preloadNextSection();
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
    playStartupChime();

    await wait(550, version);
    if (version !== flowVersion) return;
    bootActivity.hidden = false;
    await runBootAnimation(1100, version);
    if (version !== flowVersion) return;
    playBootSequenceTone(bootMessages.length);
    await wait(160, version);
    if (version !== flowVersion) return;
    bootLog.replaceChildren();
    bootLog.hidden = true;
    bootActivity.hidden = true;
    preloadNextSection();
    await typeAndExecuteSection("welcome", version);
  };

  const startWelcomeDirectly = () => {
    if (hasStarted) return;
    revealTerminal();
    void requestSection("welcome");
  };

  const playNextSection = () => {
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
    const image = openButton?.querySelector("img");
    if (!image || openButton.disabled || typeof internImageViewer.showModal !== "function") return;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width && height) internImageViewer.style.setProperty("--image-ratio", String(width / height));
    internImageViewerImage.src = image.currentSrc || image.src;
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
    clearImageViewerCloseAnimation();
    resetImageZoom();
  });
  window.addEventListener("resize", () => {
    if (internImageViewer.open) resetImageZoom();
  });

  let activeInlineVideo = null;
  let inlineVideoHome = null;
  const openVideoViewer = (inlineVideo) => {
    if (!inlineVideo || typeof internVideoViewer.showModal !== "function") return;
    activeInlineVideo = inlineVideo;
    // 直接复用内联的那个 video 元素，已缓冲的数据和播放进度都不会丢。
    inlineVideoHome = inlineVideo.parentElement;
    inlineVideo.muted = false;
    internVideoViewerStage.append(inlineVideo);
    internVideoViewer.showModal();
    playMedia(inlineVideo);
  };
  const closeVideoViewer = () => {
    if (internVideoViewer.open) internVideoViewer.close();
  };
  // 弹窗内无控件，点击任意处即关闭。
  internVideoViewer.addEventListener("click", () => closeVideoViewer());
  internVideoViewer.addEventListener("close", () => {
    const video = activeInlineVideo;
    activeInlineVideo = null;
    if (!video) return;
    video.pause();
    video.muted = true;
    if (inlineVideoHome) inlineVideoHome.append(video);
    inlineVideoHome = null;
    playMedia(video);
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
    if (!event.target.closest("button, input, a") && !pointerMoved) playNextSection();
    pointerStart = null;
  });
  terminalScreen.addEventListener("touchmove", () => {
    const internship = getInternship(currentSection);
    if (internship?.started) internship.followOutput = false;
  }, { passive: true });
  terminalWindow.addEventListener("wheel", (event) => {
    const internship = getInternship(currentSection);
    if (event.deltaY < 0 && internship?.started) internship.followOutput = false;
    if (event.deltaY > 0 && !event.ctrlKey) playNextSection();
  }, { passive: true });
  settingsMenu.querySelectorAll("[data-section-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.sectionTarget;
      closeSettingsMenu();
      terminalWindow.focus({ preventScroll: true });
      void requestSection(target);
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

  const startFromPowerScreen = () => {
    if (!hasStarted) void startExperience();
  };
  terminalPage.addEventListener("click", startFromPowerScreen);
  terminalPage.addEventListener("wheel", startFromPowerScreen, { passive: true });
  document.documentElement.classList.remove("js-loading");
  document.documentElement.classList.add("js-ready");
  if (skipPowerStart) startWelcomeDirectly();
}
