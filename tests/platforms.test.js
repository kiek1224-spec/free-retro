import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { coreFor, SYSTEMS } from "../app/model.js";
import { PLATFORM_GROUPS, planImport, mergeImportedGame } from "../app/library.js";

const additions = [
  { system: "atari2600", core: "stella2014", extensions: ["a26"] },
  { system: "atari7800", core: "prosystem", extensions: ["a78"] },
  { system: "jaguar", core: "virtualjaguar", extensions: ["j64", "jag"] },
  { system: "sega32x", core: "picodrive", extensions: ["32x"] },
  { system: "vb", core: "beetle_vb", extensions: ["vb", "vboy"] },
  { system: "pce", core: "mednafen_pce", extensions: ["pce"] },
  { system: "ngp", core: "mednafen_ngp", extensions: ["ngp", "ngc"] },
  { system: "ws", core: "mednafen_wswan", extensions: ["ws", "wsc", "pc2"] },
];
const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root));

test("all new unambiguous cartridge extensions map to the requested platform regardless of case", () => {
  for (const { system, extensions } of additions)
    for (const extension of extensions) {
      assert.equal(coreFor(`A game with dots.v1.${extension}`), system);
      assert.equal(coreFor(`A GAME.${extension.toUpperCase()}`), system);
    }
  assert.equal(Object.keys(SYSTEMS).length, 18);
  const listed = PLATFORM_GROUPS.flatMap((group) => group.platforms.map((platform) => platform.core));
  assert.equal(new Set(listed).size, 18);
  assert.deepEqual(listed.sort(), Object.keys(SYSTEMS).sort());
});

test("new platforms do not turn generic executables, raw ROMs or archives into guessed consoles", () => {
  for (const extension of ["bin", "rom", "zip", "7z", "abs", "cof", "exe", "cue"])
    assert.throws(() => coreFor(`Unidentified.${extension}`), /지원하지 않는 파일/);
  for (const extension of ["chd", "iso", "img", "pbp"])
    assert.equal(coreFor(`Existing disc.${extension}`), "psx");
});

test("mixed platform directory import keeps valid originals and reports unrelated files", () => {
  const roms = additions.map(({ extensions }) => ({
    name: `QA.${extensions[0]}`,
    webkitRelativePath: `Retro QA/Consoles/QA.${extensions[0]}`,
  }));
  const plan = planImport([
    ...roms,
    { name: "Manual.pdf", webkitRelativePath: "Retro QA/Manual.pdf" },
    { name: "Cover.webp", webkitRelativePath: "Retro QA/Cover.webp" },
    { name: "Unknown.bin", webkitRelativePath: "Retro QA/Unknown.bin" },
  ]);
  assert.deepEqual(plan.items.map((item) => item.core), additions.map((item) => item.system));
  assert.deepEqual(plan.items.map((item) => item.file), roms);
  assert.equal(plan.suggestedFolder, "Retro QA");
  assert.deepEqual(plan.skipped, ["Manual.pdf", "Cover.webp", "Unknown.bin"]);
});

test("organizing duplicate games on newly listed platforms preserves personal play data", () => {
  for (const { system } of additions) {
    const old = {
      id: `ROM-${system}`, core: system, title: "나의 제목", blob: new Blob(["original ROM"]),
      folder: "Before", profiles: ["기본", "개인"], lastPlayed: 123, favorite: true,
      rtc: { 개인: 456 }, macros: [{ name: "QA macro" }], states: ["saved-state-id"],
    };
    const merged = mergeImportedGame(old, {
      id: old.id, core: system, title: "Filename title", folder: "After",
      profiles: ["기본"], lastPlayed: 0, favorite: false, rtc: {}, macros: [], states: [],
      blob: new Blob(["replacement input"]),
    });
    assert.deepEqual(merged, { ...old, folder: "After" });
    assert.equal(merged.blob, old.blob);
    assert.equal(merged.profiles, old.profiles);
    assert.equal(old.folder, "Before");
  }
});

test("every newly routed extension has a manifest entry and a real local default core archive", () => {
  const manifest = JSON.parse(read("data/cores/cores.json"));
  for (const { system, core, extensions } of additions) {
    const entry = manifest.find((item) => item.name === core);
    assert.ok(entry, `${system}: core metadata must exist`);
    for (const extension of extensions)
      assert.ok(entry.extensions.includes(extension), `${system}: ${extension} must be declared by this bundled core`);
    const archive = read(`data/cores/${core}-wasm.data`);
    assert.ok(archive.length > 100000, `${system}: default single-thread core must be present`);
    assert.deepEqual([...archive.subarray(0, 6)], [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], `${system}: core archive must have the bundled 7z format`);
    assert.ok(fs.statSync(new URL(`data/cores/reports/${core}.json`, root)).isFile());
    assert.equal(JSON.parse(read(`data/cores/reports/${core}.json`)).core, core);
  }
});

test("the actual loader's minified emulator maps the eight systems to their installed default cores", () => {
  const loader = read("data/loader.js").toString(),
    minified = read("data/emulator.min.js").toString(),
    start = minified.indexOf("getCores(){"),
    end = minified.indexOf("requiresThreads(", start),
    mappings = minified.slice(start, end);
  assert.ok(loader.includes('await loadScript("emulator.min.js")'));
  assert.ok(start >= 0 && end > start);
  for (const { system, core } of additions)
    assert.match(mappings, new RegExp(`\\b${system}:\\["${core}"(?:,|\\])`), `${system}: generic platform must choose its installed core first`);
});
