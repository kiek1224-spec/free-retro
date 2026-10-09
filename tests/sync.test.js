import test from "node:test";
import assert from "node:assert/strict";
import { installClock } from "../app/clock.js";
import { packState, unpackState, createSynchronizer } from "../app/sync.js";
import { driveStore } from "../app/drive-store.js";
import { romId } from "../app/model.js";
const rom = await romId(new Blob(["original ROM"]));
const state = () => ({
  id: "rolling-auto",
  syncId: crypto.randomUUID(),
  romId: rom,
  core: "gba",
  profile: "개인",
  created: Date.now(),
  label: "자동 저장",
  device: "pc-1",
  rtcOffset: 86400000,
  data: new Blob(["core bytes"]),
  battery: new Blob(["SRAM bytes"]),
});
function memoryStore(initial = []) {
  const pending = new Map(initial.map((s) => [s.id, s])),
    saved = new Map(),
    seen = new Set();
  return {
    pending,
    saved,
    seen,
    async pendingStates() {
      return [...pending.values()];
    },
    async acknowledge(id, revision) {
      seen.add(revision);
      if (pending.get(id)?.syncId === revision) pending.delete(id);
    },
    async hasSnapshot(id) {
      return seen.has(id);
    },
    async receive(s) {
      saved.set(s.id, s);
      seen.add(s.syncId);
    },
  };
}
function memoryRemote() {
  const records = new Map();
  return {
    records,
    creates: 0,
    async list() {
      return [...records].map(([id, s]) => ({
        id,
        appProperties: { syncId: s.syncId, romId: s.romId },
      }));
    },
    async create(s) {
      this.creates++;
      records.set(s.syncId, s);
    },
    async read(id) {
      return records.get(id);
    },
  };
}
test("RTC advances, resets, and preserves Date parsing and explicit timestamps", () => {
  let real = 100000;
  class RealDate extends Date {
    static now() {
      return real;
    }
  }
  const scope = { Date: RealDate },
    clock = installClock(scope, 86400000);
  assert.equal(scope.Date.now(), real + 86400000);
  assert.equal(new scope.Date().getTime(), real + 86400000);
  real += 1200;
  assert.equal(clock.read().now, real + 86400000);
  assert.equal(new scope.Date(0).getTime(), 0);
  assert.equal(
    scope.Date.parse("2000-01-01T00:00:00Z"),
    Date.parse("2000-01-01T00:00:00Z"),
  );
  assert.equal(scope.Date(), new Date(real + 86400000).toString());
  clock.set(0);
  assert.equal(scope.Date.now(), real);
  assert.equal(RealDate.now(), real);
  assert.throws(() => clock.set(Infinity));
});
test("cloud roundtrip preserves real state, SRAM and profile RTC; detects corruption", async () => {
  const original = state(),
    packed = await packState(original),
    result = await unpackState(packed, rom);
  assert.equal(await result.data.text(), await original.data.text());
  assert.equal(await result.battery.text(), await original.battery.text());
  assert.equal(result.rtcOffset, 86400000);
  assert.equal(result.profile, "개인");
  await assert.rejects(() =>
    unpackState({ ...packed, romId: "f".repeat(64) }, rom),
  );
  await assert.rejects(() =>
    unpackState(
      { ...packed, state: { ...packed.state, bytes: btoa("corrupted") } },
      rom,
    ),
  );
});
test("concurrent devices keep both saves and repeated sync is idempotent", async () => {
  const a = state(),
    b = state(),
    remote = memoryRemote();
  b.device = "phone";
  const sa = memoryStore([a]),
    sb = memoryStore([b]);
  const syncA = createSynchronizer({ store: sa, remote }),
    syncB = createSynchronizer({ store: sb, remote });
  await Promise.all([syncA.run(rom), syncB.run(rom)]);
  await syncA.run(rom);
  await syncB.run(rom);
  assert.equal(remote.records.size, 2);
  assert.equal(remote.creates, 2);
  assert.equal(sa.saved.size, 1);
  assert.equal(sb.saved.size, 1);
  await syncA.run(rom);
  assert.equal(sa.saved.size, 1);
  assert.equal(remote.creates, 2);
});
test("lost upload response retries by remote revision without duplicating or losing queue", async () => {
  const remote = memoryRemote(),
    store = memoryStore([state()]),
    base = remote.create.bind(remote);
  let fail = true;
  remote.create = async (s) => {
    await base(s);
    if (fail) {
      fail = false;
      throw new Error("offline after commit");
    }
  };
  const sync = createSynchronizer({ store, remote });
  await assert.rejects(() => sync.run());
  assert.equal(store.pending.size, 1);
  await sync.run();
  assert.equal(store.pending.size, 0);
  assert.equal(remote.creates, 1);
});
test("acknowledging old automatic save cannot remove newer revision queued during upload", async () => {
  const original = state(),
    newer = state(),
    store = memoryStore([original]),
    remote = memoryRemote();
  remote.create = async (value) => {
    remote.records.set(value.syncId, value);
    store.pending.set(newer.id, newer);
  };
  await createSynchronizer({ store, remote }).run();
  assert.equal(store.pending.get(newer.id).syncId, newer.syncId);
});
test("offline or expired authorization never discards pending local save", async () => {
  const store = memoryStore([state()]);
  const remote = {
    async list() {
      const e = new Error("401");
      e.transport = true;
      throw e;
    },
  };
  await assert.rejects(() => createSynchronizer({ store, remote }).run());
  assert.equal(store.pending.size, 1);
});
test("Drive protocol uses private appdata, pagination and immutable multipart writes", async () => {
  const calls = [],
    responses = [
      { files: [{ id: "first" }], nextPageToken: "page2" },
      { files: [{ id: "second" }] },
      { id: "created" },
    ];
  const remote = driveStore({
    getToken: () => "test-only-token",
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    },
  });
  assert.equal((await remote.list()).length, 2);
  await remote.create(await packState(state()));
  assert.equal(
    new URL(calls[0].url).searchParams.get("spaces"),
    "appDataFolder",
  );
  assert.equal(new URL(calls[1].url).searchParams.get("pageToken"), "page2");
  const body = await calls[2].options.body.text();
  assert.match(body, /"parents":\["appDataFolder"\]/);
  assert.equal(calls[2].options.method, "POST");
  assert.ok(!body.includes("original ROM"));
  assert.equal(
    calls[2].options.headers.Authorization,
    "Bearer test-only-token",
  );
});
test("corrupt remote record is held aside; unavailable transport retries", async () => {
  const remote = memoryRemote(),
    s = state();
  await remote.create({ ...(await packState(s)), core: "bad-core" });
  const store = memoryStore(),
    sync = createSynchronizer({ store, remote });
  assert.equal((await sync.run(rom)).rejected.length, 1);
  assert.equal(store.seen.size, 0);
  remote.read = async () => {
    const e = new Error("offline");
    e.transport = true;
    throw e;
  };
  await assert.rejects(() => sync.run(rom));
  assert.equal(store.seen.size, 0);
});

test("launching a different ROM while syncing waits for its own download", async () => {
  const first = state(),
    second = { ...state(), romId: await romId(new Blob(["second ROM"])) };
  const remote = memoryRemote();
  await remote.create(await packState(first));
  await remote.create(await packState(second));
  const store = memoryStore();
  const sync = createSynchronizer({ store, remote });
  const results = await Promise.all([
    sync.run(first.romId),
    sync.run(second.romId),
  ]);
  assert.equal(results[0].downloaded[0].romId, first.romId);
  assert.equal(results[1].downloaded[0].romId, second.romId);
  assert.equal(store.saved.size, 2);
});
