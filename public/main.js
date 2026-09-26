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
const terminalInput = document.querySelector("#terminal-input");
const terminalHistory = document.querySelector("#terminal-history");

if (terminalPage && powerStart && terminalWindow && bootLog && bootActivity && catCommand && terminalPrompt && catText && welcomeContent && welcomeText && typingCursor && terminalReady && terminalCursor && terminalInput && terminalHistory) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const textTargets = [welcomeText, ...terminalWindow.querySelectorAll("[data-typewriter]")];
  const charactersByTarget = textTargets.map((target) => Array.from(target.textContent));
  const commandCharacters = Array.from(catText.textContent);
  const bootMessages = [
    { progress: 0.12, message: "Initializing hardware" },
    { progress: 0.48, message: "Loading system" },
    { progress: 0.82, message: "Starting session" },
  ];
  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  let hasStarted = false;
  let audioContext = null;
  let masterVolume = null;
  let typingNoiseBuffer = null;

  textTargets.forEach((target) => {
    target.textContent = "";
  });
  catText.textContent = "";

  const prepareAudio = () => {
    if (!AudioContextClass) return false;

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
      if (audioContext.state !== "running") return;
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
      audioContext.resume().then(playNotes).catch(() => audioContext.close().catch(() => {}));
    }
  };

  const playTypingSound = (character) => {
    if (!audioContext || audioContext.state !== "running" || !typingNoiseBuffer) return;

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
    if (!audioContext || audioContext.state !== "running" || !typingNoiseBuffer) return;

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

  const appendHistoryLine = (className, text) => {
    const line = document.createElement("p");
    line.className = className;
    line.textContent = text;
    terminalHistory.append(line);
    return line;
  };

  const runTerminalCommand = (rawCommand) => {
    const commandText = rawCommand.trim();
    if (!commandText) return;

    const [commandName = "", ...args] = commandText.split(/\s+/);
    const normalizedName = commandName.toLowerCase();

    if (normalizedName === "clear") {
      terminalHistory.replaceChildren();
      return;
    }

    const commandLine = document.createElement("p");
    commandLine.className = "terminal-command terminal-history-command";
    const prompt = document.createElement("span");
    prompt.className = "terminal-prompt";
    prompt.textContent = "finjix@MacBook-Pro ~ %";
    const enteredCommand = document.createElement("span");
    enteredCommand.textContent = commandText;
    commandLine.append(prompt, enteredCommand);
    terminalHistory.append(commandLine);

    let output;
    switch (normalizedName) {
      case "help":
        output = "可用命令：help、whoami、about、cat welcome.txt、echo <内容>、clear";
        break;
      case "whoami":
        output = "Finjix";
        break;
      case "about":
        output = "Finjix · 广东技术师范大学 · 数字媒体技术系";
        break;
      case "cat":
        output = args.join(" ") === "welcome.txt" ? welcomeText.textContent : `cat: ${args.join(" ") || "缺少文件名"}: No such file`;
        break;
      case "echo":
        output = args.join(" ");
        break;
      default:
        output = `zsh: command not found: ${commandName}`;
    }

    appendHistoryLine("terminal-history-output", output);
    const terminalScreen = terminalWindow.querySelector(".terminal-screen");
    terminalScreen.scrollTop = terminalScreen.scrollHeight;
  };

  terminalInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      playEnterKeySound();
      runTerminalCommand(terminalInput.value);
      terminalInput.value = "";
      return;
    }

    if (event.key === "Backspace") {
      playTypingSound("\b");
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      playTypingSound(event.key);
    }
  });

  const typeCharacters = async (target, characters, delayForCharacter) => {
    for (const character of characters) {
      target.textContent += character;
      playTypingSound(character);
      await wait(delayForCharacter(character));
    }
  };

  const blinkCursor = async (count = 2, keepFinishedState = false) => {
    const animationClass = count === 1 ? "is-blinking-once" : "is-blinking-twice";
    const animationComplete = new Promise((resolve) => {
      typingCursor.addEventListener("animationend", resolve, { once: true });
    });
    typingCursor.classList.add(animationClass);
    await Promise.race([animationComplete, wait(count * 1000 + 100)]);
    if (!keepFinishedState) {
      typingCursor.classList.remove(animationClass);
    }
  };

  const runBootAnimation = (duration) => new Promise((resolve) => {
    const startedAt = window.performance.now();
    let nextMessage = 0;

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
        nextMessage += 1;
      }

      if (progress < 1) {
        window.requestAnimationFrame(update);
      } else {
        resolve();
      }
    };

    window.requestAnimationFrame(update);
  });

  const typeAllText = async () => {
    typingCursor.classList.remove("is-blinking-twice", "is-blinking-once");
    for (let targetIndex = 0; targetIndex < textTargets.length; targetIndex += 1) {
      const target = textTargets[targetIndex];
      target.after(typingCursor);

      for (const character of charactersByTarget[targetIndex]) {
        target.textContent += character;
        playTypingSound(character);
        const typingDelay = "，。！？；：".includes(character) ? 190 : 36 + Math.random() * 28;
        await wait(typingDelay);
      }

      if (targetIndex < textTargets.length - 1) {
        await wait(180);
      }
    }

    typingCursor.remove();
    terminalWindow.classList.remove("is-typing");
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      terminalInput.focus({ preventScroll: true });
    }
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

    await wait(760);
    bootActivity.hidden = false;
    await runBootAnimation(2000);
    await wait(1000);
    bootLog.replaceChildren();
    bootLog.hidden = true;
    bootActivity.hidden = true;
    catCommand.hidden = false;
    terminalWindow.classList.add("is-typing");
    catCommand.classList.add("is-prompting");
    terminalPrompt.after(typingCursor);
    await blinkCursor(2);
    catCommand.classList.remove("is-prompting");
    catText.after(typingCursor);
    await typeCharacters(catText, commandCharacters, () => 48 + Math.random() * 22);
    await blinkCursor(1, true);
    playEnterKeySound();
    await wait(260);
    welcomeContent.hidden = false;
    terminalReady.hidden = false;
    await typeAllText();
  };

  powerStart.addEventListener("click", startExperience, { once: true });
}
