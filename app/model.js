import { validOffset } from "./clock.js";
export const SYSTEMS = {
  nes: "NES",
  snes: "SNES",
  gb: "GB / GBC",
  gba: "GBA",
  n64: "N64",
  psx: "PS1",
  segaMD: "Mega Drive",
  segaMS: "Master System",
  segaGG: "Game Gear",
  nds: "Nintendo DS",
  atari2600: "Atari 2600",
  atari7800: "Atari 7800",
  jaguar: "Atari Jaguar",
  sega32x: "Sega 32X",
  vb: "Virtual Boy",
  pce: "PC Engine",
  ngp: "Neo Geo Pocket / Color",
  ws: "WonderSwan / Color",
};
const EXTENSIONS = {
  nes: "nes",
  sfc: "snes",
  smc: "snes",
  gb: "gb",
  gbc: "gb",
  gba: "gba",
  n64: "n64",
  z64: "n64",
  v64: "n64",
  chd: "psx",
  pbp: "psx",
  img: "psx",
  iso: "psx",
  md: "segaMD",
  gen: "segaMD",
  smd: "segaMD",
  sgd: "segaMD",
  sms: "segaMS",
  gg: "segaGG",
  nds: "nds",
  a26: "atari2600",
  a78: "atari7800",
  j64: "jaguar",
  jag: "jaguar",
  "32x": "sega32x",
  vb: "vb",
  vboy: "vb",
  pce: "pce",
  ngp: "ngp",
  ngc: "ngp",
  ws: "ws",
  wsc: "ws",
  pc2: "ws",
};
export function coreFor(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (!EXTENSIONS[ext])
    throw new Error(
      `지원하지 않는 파일입니다: ${name}. CUE + BIN은 단일 CHD로 변환해서 추가하세요.`,
    );
  return EXTENSIONS[ext];
}
export async function romId(blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function filterGames(
  games,
  { search = "", view = "all", folder = "" } = {},
) {
  return games
    .filter(
      (g) =>
        (!search ||
          g.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) &&
        (!folder || g.folder === folder) &&
        (view !== "favorite" || g.favorite) &&
        (view !== "recent" || g.lastPlayed) &&
        (view !== "unplayed" || !g.lastPlayed),
    )
    .sort((a, b) => (b.lastPlayed || b.added) - (a.lastPlayed || a.added));
}
export function validateBackup(value, game) {
  if (
    !value ||
    value.format !== "free-retro-backup" ||
    value.version !== 1 ||
    value.romId !== game.id ||
    value.core !== game.core ||
    !Array.isArray(value.states) ||
    value.states.length > 10000
  )
    throw new Error(
      "이 게임과 맞지 않는 백업입니다. 같은 ROM 파일을 선택하세요.",
    );
  for (const s of value.states) {
    if (
      !s ||
      typeof s.profile !== "string" ||
      !s.profile.trim() ||
      s.profile.length > 60 ||
      typeof s.id !== "string" ||
      typeof s.label !== "string" ||
      !Number.isFinite(s.created) ||
      typeof s.data !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(s.data) ||
      !s.data.length ||
      s.data.length % 4
    )
      throw new Error("저장 데이터 형식이 올바르지 않습니다.");
    if (s.rtcOffset !== undefined) validOffset(s.rtcOffset);
    if (
      s.battery &&
      (typeof s.battery !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(s.battery) ||
        s.battery.length % 4)
    )
      throw new Error("게임 내 저장 형식이 올바르지 않습니다.");
  }
  return value;
}
export function hotkeyAction(event, keys) {
  if (
    event.repeat ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing ||
    /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || "") ||
    event.target?.isContentEditable
  )
    return null;
  if (event.key === keys.save) return "save";
  if (event.key === keys.pause) return "pause";
  return null;
}
