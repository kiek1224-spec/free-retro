import {
  SYSTEMS,
  coreFor,
  romId,
  filterGames,
  validateBackup,
  hotkeyAction,
} from "./model.js";
import * as store from "./storage.js";
import { pickGame, validConfig, prepareDrive, disconnect } from "./drive.js";
const $ = (id) => document.getElementById(id);
let games = [],
  current = null,
  profile = "기본",
  keys = { save: "F1", pause: "F2" },
  driveConfig = {},
  started = false,
  stateSupported = false,
  saving = null,
  autoTimer,
  loadingTimer,
  toastTimer,
  requestId = 0,
  macroRecording = false,
  exiting = false,
  importing = false;
const pending = new Map();
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 6000);
}
function handle(fn) {
  return async (event) => {
    try {
      await fn(event);
    } catch (e) {
      console.error(e);
      toast(
        e.name === "QuotaExceededError"
          ? "브라우저 저장 공간이 부족합니다. 저장 백업을 먼저 내보내세요."
          : e.message,
      );
    }
  };
}
function button(text, fn, cls = "") {
  const el = document.createElement("button");
  el.textContent = text;
  el.className = cls;
  el.addEventListener("click", handle(fn));
  return el;
}
function option(text, value = text) {
  const el = document.createElement("option");
  el.textContent = text;
  el.value = value;
  return el;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function safeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}
