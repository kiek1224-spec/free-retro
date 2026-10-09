import { SYSTEMS, romId } from "./model.js";
import { planImport, mergeImportedGame, validateFolderName } from "./library.js";
import { normalizeArtwork } from "./artwork.js";

export function createLibraryUI({ $, store, handle, toast, getGames, refresh, getDriveConfig, pickGame, validConfig }) {
  let items = [], skipped = 0, revision = 0, busy = false, sourceBusy = false;
  let artworkBusy = false, artTarget, editRevision = 0, editArtwork, artworkChanged = false, sourceRequest = 0;
  let previewURLs = [], editURL;
  let ignoredCloseEvents = 0;
  const importDialog = $("import-game"), editDialog = $("edit-game");
  const makeButton = (label, action) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.onclick = action;
    return el;
  };
  const makeOption = (label, value = label) => {
    const el = document.createElement("option");
    el.textContent = label; el.value = value;
    return el;
  };
  function folders() {
    return [...new Set(getGames().map(g => g.folder).filter(Boolean))].sort();
  }
  function updateLocks() {
    const locked = busy || sourceBusy || artworkBusy;
    for (const id of ["choose-files", "choose-directory", "choose-drive", "import-folder", "import-new-folder"])
      $(id).disabled = locked;
    $("import-cancel").disabled = busy || artworkBusy;
    $("import-save").disabled = locked || !items.length;
    for (const el of $("import-list").querySelectorAll("button")) el.disabled = locked;
    for (const id of ["edit-save", "edit-artwork", "edit-artwork-reset", "edit-cancel"]) $(id).disabled = artworkBusy || busy;
  }
  function chooseFolder(name) {
    const existing = folders();
    $("import-folder").replaceChildren(makeOption("미분류", ""), ...existing.map(f => makeOption(f, `folder:${f}`)), makeOption("＋ 새 폴더 만들기", "__new__"));
    $("import-folder").value = name && !existing.includes(name) ? "__new__" : name ? `folder:${name}` : "";
    $("import-new-folder").value = name || "";
    showNewFolder();
  }
  function showNewFolder() {
    const isNew = $("import-folder").value === "__new__";
    $("new-folder-label").hidden = !isNew;
    $("import-new-folder").required = isNew;
  }
  function openImport() {
    if (importDialog.open) return;
    items = []; skipped = 0; revision++;
    chooseFolder($("folder-filter").value);
    renderItems(); importDialog.showModal();
  }
  function renderItems(message) {
    for (const url of previewURLs) URL.revokeObjectURL(url);
    previewURLs = [];
    $("import-list").replaceChildren();
    $("import-status").textContent = message || (items.length ? `${items.length}개 게임 선택${skipped ? ` · ROM 이외 ${skipped}개 파일 제외` : ""}` : "선택한 게임이 없습니다.");
    for (const item of items) {
      const row = document.createElement("article"); row.className = "import-item";
      const img = document.createElement("img"); img.alt = `${item.file.name} 표지`;
      img.src = item.artwork ? URL.createObjectURL(item.artwork) : "app/assets/cartridge.svg";
      if (item.artwork) previewURLs.push(img.src);
      const text = document.createElement("div"); text.className = "import-item-info";
      const title = document.createElement("b"); title.textContent = item.file.name;
      const meta = document.createElement("small");
      meta.textContent = `${SYSTEMS[item.core]} · ${(item.file.size / 1048576).toFixed(1)} MB`;
      text.append(title, meta);
      if (item.error) { const error = document.createElement("p"); error.className = "import-error"; error.textContent = item.error; text.append(error); }
      const actions = document.createElement("div"); actions.className = "import-item-actions";
      actions.append(makeButton(item.artwork ? "표지 변경" : "아트워크 선택", () => chooseArt({ type: "import", item, revision })));
      if (item.artwork) actions.append(makeButton("기본 표지", () => { delete item.artwork; renderItems(); }));
      row.append(img, text, actions); $("import-list").append(row);
    }
    updateLocks();
  }
  function stageFiles(files, source = "local") {
    if (busy || artworkBusy || (sourceBusy && source !== "drive")) throw new Error("현재 작업이 끝난 뒤 선택하세요.");
    openImport();
    const plan = planImport(files);
    items = plan.items.map(item => ({ ...item, source })); skipped = plan.skipped.length; revision++;
    if (plan.suggestedFolder) chooseFolder(plan.suggestedFolder);
    renderItems(plan.items.length ? undefined : "지원하는 ROM 파일이 없습니다. 압축을 풀고 ROM 파일을 선택하세요.");
  }
  async function chooseDrive() {
    if (busy || sourceBusy || artworkBusy) return;
    if (!validConfig(getDriveConfig())) {
      toast("설정에서 Google Drive 클라이언트 ID와 API 키를 먼저 입력하세요.");
      return;
    }
    sourceBusy = true; updateLocks();
    const session = revision, request = ++sourceRequest;
    // Google's Picker lives outside our dialog. Temporarily leave the modal
    // top layer so its iframe can receive input, while preserving this draft.
    ignoredCloseEvents++;
    importDialog.close();
    importDialog.classList.add("drive-picker-active");
    importDialog.show();
    $("library").inert = true;
    document.querySelector(".topbar").inert = true;
    try {
      const file = await pickGame(getDriveConfig());
      if (file && importDialog.open && revision === session) stageFiles([file], "drive");
    } finally {
      if (sourceRequest === request) {
        sourceBusy = false;
        releasePicker();
        if (importDialog.open) {
          ignoredCloseEvents++;
          importDialog.close();
          importDialog.showModal();
        }
        updateLocks();
      }
    }
  }
  function releasePicker() {
    importDialog.classList.remove("drive-picker-active");
    $("library").inert = false;
    document.querySelector(".topbar").inert = false;
  }
  async function commitImport(event) {
    event.preventDefault();
    if (busy || sourceBusy || artworkBusy || !items.length) return;
    let folder = $("import-folder").value;
    if (folder === "__new__") {
      folder = validateFolderName($("import-new-folder").value);
      if (!folder) throw new Error("새 폴더 이름을 입력하세요.");
    } else if (folder.startsWith("folder:")) folder = validateFolderName(folder.slice(7));
    busy = true; updateLocks();
    let added = 0, updated = 0, duplicate = 0;
    const failures = [];
    try {
      for (const item of items) {
        try {
          const { file, core, source, artwork } = item;
          if (!file.size) throw new Error("빈 ROM 파일입니다.");
          if (file.size > 512 * 1048576) throw new Error("512 MB 이하의 단일 ROM 파일을 선택하세요.");
          const id = await romId(file), old = await store.getGame(id);
          const fresh = { id, title: file.name.replace(/\.[^.]+$/, ""), filename: file.name, core, blob: file,
            size: file.size, source, folder, favorite: false, added: Date.now(), lastPlayed: 0, profiles: ["기본"], macros: [], ...(artwork ? { artwork } : {}) };
          if (old && !folder && !artwork) { duplicate++; continue; }
          await store.putGame(mergeImportedGame(old, fresh));
          if (old) updated++; else added++;
        } catch (error) { item.error = error.message; failures.push(item); }
      }
      await refresh();
      const report = `${added}개 추가 · ${updated}개 정리 · 중복 ${duplicate}개 유지`;
      if (failures.length) { items = failures; renderItems(`${report} · 실패 ${failures.length}개, 아래 파일을 다시 시도하세요.`); }
      else { importDialog.close(); toast(report); }
      navigator.storage?.persist?.().catch(() => {});
    } finally { busy = false; updateLocks(); }
  }
  function editGame(id) {
    const g = getGames().find(game => game.id === id);
    if (!g) return;
    editRevision++; artworkChanged = false; editArtwork = g.artwork;
    $("edit-id").value = id; $("edit-title").value = g.title;
    $("edit-folder").value = g.folder || ""; $("edit-favorite").checked = !!g.favorite;
    $("folder-options").replaceChildren(...folders().map(f => makeOption(f)));
    $("edit-folder").setAttribute("list", "folder-options");
    editPreview(); editDialog.showModal();
  }
  function editPreview() {
    if (editURL) URL.revokeObjectURL(editURL);
    editURL = editArtwork ? URL.createObjectURL(editArtwork) : undefined;
    $("edit-artwork-preview").src = editURL || "app/assets/cartridge.svg";
  }
  function chooseArt(target) {
    if (busy || sourceBusy || artworkBusy) return;
    artTarget = target; $("artwork-input").value = ""; $("artwork-input").click();
  }
  $("artwork-input").onchange = handle(async event => {
    const file = event.target.files[0], target = artTarget;
    if (!file || !target) return;
    artworkBusy = true; updateLocks();
    try {
      const blob = await normalizeArtwork(file);
      if (target.type === "import" && importDialog.open && revision === target.revision && items.includes(target.item)) {
        target.item.artwork = blob; renderItems();
      } else if (target.type === "edit" && editDialog.open && editRevision === target.revision && $("edit-id").value === target.id) {
        editArtwork = blob; artworkChanged = true; editPreview();
      }
    } finally { artworkBusy = false; artTarget = undefined; event.target.value = ""; updateLocks(); }
  });
  $("edit-artwork").onclick = () => chooseArt({ type: "edit", id: $("edit-id").value, revision: editRevision });
  $("edit-artwork-reset").onclick = () => { editArtwork = undefined; artworkChanged = true; editPreview(); };
  $("edit-form").onsubmit = handle(async event => {
    event.preventDefault();
    if (artworkBusy || busy) return;
    const title = $("edit-title").value.trim();
    if (!title) throw new Error("게임 이름을 입력하세요.");
    const folder = validateFolderName($("edit-folder").value);
    const id = $("edit-id").value, session = editRevision;
    busy = true; updateLocks();
    try {
      const g = await store.getGame(id);
      if (!g || session !== editRevision || !editDialog.open) return;
      g.title = title; g.folder = folder; g.favorite = $("edit-favorite").checked;
      if (artworkChanged) { if (editArtwork) g.artwork = editArtwork; else delete g.artwork; }
      await store.putGame(g); editDialog.close(); await refresh(); toast("게임 정보를 저장했습니다.");
    } finally { busy = false; updateLocks(); }
  });
  for (const dialog of [importDialog, editDialog]) dialog.addEventListener("cancel", event => {
    if (busy || artworkBusy) event.preventDefault();
  });
  importDialog.addEventListener("close", () => {
    if (ignoredCloseEvents) { ignoredCloseEvents--; return; }
    releasePicker();
    revision++; sourceRequest++; items = []; artTarget = undefined; sourceBusy = false;
    for (const url of previewURLs) URL.revokeObjectURL(url); previewURLs = [];
    for (const id of ["rom-input", "directory-input"]) $(id).value = "";
    $("import-list").replaceChildren();
  });
  editDialog.addEventListener("close", () => { editRevision++; if (editURL) URL.revokeObjectURL(editURL); editURL = undefined; editArtwork = undefined; artTarget = undefined; });
  $("import-cancel").onclick = () => importDialog.close();
  $("edit-cancel").onclick = () => editDialog.close();
  $("import-form").onsubmit = handle(commitImport);
  $("import-folder").onchange = showNewFolder;
  $("choose-files").onclick = () => { $("rom-input").value = ""; $("rom-input").click(); };
  $("choose-directory").onclick = () => { $("directory-input").value = ""; $("directory-input").click(); };
  $("choose-drive").onclick = handle(chooseDrive);
  $("rom-input").onchange = handle(event => { if (event.target.files.length) stageFiles(event.target.files); });
  $("directory-input").onchange = handle(event => { if (event.target.files.length) stageFiles(event.target.files); });
  const directorySupported = "webkitdirectory" in $("directory-input");
  $("choose-directory").hidden = !directorySupported; $("directory-hint").hidden = directorySupported;
  return { openImport, stageFiles, editGame };
}
