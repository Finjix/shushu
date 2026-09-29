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
const internSection = document.querySelector("#intern-section");
const internCommand = document.querySelector("#intern-command");
const internCatText = document.querySelector("#intern-cat-text");
const internContent = document.querySelector("#intern-content");
const internLogo = internContent?.querySelector(".intern-logo");
const internLogoWrap = internContent?.querySelector(".intern-logo-wrap");
const internGallery = internContent?.querySelector("#intern-gallery");
const internImageViewer = document.querySelector("#intern-image-viewer");
const internImageViewerStage = internImageViewer?.querySelector("#intern-image-viewer-stage");
const internImageViewerImage = internImageViewer?.querySelector("#intern-image-viewer-image");
const terminalScreen = document.querySelector(".terminal-screen");
const settingsMenuToggle = document.querySelector("#settings-menu-toggle");
const settingsMenu = document.querySelector("#terminal-settings-menu");
const animationToggle = document.querySelector("#animation-toggle");
const startupPageToggle = document.querySelector("#startup-page-toggle");

if (terminalPage && powerStart && terminalWindow && bootLog && bootActivity && catCommand && terminalPrompt && catText && welcomeContent && welcomeText && typingCursor && terminalReady && terminalCursor && internSection && internCommand && internCatText && internContent && internLogo && internLogoWrap && internGallery && internImageViewer && internImageViewerStage && internImageViewerImage && terminalScreen && settingsMenuToggle && settingsMenu && animationToggle && startupPageToggle && scrollHint) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const textTargets = [welcomeText, ...terminalWindow.querySelectorAll("[data-typewriter]")];
  const charactersByTarget = textTargets.map((target) => Array.from(target.textContent));
  const commandCharacters = Array.from(catText.textContent);
  const internTargets = [...internContent.querySelectorAll("[data-intern-typewriter]")];
  const internCharacters = internTargets.map((target) => Array.from(target.textContent));
  const internCommandCharacters = Array.from(internCatText.textContent);
  let welcomeFinished = false;
  let internStarted = false;
  let internFinished = false;
  let navigationInProgress = false;
  let followInternOutput = true;
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
  internTargets.forEach((target) => { target.textContent = ""; });
  internCatText.textContent = "";
  internSection.hidden = true;
  internContent.hidden = true;
  internGallery.querySelectorAll(".intern-image-open").forEach((button) => { button.disabled = true; });
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

  const revealLogo = async (version = flowVersion) => {
    const characterDelays = Array.from({ length: 6 }, () => 20 + Math.random() * 15);
    const duration = characterDelays.reduce((total, delay) => total + delay, 0);
    if (version !== flowVersion) return;
    if (noAnimation) {
      internLogo.classList.add("is-visible");
      return;
    }

    internLogoWrap.style.setProperty("--logo-type-duration", `${duration}ms`);
    internLogo.classList.add("is-visible");
    for (const delay of characterDelays) {
      if (noAnimation) break;
      playTypingSound("x");
      await wait(delay, version);
      if (version !== flowVersion) return;
    }
    internLogoWrap.style.removeProperty("--logo-type-duration");
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
    welcomeContent.hidden = true;
    scrollHint.hidden = true;
    terminalReady.hidden = true;
    welcomeFinished = false;
  };

  const resetInternshipOutput = () => {
    internTargets.forEach((target) => { target.textContent = ""; });
    internCatText.textContent = "";
    internCommand.hidden = true;
    internContent.hidden = true;
    internGallery.hidden = true;
    internLogo.classList.remove("is-visible");
    internLogoWrap.style.removeProperty("--logo-type-duration");
    internGallery.querySelectorAll(".intern-image-slot").forEach((imageSlot) => {
      imageSlot.classList.remove("is-visible");
      const openButton = imageSlot.querySelector(".intern-image-open");
      if (openButton) openButton.disabled = true;
    });
    internSection.hidden = true;
    internSection.classList.remove("is-current-screen");
    if (terminalReady.parentElement === internSection) internSection.after(terminalReady);
    terminalReady.hidden = !welcomeFinished;
    internStarted = false;
    internFinished = false;
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
    if (!internFinished) resetInternshipOutput();
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

  const restartTerminalCursorBlink = () => {
    terminalCursor.style.animation = "none";
    void terminalCursor.offsetWidth;
    terminalCursor.style.animation = "";
  };

  const typeSectionCommand = async (target, version, commandTop = null) => {
    const isWelcome = target === "welcome";
    const commandLine = isWelcome ? catCommand : internCommand;
    const commandText = isWelcome ? catText : internCatText;
    const characters = isWelcome ? commandCharacters : internCommandCharacters;
    if (isWelcome) {
      catCommand.hidden = false;
      catText.textContent = "";
    } else {
      internSection.hidden = false;
      internCommand.hidden = false;
      internCatText.textContent = "";
    }
    keepCommandAtPosition(commandLine, commandTop);

    terminalWindow.classList.add("is-typing");
    commandLine.classList.add("is-prompting");
    commandLine.querySelector(".terminal-prompt").after(typingCursor);
    if (isWelcome) await blinkCursor(650, false, version);
    if (version !== flowVersion) return false;
    commandLine.classList.remove("is-prompting");
    commandText.after(typingCursor);
    const typed = await typeCharacters(commandText, characters, () => 30 + Math.random() * 15, false, version);
    if (typed && version === flowVersion) keepCommandAtPosition(commandLine, commandTop);
    return typed;
  };

  const showEnteredSectionCommand = (target) => {
    const isWelcome = target === "welcome";
    const commandLine = isWelcome ? catCommand : internCommand;
    const commandText = isWelcome ? catText : internCatText;
    const characters = isWelcome ? commandCharacters : internCommandCharacters;
    if (isWelcome) {
      catCommand.hidden = false;
    } else {
      internSection.hidden = false;
      internCommand.hidden = false;
    }
    commandText.textContent = characters.join("");
    terminalWindow.classList.add("is-typing");
    commandLine.classList.remove("is-prompting");
    commandText.after(typingCursor);
    scrollCommandIntoView(commandLine);
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
    internSection.after(terminalReady);
    welcomeFinished = true;
  };

  const scrollToSection = (target) => {
    if (target === "welcome") {
      terminalScreen.scrollTop = 0;
      return;
    }
    terminalScreen.scrollTop += internSection.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top;
  };

  const executeSection = async (target, version, commandTop = null) => {
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
      scrollHint.hidden = internStarted;
      return;
    }

    if (internFinished) {
      terminalReady.hidden = false;
      internSection.append(terminalReady);
      terminalWindow.classList.remove("is-typing");
      terminalScreen.scrollTop += internSection.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top;
      navigationInProgress = false;
      return;
    }

    internStarted = true;
    internSection.hidden = false;
    internContent.hidden = false;
    terminalReady.hidden = false;
    internSection.append(terminalReady);
    internSection.classList.add("is-current-screen");
    keepCommandAtPosition(internCommand, commandTop);
    terminalWindow.classList.add("is-typing");

    for (let index = 0; index < internTargets.length; index += 1) {
      if (version !== flowVersion) return;
      internTargets[index].after(typingCursor);
      await typeCharacters(internTargets[index], internCharacters[index],
        (character) => {
          if (followInternOutput) {
            const overflow = typingCursor.getBoundingClientRect().bottom - terminalScreen.getBoundingClientRect().bottom + 24;
            if (overflow > 0) terminalScreen.scrollTop += overflow;
          }
          return "，。！？；：".includes(character) ? 100 : 20 + Math.random() * 15;
        }, false, version);
      if (version !== flowVersion) return;
      if (index === 0) {
        typingCursor.remove();
        await revealLogo(version);
        if (version !== flowVersion) return;
        internTargets[index + 1]?.after(typingCursor);
      }
      await wait(100, version);
    }

    if (version !== flowVersion) return;
    typingCursor.remove();
    internGallery.hidden = false;
    const imageSlots = [...internGallery.querySelectorAll(".intern-image-slot")];
    for (const imageSlot of imageSlots) {
      if (version !== flowVersion) return;
      if (followInternOutput) {
        const overflow = imageSlot.getBoundingClientRect().bottom - terminalScreen.getBoundingClientRect().bottom + 20;
        if (overflow > 0) terminalScreen.scrollTop += overflow;
      }
      const openButton = imageSlot.querySelector(".intern-image-open");
      if (openButton) openButton.disabled = false;
      playImageRevealSound();
      imageSlot.classList.add("is-visible");
      await wait(330, version);
    }
    if (version !== flowVersion) return;
    internFinished = true;
    terminalWindow.classList.remove("is-typing");
    restartTerminalCursorBlink();
    if (followInternOutput) terminalScreen.scrollTop = terminalScreen.scrollHeight;
    navigationInProgress = false;
  };

  const typeAndExecuteSection = async (target, version, commandTop = null) => {
    const typed = await typeSectionCommand(target, version, commandTop);
    if (!typed || version !== flowVersion) return;
    await blinkCursor(350, true, version);
    if (version !== flowVersion) return;
    await executeSection(target, version, commandTop);
  };

  const requestSection = async (target) => {
    const version = invalidateFlow();
    const alreadyLoaded = target === "welcome" ? welcomeFinished : internFinished;
    if (alreadyLoaded) {
      typingCursor.remove();
      typingCursor.classList.remove("is-blinking-once");
      typingCursor.style.animationDuration = "";
      terminalWindow.classList.remove("is-typing");
      internLogoWrap.style.removeProperty("--logo-type-duration");
      if (target === "internship") restartTerminalCursorBlink();
      navigationInProgress = false;
      terminalWindow.focus({ preventScroll: true });
      scrollToSection(target);
      scrollHint.hidden = target !== "welcome" || internStarted;
      return;
    }
    prepareSectionNavigation();
    navigationInProgress = true;
    if (target === "internship" && !welcomeFinished) completeWelcomeImmediately();
    const commandTop = target === "internship" && !terminalReady.hidden
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
    await typeAndExecuteSection("welcome", version);
  };

  const startWelcomeDirectly = () => {
    if (hasStarted) return;
    revealTerminal();
    void requestSection("welcome");
  };

  const playInternship = () => {
    if (!welcomeFinished || internStarted || navigationInProgress) return;
    prepareAudio();
    void requestSection("internship");
  };

  let imageZoomScale = 1;
  let imageZoomX = 0;
  let imageZoomY = 0;
  let imagePointerGesture = null;
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
    internImageViewerImage.style.transform = `matrix(${imageZoomScale}, 0, 0, ${imageZoomScale}, ${imageZoomX}, ${imageZoomY})`;
  };
  const resetImageZoom = () => {
    cancelImagePointerGesture();
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

  internGallery.addEventListener("click", (event) => {
    const openButton = event.target.closest(".intern-image-open");
    const image = openButton?.querySelector("img");
    if (!image || typeof internImageViewer.showModal !== "function") return;
    internImageViewerImage.src = image.currentSrc || image.src;
    internImageViewerImage.alt = image.alt;
    clearImageViewerCloseAnimation();
    resetImageZoom();
    internImageViewer.showModal();
    playImageRevealSound();
  });
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
    if (imageZoomScale <= 1 || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
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
  internImageViewerStage.addEventListener("pointerup", (event) => {
    const gesture = imagePointerGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.moved) suppressViewerClick = true;
    imagePointerGesture = null;
    internImageViewerStage.classList.remove("is-dragging");
  });
  internImageViewerStage.addEventListener("pointercancel", cancelImagePointerGesture);
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
    cancelImagePointerGesture(event);
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
  terminalScreen.addEventListener("click", () => {
    if (!pointerMoved && !window.getSelection()?.toString()) playInternship();
    pointerStart = null;
  });
  terminalScreen.addEventListener("touchmove", () => {
    if (internStarted) followInternOutput = false;
  }, { passive: true });
  terminalWindow.addEventListener("wheel", (event) => {
    if (event.deltaY < 0 && internStarted) followInternOutput = false;
    if (event.deltaY > 0 && !event.ctrlKey) playInternship();
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
    if (event.target.closest("button, input")) return;
    if (["Enter", " "].includes(event.key) && welcomeFinished && !internStarted && !navigationInProgress) {
      event.preventDefault();
      playInternship();
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
