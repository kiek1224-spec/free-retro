const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
let database;
export async function openStore() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const req = indexedDB.open("free-retro-library", 2);
      req.onupgradeneeded = () => {
        for (const name of ["games", "states", "settings", "outbox"])
          if (!req.result.objectStoreNames.contains(name))
            req.result.createObjectStore(name, { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(new Error("다른 탭을 닫고 다시 시도하세요."));
    });
  return database;
}
async function write(store, records) {
  const db = await openStore();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    for (const record of records) tx.objectStore(store).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error || new Error("저장을 완료하지 못했습니다."));
  });
}
export async function allGames() {
  const db = await openStore();
  return request(db.transaction("games").objectStore("games").getAll());
}
export async function getGame(id) {
  const db = await openStore();
  return request(db.transaction("games").objectStore("games").get(id));
}
export async function putGame(game) {
  await write("games", [game]);
}
export async function statesFor(romId, profile) {
  const db = await openStore();
  const all = await request(
    db.transaction("states").objectStore("states").getAll(),
  );
  return all
    .filter((s) => s.romId === romId && (!profile || s.profile === profile))
    .sort((a, b) => b.created - a.created);
}
export async function putState(state) {
  if (!(state.data instanceof Blob) || !state.data.size)
    throw new Error("빈 저장 상태입니다.");
  state.syncId ||= crypto.randomUUID();
  const db = await openStore();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["states", "outbox"], "readwrite");
    tx.objectStore("states").put(state);
    if (!state.cloudSaved) tx.objectStore("outbox").put(state);
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function importStates(states) {
  for (const state of states) await putState(state);
}
export async function pendingStates() {
  const db = await openStore();
  return request(db.transaction("outbox").objectStore("outbox").getAll());
}
export async function acknowledge(id, syncId) {
  const db = await openStore();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["outbox", "states", "settings"], "readwrite");
    tx.objectStore("settings").put({ id: `seen:${syncId}`, value: true });
    for (const name of ["outbox", "states"]) {
      const target = tx.objectStore(name),
        req = target.get(id);
      req.onsuccess = () => {
        if (req.result?.syncId !== syncId) return;
        if (name === "outbox") target.delete(id);
        else target.put({ ...req.result, cloudSaved: true });
      };
    }
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function hasSnapshot(syncId) {
  return !!(await setting(`seen:${syncId}`));
}
export async function receive(state) {
  const game = await getGame(state.romId);
  if (game && game.core !== state.core)
    throw new Error("이 ROM의 코어와 클라우드 저장 코어가 다릅니다.");
  const db = await openStore();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["states", "settings"], "readwrite");
    tx.objectStore("states").put(state);
    tx.objectStore("settings").put({ id: `seen:${state.syncId}`, value: true });
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function enqueueExisting() {
  const db = await openStore();
  const states = await request(
    db.transaction("states").objectStore("states").getAll(),
  );
  for (const state of states) if (!state.cloudSaved) await putState(state);
}
export async function setting(id) {
  const db = await openStore();
  return (
    await request(db.transaction("settings").objectStore("settings").get(id))
  )?.value;
}
export async function setSetting(id, value) {
  await write("settings", [{ id, value }]);
}
