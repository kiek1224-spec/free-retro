import test from "node:test";
import assert from "node:assert/strict";
import {
  coreFor,
  romId,
  filterGames,
  validateBackup,
  hotkeyAction,
} from "../app/model.js";
import { validConfig } from "../app/drive.js";
test("same content has same save identity, changed ROM never shares saves", async () => {
  const a = new Blob(["test ROM"]);
  assert.equal(await romId(a), await romId(new Blob(["test ROM"])));
  assert.notEqual(await romId(a), await romId(new Blob(["test ROM patched"])));
});
test("ambiguous multi-file disc and unknown inputs are rejected", () => {
  assert.equal(coreFor("GAME.GBC"), "gb");
  assert.equal(coreFor("game.chd"), "psx");
  assert.throws(() => coreFor("game.cue"));
  assert.throws(() => coreFor("game.exe"));
});
test("smart folders combine filters without losing unplayed items", () => {
  const games = [
    {
      id: "a",
      title: "한국 RPG",
      folder: "RPG",
      favorite: true,
      added: 1,
      lastPlayed: 0,
    },
    {
      id: "b",
      title: "한국 액션",
      folder: "ACT",
      favorite: true,
      added: 2,
      lastPlayed: 3,
    },
  ];
  assert.deepEqual(
    filterGames(games, { search: "한국", view: "favorite", folder: "RPG" }).map(
      (g) => g.id,
    ),
    ["a"],
  );
  assert.deepEqual(
    filterGames(games, { view: "unplayed" }).map((g) => g.id),
    ["a"],
  );
  assert.deepEqual(
    filterGames(games, { view: "recent" }).map((g) => g.id),
    ["b"],
  );
});
test("backup rejects other ROM or core before importing bytes", () => {
  const game = { id: "abc", core: "nes" },
    value = {
      format: "free-retro-backup",
      version: 1,
      romId: "abc",
      core: "nes",
      states: [
        { id: "1", profile: "기본", label: "manual", created: 1, data: "AQID" },
      ],
    };
  assert.equal(validateBackup(value, game), value);
  assert.throws(() => validateBackup({ ...value, romId: "def" }, game));
  assert.throws(() => validateBackup({ ...value, core: "snes" }, game));
  assert.throws(() =>
    validateBackup(
      { ...value, states: [{ ...value.states[0], data: "<script>" }] },
      game,
    ),
  );
});
test("typing, modifier keys and repeated keys never trigger save", () => {
  const keys = { save: "F1", pause: "F2" },
    event = { key: "F1", target: { tagName: "DIV" } };
  assert.equal(hotkeyAction(event, keys), "save");
  assert.equal(
    hotkeyAction({ ...event, target: { tagName: "INPUT" } }, keys),
    null,
  );
  assert.equal(hotkeyAction({ ...event, repeat: true }, keys), null);
  assert.equal(hotkeyAction({ ...event, ctrlKey: true }, keys), null);
});
test("Drive configuration cannot accidentally contain a client secret", () => {
  assert.ok(
    validConfig({
      clientId: "123-example.apps.googleusercontent.com",
      apiKey: "example",
      project: "123",
    }),
  );
  assert.equal(
    validConfig({ clientId: "client-secret", apiKey: "x", project: "123" }),
    false,
  );
  assert.equal(
    validConfig({
      clientId: "123.apps.googleusercontent.com",
      apiKey: "x",
      project: "not-a-number",
    }),
    false,
  );
});
