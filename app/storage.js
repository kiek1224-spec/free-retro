const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
let database;
export async function openStore() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const req = indexedDB.open("free-retro-library", 1);
      req.onupgradeneeded = () => {
        for (const name of ["games", "states", "settings"])
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
  await write("states", [state]);
}
export async function importStates(states) {
  await write("states", states);
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
