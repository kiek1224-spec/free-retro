import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEMS } from "../app/model.js";
import {
  PLATFORM_GROUPS,
  planImport,
  mergeImportedGame,
  validateFolderName,
} from "../app/library.js";

const file = (name, path = "") => ({ name, webkitRelativePath: path });

test("platform sidebar describes every supported system exactly once", () => {
  const platforms = PLATFORM_GROUPS.flatMap((group) => group.platforms);
  assert.deepEqual(
    platforms.map((platform) => platform.core).sort(),
    Object.keys(SYSTEMS).sort(),
  );
  for (const platform of platforms) {
    assert.ok(platform.name.trim());
    assert.ok(["console", "handheld", "disc", "sega"].includes(platform.icon));
  }
});

test("directory import keeps original files and paths, skipping docs and artwork", () => {
  const nes = file("Mario.NES", "Retro/Nintendo/Mario.NES"),
    gba = file("Test.gba", "Retro/Portable/Test.gba"),
    plan = planImport([
      nes,
      file("README.txt", "Retro/README.txt"),
      gba,
      file("cover.png", "Retro/Portable/cover.png"),
    ]);
  assert.deepEqual(plan.items, [
    { file: nes, core: "nes" },
    { file: gba, core: "gba" },
  ]);
  assert.equal(plan.items[0].file, nes);
  assert.equal(plan.items[0].file.webkitRelativePath, "Retro/Nintendo/Mario.NES");
  assert.deepEqual(plan.skipped, ["README.txt", "cover.png"]);
  assert.equal(plan.suggestedFolder, "Retro");
});

test("plain selection, mixed directory roots, and empty selection do not invent a folder", () => {
  assert.equal(planImport([file("Game.nes")]).suggestedFolder, "");
  assert.equal(
    planImport([file("a.nes", "NES/a.nes"), file("b.gba", "GBA/b.gba")])
      .suggestedFolder,
    "",
  );
  assert.equal(
    planImport([file("a.nes", "NES/a.nes"), file("b.nes")]).suggestedFolder,
    "",
  );
  assert.deepEqual(planImport([]), {
    items: [],
    skipped: [],
    suggestedFolder: "",
  });
});

test("unsupported multi-file disc inputs are skipped rather than sent to a core", () => {
  const plan = planImport([
    file("Disc.cue"),
    file("Disc.bin"),
    file("Disc.chd"),
    file("installer.exe"),
  ]);
  assert.deepEqual(plan.items.map((item) => item.core), ["psx"]);
  assert.deepEqual(plan.skipped, ["Disc.cue", "Disc.bin", "installer.exe"]);
});

test("duplicate import updates folder and artwork while preserving saves and personal settings", () => {
  const blob = new Blob(["existing ROM"]),
    artwork = new Blob(["old cover"]),
    newArtwork = new Blob(["new cover"]),
    old = {
      id: "same-hash",
      title: "My translated title",
      core: "nes",
      blob,
      folder: "Old",
      artwork,
      profiles: ["기본", "번역 테스트"],
      macros: [{ name: "Jump", events: [] }],
      rtc: { 기본: 123 },
      states: ["state-id"],
      lastPlayed: 42,
      added: 10,
      favorite: true,
      source: "drive",
    },
    fresh = {
      id: "same-hash",
      title: "Original title",
      core: "gba",
      blob: new Blob(["duplicate ROM"]),
      folder: " New collection ",
      artwork: newArtwork,
      profiles: ["기본"],
      macros: [],
      rtc: {},
      lastPlayed: 0,
      added: 99,
      favorite: false,
      source: "local",
    },
    merged = mergeImportedGame(old, fresh);
  assert.deepEqual(merged, { ...old, folder: "New collection", artwork: newArtwork });
  assert.equal(merged.blob, blob);
  assert.equal(merged.profiles, old.profiles);
  assert.equal(old.folder, "Old");
  assert.equal(old.artwork, artwork);
});

test("duplicate import without explicit folder or artwork retains both originals", () => {
  const old = { id: "rom", folder: "RPG", artwork: "old", custom: "keep" };
  assert.deepEqual(
    mergeImportedGame(old, { id: "rom", folder: "  ", artwork: null }),
    old,
  );
  const fresh = { id: "new", folder: "RPG", profiles: ["기본"] };
  assert.deepEqual(mergeImportedGame(null, fresh), fresh);
  assert.notEqual(mergeImportedGame(null, fresh), fresh);
});

test("collection names are trimmed, length bounded, and reject hidden control characters", () => {
  assert.equal(validateFolderName("  한글 RPG  "), "한글 RPG");
  assert.equal(validateFolderName(""), "");
  assert.equal(validateFolderName("x".repeat(80)).length, 80);
  assert.throws(() => validateFolderName("x".repeat(81)));
  assert.throws(() => validateFolderName("hidden\nname"));
  assert.throws(() => validateFolderName("hidden\u0000name"));
  assert.throws(() => validateFolderName(null));
});
