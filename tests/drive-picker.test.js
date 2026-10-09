import test from "node:test";
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { pickGame, disconnect } from "../app/drive.js";

const config = {
  clientId: "example.apps.googleusercontent.com",
  apiKey: "picker-key",
  project: "123",
};

function mockPicker(fetchImpl, action = "picked") {
  const names = ["fetch", "window", "google", "location", "File", "setTimeout", "clearTimeout"];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const timers = [], cleared = [], settings = {};
  class DocsView {
    setIncludeFolders(value) { settings.includeFolders = value; return this; }
    setSelectFolderEnabled(value) { settings.selectFolderEnabled = value; return this; }
  }
  class PickerBuilder {
    addView() { return this; }
    setOAuthToken(value) { settings.token = value; return this; }
    setDeveloperKey(value) { settings.key = value; return this; }
    setAppId(value) { settings.project = value; return this; }
    setOrigin(value) { settings.origin = value; return this; }
    setCallback(callback) { this.callback = callback; return this; }
    build() {
      return { setVisible: visible => {
        assert.equal(visible, true);
        queueMicrotask(() => this.callback({ action, docs: [{ id: "file / ?#", name: "Original.nes" }] }));
      } };
    }
  }
  const fakeGoogle = {
    accounts: { oauth2: {
      initTokenClient(options) {
        return { requestAccessToken() {
          queueMicrotask(() => options.callback({ access_token: "picker-session", expires_in: 3600, scope: options.scope }));
        } };
      },
      revoke() {},
    } },
    picker: { DocsView, PickerBuilder, ViewId: { DOCS: "docs" }, Action: { PICKED: "picked", CANCEL: "cancel" } },
  };
  Object.assign(globalThis, {
    window: { google: fakeGoogle }, google: fakeGoogle,
    location: { origin: "http://127.0.0.1:8197" }, File,
    fetch: fetchImpl,
    setTimeout(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout(timer) { cleared.push(timer); },
  });
  disconnect();
  return {
    timers, cleared, settings,
    restore() {
      disconnect();
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

async function until(check) {
  for (let i = 0; i < 30; i++) {
    if (check()) return;
    await Promise.resolve();
  }
  assert.fail("The mocked download did not start");
}

function awaitAbort(signal) {
  return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

test("picked ROM downloads exact bytes through GET and clears the timeout", async () => {
  const bytes = Uint8Array.of(78, 69, 83, 26, 0, 255, 127);
  let request;
  const mock = mockPicker(async (url, options) => {
    request = { url, options };
    return new Response(bytes, { status: 200 });
  });
  try {
    const file = await pickGame(config);
    assert.ok(file instanceof File);
    assert.equal(file.name, "Original.nes");
    assert.equal(file.type, "application/octet-stream");
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
    assert.equal(request.url, "https://www.googleapis.com/drive/v3/files/file%20%2F%20%3F%23?alt=media");
    assert.equal(request.options.method || "GET", "GET");
    assert.equal(request.options.headers.Authorization, "Bearer picker-session");
    assert.equal(request.options.signal.aborted, false);
    assert.equal(mock.timers.length, 1);
    assert.equal(mock.timers[0].delay, 30000);
    assert.deepEqual(mock.cleared, mock.timers);
    assert.equal(mock.settings.selectFolderEnabled, false);
    assert.equal(mock.settings.origin, "http://127.0.0.1:8197");
  } finally { mock.restore(); }
});

test("Picker cancellation does not download a file or allocate a download timer", async () => {
  let downloads = 0;
  const mock = mockPicker(async () => { downloads++; assert.fail("Cancelled Picker must not fetch"); }, "cancel");
  try {
    assert.equal(await pickGame(config), null);
    assert.equal(downloads, 0);
    assert.deepEqual(mock.timers, []);
    assert.deepEqual(mock.cleared, []);
  } finally { mock.restore(); }
});

for (const phase of ["request", "body"]) {
  test(`download timeout aborts the pending ${phase}, reports timeout and clears its timer`, async () => {
    let signal, bodyStarted = false;
    const mock = mockPicker(async (url, options) => {
      signal = options.signal;
      if (phase === "request") return awaitAbort(signal);
      return { ok: true, async blob() { bodyStarted = true; return awaitAbort(signal); } };
    });
    try {
      const pending = pickGame(config);
      const rejected = assert.rejects(pending, /Drive 다운로드 시간이 초과됐습니다/);
      await until(() => signal && (phase === "request" || bodyStarted));
      assert.equal(mock.timers.length, 1);
      assert.equal(mock.timers[0].delay, 30000);
      mock.timers[0].callback();
      await rejected;
      assert.equal(signal.aborted, true);
      assert.deepEqual(mock.cleared, mock.timers);
    } finally { mock.restore(); }
  });
}
