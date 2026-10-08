import test from "node:test";
import assert from "node:assert/strict";
import { createLibraryUI } from "../app/library-ui.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function harness(pickGame) {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const closeEvents = [], nodes = new Map(), errors = [];
  class Element extends EventTarget {
    constructor(tag = "div") {
      super();
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.value = "";
      this.textContent = "";
      this.disabled = false;
      this.inert = false;
      this.open = false;
      this.modal = false;
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this[name] = value; }
    querySelectorAll(selector) {
      assert.equal(selector, "button");
      const descend = element => element.children.flatMap(child => [...(child.tagName === "BUTTON" ? [child] : []), ...descend(child)]);
      return descend(this);
    }
    showModal() { assert.equal(this.open, false, "close a nonmodal dialog before restoring modal mode"); this.open = true; this.modal = true; }
    show() { assert.equal(this.open, false); this.open = true; this.modal = false; }
    close() {
      if (!this.open) return;
      this.open = false; this.modal = false;
      // Native dialog close events are queued, not dispatched synchronously.
      closeEvents.push(() => this.dispatchEvent(new Event("close")));
    }
  }
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, new Element(id.endsWith("game") ? "dialog" : "div"));
    return nodes.get(id);
  };
  $("directory-input").webkitdirectory = true;
  const topbar = new Element("header");
  globalThis.document = {
    createElement: tag => new Element(tag),
    querySelector(selector) { assert.equal(selector, ".topbar"); return topbar; },
  };
  const ui = createLibraryUI({
    $, store: new Proxy({}, { get() { assert.fail("Picker cancellation tests must not access persisted games or saves"); } }),
    handle: action => async event => { try { await action(event); } catch (error) { errors.push(error.message); } },
    toast: message => errors.push(message), getGames: () => [],
    refresh: async () => assert.fail("Cancelled Picker must not change the library"),
    getDriveConfig: () => ({ clientId: "test" }), validConfig: () => true, pickGame,
  });
  return {
    $, ui, topbar, errors,
    flushCloseEvents() { while (closeEvents.length) closeEvents.shift()(); },
    assertPickerMode() {
      assert.equal($("import-game").open, true);
      assert.equal($("import-game").modal, false);
      assert.equal($("import-game").classList.contains("drive-picker-active"), true);
      assert.equal($("library").inert, true);
      assert.equal(topbar.inert, true);
      assert.equal($("choose-files").disabled, true);
      assert.equal($("import-cancel").disabled, false);
    },
    assertModalMode() {
      assert.equal($("import-game").open, true);
      assert.equal($("import-game").modal, true);
      assert.equal($("import-game").classList.contains("drive-picker-active"), false);
      assert.equal($("library").inert, false);
      assert.equal(topbar.inert, false);
      assert.equal($("choose-files").disabled, false);
      assert.equal($("import-cancel").disabled, false);
    },
    restore() {
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else delete globalThis.document;
    },
  };
}

test("Drive Picker CANCEL restores modal mode after queued transition-close events", async () => {
  const picker = deferred(), h = harness(() => picker.promise);
  try {
    h.ui.openImport();
    const pending = h.$("choose-drive").onclick({});
    h.assertPickerMode();
    h.flushCloseEvents();
    h.assertPickerMode();
    picker.resolve(null);
    await pending;
    h.assertModalMode();
    h.flushCloseEvents();
    h.assertModalMode();
    assert.deepEqual(h.errors, []);
  } finally { h.restore(); }
});

test("Drive Picker error restores modal mode and releases background inert state", async () => {
  const picker = deferred(), h = harness(() => picker.promise);
  try {
    h.ui.openImport();
    const pending = h.$("choose-drive").onclick({});
    h.assertPickerMode();
    h.flushCloseEvents();
    picker.reject(new Error("Google Picker test failure"));
    await pending;
    h.flushCloseEvents();
    h.assertModalMode();
    assert.deepEqual(h.errors, ["Google Picker test failure"]);
  } finally { h.restore(); }
});

test("explicit cancellation discards the old request; its late return cannot unlock or close a new Picker session", async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const h = harness(() => (++calls === 1 ? first.promise : second.promise));
  try {
    h.ui.openImport();
    const oldPending = h.$("choose-drive").onclick({});
    h.flushCloseEvents();
    h.assertPickerMode();
    h.$("rom-input").value = "old-selection";
    h.$("directory-input").value = "old-directory";
    h.$("import-cancel").onclick();
    h.flushCloseEvents();
    assert.equal(h.$("import-game").open, false);
    assert.equal(h.$("library").inert, false);
    assert.equal(h.topbar.inert, false);
    assert.equal(h.$("rom-input").value, "");
    assert.equal(h.$("directory-input").value, "");

    h.ui.openImport();
    h.$("import-folder").value = "__new__";
    h.$("import-new-folder").value = "새 세션 폴더";
    h.$("import-folder").onchange();
    const newPending = h.$("choose-drive").onclick({});
    h.flushCloseEvents();
    h.assertPickerMode();
    first.resolve(null);
    await oldPending;
    h.flushCloseEvents();
    h.assertPickerMode();
    assert.equal(h.$("import-new-folder").value, "새 세션 폴더");
    assert.equal(h.$("import-new-folder").required, true);

    second.resolve(null);
    await newPending;
    h.flushCloseEvents();
    h.assertModalMode();
    assert.equal(h.$("import-new-folder").value, "새 세션 폴더");
    assert.deepEqual(h.errors, []);
  } finally { h.restore(); }
});
