import { hotkeyAction } from "./model.js";
import { installClock } from "./clock.js";
let gameClock;
let started = false,
  booting = false,
  recording = false,
  recordStart = 0,
  events = [],
  macroTimers = [],
  macroInputs = new Set(),
  video = null,
  romUrl;
let keys = { save: "F1", pause: "F2" };
const send = (type, data = {}) =>
  parent.postMessage({ channel: "free-retro", type, ...data }, location.origin);
const gm = () => {
  if (!started) throw new Error("게임이 아직 준비되지 않았습니다.");
  return window.EJS_emulator.gameManager;
};
function stopMacro() {
  macroTimers.forEach(clearTimeout);
  macroTimers = [];
  if (started)
    for (const key of macroInputs) {
      const [p, i] = key.split(":").map(Number);
      gm().simulateInput(p, i, 0);
    }
  macroInputs.clear();
}
function speed(value) {
  const m = gm(),
    e = window.EJS_emulator;
  m.toggleFastForward(0);
  m.toggleSlowMotion(0);
  e.isFastForward = false;
  e.isSlowMotion = false;
  if (value > 1) {
    m.setFastForwardRatio(value);
    m.toggleFastForward(1);
    e.isFastForward = true;
  } else if (value < 1) {
    m.setSlowMotionRatio(1 / value);
    m.toggleSlowMotion(1);
    e.isSlowMotion = true;
  }
}
function release() {
  stopMacro();
  if (started) gm().simulateInput(0, 28, 0);
}
async function boot(data) {
  if (booting) return;
  booting = true;
  // Keep the rendered WebGL frame available for screenshots and MediaRecorder.
  // The default cleared drawing buffer can produce an all-black canvas copy.
  const context = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    return context.call(
      this,
      type,
      /^(webgl2?|experimental-webgl)$/.test(type)
        ? { ...options, preserveDrawingBuffer: true }
        : options,
    );
  };
  keys = data.keys;
  gameClock = installClock(window, data.rtcOffset || 0);
  romUrl = URL.createObjectURL(data.rom);
  window.EJS_player = "#game";
  window.EJS_gameUrl = romUrl;
  window.EJS_core = data.core;
  // Blob URLs have no extension. Some cores use the virtual filename to
  // recognize a cartridge, so retain the imported ROM's original filename.
  window.EJS_gameName = data.filename || data.title;
  window.EJS_gameID = data.gameId;
  window.EJS_pathtodata = "../data/";
  // A trusted Start click unlocks browser audio and keeps audio-driven cores running.
  window.EJS_startOnLoaded = false;
  window.EJS_color = "#b7f56e";
  window.EJS_backgroundColor = "#10171d";
  window.EJS_threads = false;
  window.EJS_disableDatabases = true;
  window.EJS_language = "en-US";
  window.EJS_disableAutoLang = true;
  window.EJS_defaultOptions = {
    rewindEnabled: "enabled",
    "rewind-granularity": "6",
    "ff-ratio": "2.0",
    "sm-ratio": "2.0",
    fastForward: "disabled",
    slowMotion: "disabled",
    "virtual-gamepad":
      matchMedia("(pointer: coarse)").matches || innerWidth < 700
        ? "enabled"
        : "disabled",
  };
  window.EJS_Buttons = { exitEmulation: false };
  window.EJS_onGameStart = () => {
    started = true;
    document.getElementById("loading").hidden = true;
    const m = gm();
    if (matchMedia("(pointer: coarse)").matches || innerWidth < 700)
      // EmulatorJS's initial resize can hide the pad after 250 ms.
      setTimeout(() => window.EJS_emulator.toggleVirtualGamepad(true), 350);
    m.saveSaveFiles = () => m.functions.saveSaveFiles();
    const input = m.simulateInput.bind(m);
    m.simulateInput = (player, index, value) => {
      if (recording && index < 24 && events.length < 10000)
        events.push({
          t: Math.round(performance.now() - recordStart),
          player,
          index,
          value,
        });
      return input(player, index, value);
    };
    send("started", {
      supportsStates: m.supportsStates(),
      rewind: window.EJS_emulator.rewindEnabled,
      canRecord: typeof MediaRecorder !== "undefined",
    });
  };
  window.EJS_onSaveState = (data) =>
    send("native-save", { state: new Blob([data.state]) });
  const loader = document.createElement("script");
  loader.src = "../data/loader.js";
  loader.onerror = () =>
    send("error", { message: "에뮬레이터를 불러오지 못했습니다." });
  document.body.append(loader);
}
const actions = {
  snapshot: () => {
    const m = gm();
    if (!m.supportsStates())
      throw new Error("이 코어는 상태 저장을 지원하지 않습니다.");
    const state = m.getState();
    if (!state?.length) throw new Error("상태 저장 데이터를 얻지 못했습니다.");
    return new Blob([state]);
  },
  restore: async (data) => {
    const m = gm();
    stopMacro();
    if (Number.isFinite(data.rtcOffset)) gameClock.set(data.rtcOffset);
    if (data.battery?.size) {
      const path = m.getSaveFilePath();
      if (path) {
        m.FS.writeFile(path, new Uint8Array(await data.battery.arrayBuffer()));
        m.loadSaveFiles();
      }
    }
    m.loadState(new Uint8Array(await data.blob.arrayBuffer()));
    // The native core processes load commands in its running main loop.
    window.EJS_emulator.play();
    return { paused: false };
  },
  battery: () => {
    const m = gm();
    m.functions.saveSaveFiles();
    const raw = m.getSaveFile(false);
    if (!raw?.length) throw new Error("게임 내 저장 데이터가 아직 없습니다.");
    return new Blob([raw]);
  },
  importBattery: async (data) => {
    const m = gm(),
      path = m.getSaveFilePath();
    if (!path)
      throw new Error("이 코어는 게임 내 저장 가져오기를 지원하지 않습니다.");
    m.FS.writeFile(path, new Uint8Array(await data.blob.arrayBuffer()));
    m.loadSaveFiles();
    m.restart();
    return true;
  },
  speed: (data) => {
    speed(Number(data.value));
    return true;
  },
  rewind: (data) => {
    gm().simulateInput(0, 28, data.active ? 1 : 0);
    return true;
  },
  pause: () => {
    stopMacro();
    const e = window.EJS_emulator;
    gm();
    e.paused ? e.play() : e.pause();
    return { paused: e.paused };
  },
  touch: () => {
    gm();
    const e = window.EJS_emulator;
    e.toggleVirtualGamepad(e.virtualGamepad.style.display === "none");
    return true;
  },
  clock: (data) =>
    data.offset === undefined ? gameClock.read() : gameClock.set(data.offset),
  shader: (data) => {
    gm();
    window.EJS_emulator.changeSettingOption("shader", data.value);
    return true;
  },
  screenshot: () => {
    gm();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("스크린샷 생성 시간이 초과됐습니다.")),
        5000,
      );
      requestAnimationFrame(() =>
        window.EJS_emulator.screenshot(
          (blob) => {
            clearTimeout(timer);
            blob
              ? resolve(blob)
              : reject(new Error("화면을 캡처하지 못했습니다."));
          },
          "canvas",
          "png",
          1,
        ),
      );
    });
  },
  record: () => {
    gm();
    if (video) {
      video.stop();
      video = null;
      return false;
    }
    if (typeof MediaRecorder === "undefined")
      throw new Error("이 브라우저는 영상 녹화를 지원하지 않습니다.");
    video = window.EJS_emulator.screenRecord();
    return true;
  },
  keys: (data) => {
    keys = data.keys;
    return true;
  },
  macroRecord: () => {
    gm();
    stopMacro();
    if (recording) {
      recording = false;
      return { events, duration: Math.round(performance.now() - recordStart) };
    }
    events = [];
    recordStart = performance.now();
    recording = true;
    setTimeout(() => {
      if (recording && performance.now() - recordStart >= 59900) {
        recording = false;
        send("macro-done", { macro: { events, duration: 60000 } });
      }
    }, 60000);
    return null;
  },
  macroPlay: (data) => {
    gm();
    if (recording) throw new Error("먼저 입력 기록을 마쳐주세요.");
    stopMacro();
    for (const event of data.macro.events)
      macroTimers.push(
        setTimeout(() => {
          gm().simulateInput(event.player, event.index, event.value);
          const key = `${event.player}:${event.index}`;
          event.value ? macroInputs.add(key) : macroInputs.delete(key);
        }, event.t),
      );
    macroTimers.push(setTimeout(stopMacro, data.macro.duration + 50));
    return true;
  },
  macroStop: () => {
    stopMacro();
    return true;
  },
  input: (data) => {
    gm().simulateInput(0, data.index, data.value);
    return true;
  },
  stats: () => {
    const m = gm();
    return {
      frame: m.getFrameNum(),
      paused: window.EJS_emulator.paused,
      rewind: window.EJS_emulator.rewindEnabled,
    };
  },
};
window.addEventListener("message", async (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== parent ||
    event.data?.channel !== "free-retro"
  )
    return;
  const data = event.data;
  if (data.type === "init") {
    try {
      await boot(data);
    } catch (e) {
      send("error", { message: e.message });
    }
    return;
  }
  if (data.type !== "rpc") return;
  try {
    if (!Object.hasOwn(actions, data.action))
      throw new Error("지원하지 않는 동작입니다.");
    const result = await actions[data.action](data);
    send("result", { id: data.id, result });
  } catch (e) {
    send("result", { id: data.id, error: e.message });
  }
});
window.addEventListener(
  "keydown",
  (event) => {
    const action = hotkeyAction(event, keys);
    if (!started || !action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    send("hotkey", { action });
  },
  true,
);
window.addEventListener("blur", release);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) release();
});
window.addEventListener("pagehide", () => {
  release();
  if (romUrl) URL.revokeObjectURL(romUrl);
});
send("ready");