function rpc(action, data = {}) {
  if (!started)
    return Promise.reject(new Error("게임이 아직 준비되지 않았습니다."));
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("게임 응답 시간이 초과됐습니다."));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    $("player").contentWindow.postMessage(
      { channel: "free-retro", type: "rpc", id, action, ...data },
      location.origin,
    );
  });
}
function controlsReady(ready) {
  for (const el of document.querySelectorAll(
    ".play-controls button,.play-controls select",
  ))
    el.disabled = !ready;
}
async function refresh() {
  games = await store.allGames();
  render();
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    $("storage-info").textContent =
      `이 브라우저 ${((est.usage || 0) / 1048576).toFixed(1)} MB 사용`;
  }
}
function render() {
  const selected = $("folder-filter").value;
  const folders = [
    ...new Set(games.map((g) => g.folder).filter(Boolean)),
  ].sort();
  $("folder-filter").replaceChildren(
    option("모든 폴더", ""),
    ...folders.map((f) => option(f)),
  );
  $("folder-filter").value = folders.includes(selected) ? selected : "";
  const filtered = filterGames(games, {
    search: $("search").value,
    view: $("view-filter").value,
    folder: $("folder-filter").value,
  });
  $("games").replaceChildren();
  $("game-count").textContent = games.length;
  $("empty").hidden = !!filtered.length;
  $("empty").querySelector("h3").textContent = games.length
    ? "조건에 맞는 게임이 없습니다"
    : "첫 게임을 담아 보세요";
  for (const g of filtered) {
    const card = document.createElement("article");
    card.className = "game-card";
    const art = document.createElement("div");
    art.className = "game-art";
    art.textContent = SYSTEMS[g.core] || g.core;
    const title = document.createElement("h3");
    title.textContent = (g.favorite ? "★ " : "") + g.title;
    const info = document.createElement("p");
    info.className = "subtle small";
    info.textContent = `${g.folder || "미분류"} · ${(g.size / 1048576).toFixed(1)} MB · ${g.source === "drive" ? "Drive에서 추가" : "로컬"}`;
    const row = document.createElement("div");
    row.className = "row";
    row.append(
      button(
        g.lastPlayed ? "이어서 플레이" : "플레이",
        () => launch(g.id),
        "primary",
      ),
      button("정리", () => editGame(g.id)),
    );
    card.append(art, title, info, row);
    $("games").append(card);
  }
}
async function addFiles(files, source = "local") {
  if (importing)
    throw new Error("게임을 추가하는 중입니다. 잠시 기다려주세요.");
  importing = true;
  $("add-local").disabled = true;
  $("add-drive").disabled = true;
  let count = 0;
  const failures = [];
  try {
    for (const file of files) {
      try {
        const core = coreFor(file.name);
        if (!file.size) throw new Error(`${file.name}: 빈 파일입니다.`);
        if (file.size > 512 * 1048576)
          throw new Error(
            `${file.name}: 현재 버전은 512 MB 이하 단일 파일을 지원합니다.`,
          );
        const id = await romId(file);
        const old = await store.getGame(id);
        if (old) {
          count++;
          continue;
        }
        await store.putGame({
          id,
          title: file.name.replace(/\.[^.]+$/, ""),
          filename: file.name,
          core,
          blob: file,
          size: file.size,
          source,
          folder: "",
          favorite: false,
          added: Date.now(),
          lastPlayed: 0,
          profiles: ["기본"],
          macros: [],
        });
        count++;
      } catch (e) {
        failures.push(e.message);
      }
    }
    await refresh();
    toast(
      failures.length
        ? `${count}개 추가. ${failures.join(" / ")}`
        : `${count}개 게임을 게임함에 담았습니다.`,
    );
    navigator.storage?.persist?.().catch(() => {});
  } finally {
    importing = false;
    $("add-local").disabled = false;
    $("add-drive").disabled = false;
    $("rom-input").value = "";
  }
}
function editGame(id) {
  const g = games.find((g) => g.id === id);
  $("edit-id").value = id;
  $("edit-title").value = g.title;
  $("edit-folder").value = g.folder;
  $("edit-favorite").checked = !!g.favorite;
  $("edit-game").showModal();
}
async function launch(id) {
  if (current) throw new Error("현재 게임을 먼저 종료하세요.");
  current = await store.getGame(id);
  profile = current.lastProfile || "기본";
  started = false;
  stateSupported = false;
  exiting = false;
  current.lastPlayed = Date.now();
  await store.putGame(current);
  $("playing-title").textContent = current.title;
  $("core-name").textContent = SYSTEMS[current.core];
  $("library").hidden = true;
  $("play-view").hidden = false;
  controlsReady(false);
  $("exit-game").disabled = false;
  $("speed").value = "1";
  $("pause-game").textContent = "일시정지";
  $("record-video").textContent = "영상 녹화";
  $("shader").value = "disabled";
  $("save-key").value = keys.save;
  $("pause-key").value = keys.pause;
  renderProfiles();
  renderMacros();
  await renderStates();
  $("player").src = "app/player.html";
  loadingTimer = setTimeout(() => {
    if (!started)
      toast(
        "게임 시작이 지연되고 있습니다. 화면의 시작 버튼과 코어 오류 메시지를 확인하세요.",
      );
  }, 25000);
  window.scrollTo(0, 0);
}
function renderProfiles() {
  $("profile").replaceChildren(...current.profiles.map((p) => option(p)));
  $("profile").value = profile;
}
function renderMacros() {
  $("macros").replaceChildren(
    ...current.macros.map((m, i) => option(m.name, String(i))),
  );
  $("play-macro").disabled = !started || !current.macros.length;
}
async function renderStates() {
  if (!current) return;
  const states = await store.statesFor(current.id, profile);
  $("states").replaceChildren();
  for (const s of states) {
    const row = document.createElement("div");
    row.className = "state";
    const label = document.createElement("span");
    label.textContent = `${s.label} · ${new Date(s.created).toLocaleString("ko-KR")}`;
    row.append(
      label,
      button("불러오기", async () => {
        await save("불러오기 전 백업");
        await rpc("restore", { blob: s.data });
        $("pause-game").textContent = "일시정지";
        toast("저장한 상태를 불러왔습니다.");
      }),
      button("파일", () =>
        download(
          s.data,
          `${safeName(current.title)}-${safeName(profile)}-${s.created}.state`,
        ),
      ),
    );
    $("states").append(row);
  }
  if (!states.length)
    $("states").textContent = "이 프로필에 저장된 상태가 없습니다.";
}
async function save(label = "수동 저장", blob = null) {
  if (saving) await saving;
  if (!current || !started || exiting) return;
  const game = current,
    saveProfile = profile;
  saving = (async () => {
    const data = blob || (await rpc("snapshot"));
    await store.putState({
      id:
        label === "자동 저장"
          ? `${game.id}:${saveProfile}:auto`
          : crypto.randomUUID(),
      romId: game.id,
      core: game.core,
      profile: saveProfile,
      created: Date.now(),
      label,
      data,
    });
    if (current?.id === game.id) await renderStates();
  })();
  try {
    await saving;
    if (label !== "자동 저장") toast("현재 상태를 저장했습니다.");
  } finally {
    saving = null;
  }
}
async function pause() {
  const result = await rpc("pause");
  $("pause-game").textContent = result.paused ? "계속하기" : "일시정지";
}
async function exit() {
  if (exiting) return;
  clearInterval(autoTimer);
  $("exit-game").disabled = true;
  try {
    if (started && stateSupported) {
      await save("종료 전 저장");
      await rpc("macroStop");
    }
    exiting = true;
    started = false;
    clearTimeout(loadingTimer);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("게임이 종료됐습니다."));
    }
    pending.clear();
    $("player").src = "about:blank";
    current = null;
    $("play-view").hidden = true;
    $("library").hidden = false;
    await refresh();
  } catch (e) {
    $("exit-game").disabled = false;
    autoTimer = setInterval(() => {
      if (started && !document.hidden && !saving)
        save("자동 저장").catch((e) => toast(e.message));
    }, 30000);
    throw e;
  }
}
async function askName(heading) {
  $("name-heading").textContent = heading;
  $("name-value").value = "";
  $("name-dialog").showModal();
  return new Promise((resolve) => {
    const form = $("name-form"),
      dialog = $("name-dialog");
    const submit = (e) => {
      e.preventDefault();
      const value = $("name-value").value.trim();
      if (!value) return;
      cleanup();
      dialog.close();
      resolve(value);
    };
    const cancel = () => {
      cleanup();
      resolve(null);
    };
    function cleanup() {
      form.removeEventListener("submit", submit);
      dialog.removeEventListener("close", cancel);
    }
    form.addEventListener("submit", submit);
    dialog.addEventListener("close", cancel, { once: true });
  });
}
async function storeMacro(macro) {
  macroRecording = false;
  $("record-macro").textContent = "입력 기록 시작";
  if (!macro.events.length) {
    toast("기록한 입력이 없습니다.");
    return;
  }
  const name = await askName("입력 매크로 이름");
  if (!name) return;
  current.macros.push({ ...macro, name });
  await store.putGame(current);
  renderMacros();
  toast("입력 매크로를 저장했습니다.");
}
window.addEventListener(
  "message",
  handle(async (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== $("player").contentWindow ||
      event.data?.channel !== "free-retro" ||
      !current
    )
      return;
    const data = event.data;
    if (data.type === "ready") {
      $("player").contentWindow.postMessage(
        {
          channel: "free-retro",
          type: "init",
          rom: current.blob,
          title: `${current.title}-${current.id.slice(0, 16)}-${profile}`,
          core: current.core,
          gameId: parseInt(current.id.slice(0, 8), 16),
          keys,
        },
        location.origin,
      );
    }
    if (data.type === "started") {
      clearTimeout(loadingTimer);
      started = true;
      stateSupported = data.supportsStates;
      controlsReady(true);
      $("rewind").disabled = !data.rewind;
      $("save-state").disabled = !data.supportsStates;
      $("backup").disabled = !data.supportsStates;
      $("restore").disabled = !data.supportsStates;
      $("record-video").disabled = !data.canRecord;
      const latest = data.supportsStates
        ? (await store.statesFor(current.id, profile))[0]
        : null;
      if (latest) await rpc("restore", { blob: latest.data });
      renderMacros();
      autoTimer = setInterval(() => {
        if (started && !document.hidden && !saving && data.supportsStates)
          save("자동 저장").catch((e) => toast(e.message));
      }, 30000);
      toast(
        latest ? "이전 플레이 상태를 불러왔습니다." : "게임을 시작했습니다.",
      );
    }
    if (data.type === "result") {
      const p = pending.get(data.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(data.id);
        data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
      }
    }
    if (data.type === "native-save") await save("에뮬레이터 저장", data.state);
    if (data.type === "hotkey")
      await (data.action === "save" ? save() : pause());
    if (data.type === "macro-done") await storeMacro(data.macro);
    if (data.type === "error") toast(data.message);
  }),
);
async function encode(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function decode(data) {
  const raw = atob(data);
  return new Blob([Uint8Array.from(raw, (c) => c.charCodeAt(0))]);
}
async function backup() {
  await save("백업 전 저장");
  const states = await store.statesFor(current.id);
  const value = {
    format: "free-retro-backup",
    version: 1,
    romId: current.id,
    core: current.core,
    profiles: current.profiles,
    states: await Promise.all(
      states.map(async (s) => ({ ...s, data: await encode(s.data) })),
    ),
  };
  download(
    new Blob([JSON.stringify(value)], { type: "application/json" }),
    `${safeName(current.title)}.free-retro.json`,
  );
  toast("저장 백업 파일을 내보냈습니다.");
}
for (const id of ["search", "view-filter", "folder-filter"])
  $(id).addEventListener(id === "search" ? "input" : "change", render);
$("add-local").onclick = () => $("rom-input").click();
$("rom-input").onchange = handle((e) => addFiles([...e.target.files]));
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!current) document.body.classList.add("dragover");
});
window.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) document.body.classList.remove("dragover");
});
window.addEventListener(
  "drop",
  handle(async (e) => {
    e.preventDefault();
    document.body.classList.remove("dragover");
    if (!current && e.dataTransfer.files.length)
      await addFiles([...e.dataTransfer.files]);
  }),
);
$("edit-save").onclick = handle(async () => {
  const title = $("edit-title").value.trim();
  if (!title) return;
  const g = await store.getGame($("edit-id").value);
  g.title = title;
  g.folder = $("edit-folder").value.trim();
  g.favorite = $("edit-favorite").checked;
  await store.putGame(g);
  $("edit-game").close();
  await refresh();
});
$("settings-open").onclick = () => {
  $("drive-client").value = driveConfig.clientId || "";
  $("drive-key").value = driveConfig.apiKey || "";
  $("drive-project").value = driveConfig.project || "";
  $("settings").showModal();
};
$("save-drive").onclick = handle(async () => {
  const config = {
    clientId: $("drive-client").value.trim(),
    apiKey: $("drive-key").value.trim(),
    project: $("drive-project").value.trim(),
  };
  if (!validConfig(config))
    throw new Error("클라이언트 ID, API 키, 프로젝트 번호를 확인하세요.");
  disconnect();
  await store.setSetting("drive", config);
  driveConfig = config;
  $("settings").close();
  toast("Drive 설정을 저장했습니다.");
  await prepareDrive();
});
$("disconnect-drive").onclick = () => {
  disconnect();
  toast("이 브라우저의 Drive 연결을 해제했습니다.");
};
$("add-drive").onclick = handle(async () => {
  if (!validConfig(driveConfig)) {
    $("settings-open").click();
    return;
  }
  const file = await pickGame(driveConfig);
  if (file) await addFiles([file], "drive");
});
$("save-state").onclick = handle(() => save());
$("exit-game").onclick = handle(exit);
$("pause-game").onclick = handle(pause);
$("touch-pad").onclick = handle(() => rpc("touch"));
$("speed").onchange = handle((e) => rpc("speed", { value: e.target.value }));
$("shader").onchange = handle((e) => rpc("shader", { value: e.target.value }));
$("fullscreen").onclick = handle(async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if ($("screen").requestFullscreen) await $("screen").requestFullscreen();
  else toast("이 브라우저에서는 전체화면 버튼을 지원하지 않습니다.");
});
let rewinding = false;
$("rewind").addEventListener(
  "pointerdown",
  handle(async (e) => {
    e.preventDefault();
    $("rewind").setPointerCapture(e.pointerId);
    rewinding = true;
    await rpc("rewind", { active: true });
  }),
);
const endRewind = handle(async () => {
  if (rewinding) {
    rewinding = false;
    await rpc("rewind", { active: false });
  }
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  $("rewind").addEventListener(event, endRewind);
$("new-profile").onclick = handle(async () => {
  const name = await askName("새 세이브 프로필");
  if (!name) return;
  if (current.profiles.includes(name))
    throw new Error("같은 이름의 프로필이 있습니다.");
  if (stateSupported) await save("프로필 전환 전 저장");
  current.profiles.push(name);
  current.lastProfile = name;
  await store.putGame(current);
  const id = current.id;
  await exit();
  await launch(id);
});
$("profile").onchange = handle(async (e) => {
  const target = e.target.value;
  if (target === profile) return;
  if (stateSupported) await save("프로필 전환 전 저장");
  current.lastProfile = target;
  await store.putGame(current);
  const id = current.id;
  await exit();
  await launch(id);
});
$("backup").onclick = handle(backup);
$("restore").onclick = () => $("backup-input").click();
$("backup-input").onchange = handle(async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > 256 * 1048576) throw new Error("백업 파일이 너무 큽니다.");
  const value = validateBackup(JSON.parse(await file.text()), current);
  await save("백업 가져오기 전 저장");
  const states = value.states.map((s) => ({
    ...s,
    id: crypto.randomUUID(),
    romId: current.id,
    core: current.core,
    data: decode(s.data),
  }));
  await store.importStates(states);
  current.profiles = [
    ...new Set([...current.profiles, ...states.map((s) => s.profile)]),
  ];
  await store.putGame(current);
  renderProfiles();
  await renderStates();
  toast("백업을 추가했습니다. 기존 저장은 그대로 유지됩니다.");
});
$("export-srm").onclick = handle(async () =>
  download(
    await rpc("battery"),
    `${safeName(current.title)}-${safeName(profile)}.srm`,
  ),
);
$("import-srm").onclick = () => $("srm-input").click();
$("srm-input").onchange = handle(async (e) => {
  const blob = e.target.files[0];
  e.target.value = "";
  if (!blob) return;
  if (blob.size > 8 * 1048576 || !blob.size)
    throw new Error("게임 내 저장 파일 크기가 올바르지 않습니다.");
  await save("게임 내 저장 가져오기 전 백업");
  await rpc("importBattery", { blob });
  toast("게임 내 저장을 가져오고 게임을 재시작했습니다.");
});
$("screenshot").onclick = handle(async () =>
  download(
    await rpc("screenshot"),
    `${safeName(current.title)}-${Date.now()}.png`,
  ),
);
$("record-video").onclick = handle(async () => {
  $("record-video").textContent = (await rpc("record"))
    ? "녹화 마치기"
    : "영상 녹화";
});
$("save-hotkeys").onclick = handle(async () => {
  const next = {
    save: $("save-key").value.trim(),
    pause: $("pause-key").value.trim(),
  };
  if (
    !next.save ||
    !next.pause ||
    next.save === next.pause ||
    !/^F([1-9]|1[0-2])$/.test(next.save) ||
    !/^F([1-9]|1[0-2])$/.test(next.pause)
  )
    throw new Error("서로 다른 F1~F12 키를 입력하세요.");
  keys = next;
  await store.setSetting("hotkeys", keys);
  await rpc("keys", { keys });
  toast("단축키를 적용했습니다.");
});
$("record-macro").onclick = handle(async () => {
  const macro = await rpc("macroRecord");
  if (macro) await storeMacro(macro);
  else {
    macroRecording = true;
    $("record-macro").textContent = "입력 기록 마치기";
    $("player").focus();
    toast("게임을 조작한 뒤 기록 마치기를 누르세요.");
  }
});
$("play-macro").onclick = handle(async () => {
  const macro = current.macros[Number($("macros").value)];
  if (macro) await rpc("macroPlay", { macro });
});
$("stop-macro").onclick = handle(() => rpc("macroStop"));
$("name-cancel").onclick = () => $("name-dialog").close();
window.addEventListener(
  "keydown",
  handle(async (e) => {
    if (!started || document.querySelector("dialog[open]")) return;
    const action = hotkeyAction(e, keys);
    if (action) {
      e.preventDefault();
      e.stopImmediatePropagation();
      await (action === "save" ? save() : pause());
    }
  }),
  true,
);
window.addEventListener("beforeunload", (e) => {
  if (started) {
    e.preventDefault();
    e.returnValue = "";
  }
});
try {
  await store.openStore();
  keys = (await store.setting("hotkeys")) || keys;
  driveConfig = (await store.setting("drive")) || {};
  await refresh();
  if (validConfig(driveConfig)) prepareDrive().catch((e) => toast(e.message));
} catch (e) {
  toast(`브라우저 저장소를 열지 못했습니다: ${e.message}`);
  $("add-local").disabled = true;
}
