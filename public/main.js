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
const terminalScreen = document.querySelector(".terminal-screen");
const animationToggle = document.querySelector("#animation-toggle");
const scrollHintText = scrollHint?.querySelector("[data-typewriter]");

if (terminalPage && powerStart && terminalWindow && bootLog && bootActivity && catCommand && terminalPrompt && catText && welcomeContent && welcomeText && typingCursor && terminalReady && terminalCursor && internSection && internCommand && internCatText && internContent && terminalScreen && animationToggle && scrollHintText) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const tapMedia = window.matchMedia("(max-width: 700px), (hover: none) and (pointer: coarse)");
  const getScrollHint = () => tapMedia.matches ? "单击继续" : "↓ 鼠标滚轮或单击继续";
  scrollHintText.textContent = getScrollHint();
  const textTargets = [welcomeText, ...terminalWindow.querySelectorAll("[data-typewriter]")];
  const charactersByTarget = textTargets.map((target) => Array.from(target.textContent));
  const commandCharacters = Array.from(catText.textContent);
  const internTargets = [...internContent.querySelectorAll("[data-intern-typewriter]")];
  const internCharacters = internTargets.map((target) => Array.from(target.textContent));
  const internCommandCharacters = Array.from(internCatText.textContent);
  let welcomeFinished = false;
  let internStarted = false;
  let followInternOutput = true;
  const bootMessages = [
    { progress: 0.25, message: "Initializing hardware" },
    { progress: 0.5, message: "Loading system" },
    { progress: 0.75, message: "Starting session" },
  ];
  const bootToneFrequencies = [440, 493.88, 554.37, 659.25];
  let noAnimation = document.documentElement.classList.contains("no-animation");
  const pendingAnimations = new Set();
  const wait = (duration) => new Promise((resolve) => {
    if (noAnimation) return resolve();
    const finish = () => {
      window.clearTimeout(timer);
      pendingAnimations.delete(finish);
      resolve();
    };
    const timer = window.setTimeout(finish, duration);
    pendingAnimations.add(finish);
  });
  let hasStarted = false;
  let audioContext = null;
  let masterVolume = null;
  let typingNoiseBuffer = null;

  const updateAnimationToggle = () => {
    animationToggle.setAttribute("aria-pressed", String(noAnimation));
    animationToggle.title = noAnimation ? "切换到动画模式" : "切换到无动画模式";
    document.documentElement.classList.toggle("no-animation", noAnimation);
  };
  updateAnimationToggle();
  animationToggle.disabled = false;
  animationToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    noAnimation = !noAnimation;
    updateAnimationToggle();
    try { localStorage.setItem("finjix-no-animation", String(noAnimation)); } catch {}
    if (masterVolume) masterVolume.gain.setValueAtTime(noAnimation ? 0 : 0.5, audioContext.currentTime);
    if (noAnimation) [...pendingAnimations].forEach((finish) => finish());
  });

  textTargets.forEach((target) => {
    target.textContent = "";
  });
  catText.textContent = "";
  internTargets.forEach((target) => { target.textContent = ""; });
  internCatText.textContent = "";
  internSection.hidden = true;
  internContent.hidden = true;
  welcomeContent.hidden = true;
  terminalReady.hidden = true;
  terminalWindow.setAttribute("aria-hidden", "true");
  tapMedia.addEventListener("change", () => {
    charactersByTarget[textTargets.indexOf(scrollHintText)] = Array.from(getScrollHint());
    if (welcomeFinished) scrollHintText.textContent = getScrollHint();
  });

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

  const typeCharacters = async (target, characters, delayForCharacter, followOutput = false) => {
    for (let index = 0; index < characters.length; index += 1) {
      if (noAnimation) {
        target.textContent += characters.slice(index).join("");
        if (followOutput) terminalScreen.scrollTop = terminalScreen.scrollHeight;
        return;
      }
      const character = characters[index];
      target.textContent += character;
      playTypingSound(character);
      if (followOutput) terminalScreen.scrollTop = terminalScreen.scrollHeight;
      await wait(delayForCharacter(character));
    }
  };

  const blinkCursor = async (duration, keepFinishedState = false) => {
    if (noAnimation) return;
    typingCursor.style.animationDuration = `${duration}ms`;
    typingCursor.classList.add("is-blinking-once");
    await wait(duration);
    if (!keepFinishedState) {
      typingCursor.classList.remove("is-blinking-once");
      typingCursor.style.animationDuration = "";
    }
  };

  const runBootAnimation = (duration) => new Promise((resolve) => {
    if (noAnimation) return resolve();
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

  const typeAllText = async () => {
    typingCursor.classList.remove("is-blinking-once");
    typingCursor.style.animationDuration = "";
    for (let targetIndex = 0; targetIndex < textTargets.length; targetIndex += 1) {
      const target = textTargets[targetIndex];
      if (scrollHint.contains(target)) scrollHint.hidden = false;
      target.after(typingCursor);

      await typeCharacters(target, charactersByTarget[targetIndex],
        (character) => "，。！？；：".includes(character) ? 100 : 20 + Math.random() * 15);
      if (target === scrollHintText) target.textContent = getScrollHint();

      if (targetIndex < textTargets.length - 1) {
        await wait(100);
      }
    }

    typingCursor.remove();
    terminalWindow.classList.remove("is-typing");
  };

  const startExperience = async () => {
    if (hasStarted) {
      return;
    }

    hasStarted = true;
    powerStart.disabled = true;
    powerStart.setAttribute("aria-hidden", "true");
    terminalWindow.setAttribute("aria-hidden", "false");
    terminalPage.classList.add("is-started");
    terminalWindow.focus({ preventScroll: true });
    playStartupChime();

    await wait(550);
    bootActivity.hidden = false;
    await runBootAnimation(1100);
    playBootSequenceTone(bootMessages.length);
    await wait(160);
    bootLog.replaceChildren();
    bootLog.hidden = true;
    bootActivity.hidden = true;
    catCommand.hidden = false;
    terminalWindow.classList.add("is-typing");
    catCommand.classList.add("is-prompting");
    terminalPrompt.after(typingCursor);
    await blinkCursor(600);
    catCommand.classList.remove("is-prompting");
    catText.after(typingCursor);
    await typeCharacters(catText, commandCharacters, () => 30 + Math.random() * 15);
    await blinkCursor(350, true);
    playEnterKeySound();
    await wait(180);
    welcomeContent.hidden = false;
    terminalReady.hidden = false;
    await typeAllText();
    welcomeFinished = true;
  };

  const playInternship = async () => {
    if (!welcomeFinished || internStarted) return;
    internStarted = true;
    prepareAudio();
    terminalWindow.classList.add("is-typing");
    internSection.hidden = false;
    internCommand.hidden = false;
    typingCursor.classList.remove("is-blinking-once");
    typingCursor.style.animationDuration = "";
    internCatText.after(typingCursor);
    await typeCharacters(internCatText, internCommandCharacters, () => 30 + Math.random() * 15, true);
    await blinkCursor(350, true);
    playEnterKeySound();
    await wait(180);
    internContent.hidden = false;
    internSection.append(terminalReady);
    internSection.classList.add("is-current-screen");
    terminalScreen.scrollTop += internSection.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top;
    typingCursor.classList.remove("is-blinking-once");
    typingCursor.style.animationDuration = "";
    for (let index = 0; index < internTargets.length; index += 1) {
      internTargets[index].after(typingCursor);
      await typeCharacters(internTargets[index], internCharacters[index],
        (character) => {
          if (followInternOutput) {
            const overflow = typingCursor.getBoundingClientRect().bottom - terminalScreen.getBoundingClientRect().bottom + 24;
            if (overflow > 0) terminalScreen.scrollTop += overflow;
          }
          return "，。！？；：".includes(character) ? 100 : 20 + Math.random() * 15;
        });
      await wait(100);
    }
    typingCursor.remove();
    terminalWindow.classList.remove("is-typing");
  };

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
  terminalWindow.addEventListener("keydown", (event) => {
    if (event.target.closest("button")) return;
    if (["Enter", " "].includes(event.key) && welcomeFinished && !internStarted) {
      event.preventDefault();
      playInternship();
    }
  });

  powerStart.addEventListener("click", startExperience, { once: true });
  document.documentElement.classList.remove("js-loading");
  document.documentElement.classList.add("js-ready");
}
