import { coreFor } from "./model.js";

export const PLATFORM_GROUPS = [
  {
    label: "NINTENDO",
    platforms: [
      { core: "nes", name: "패미컴 / NES", icon: "console" },
      { core: "snes", name: "슈퍼 패미컴 / SNES", icon: "console" },
      { core: "gb", name: "Game Boy / Color", icon: "handheld" },
      { core: "gba", name: "Game Boy Advance", icon: "handheld" },
      { core: "n64", name: "Nintendo 64", icon: "console" },
      { core: "nds", name: "Nintendo DS", icon: "handheld" },
    ],
  },
  {
    label: "SONY",
    platforms: [{ core: "psx", name: "PlayStation", icon: "disc" }],
  },
  {
    label: "SEGA",
    platforms: [
      { core: "segaMD", name: "Mega Drive", icon: "sega" },
      { core: "segaMS", name: "Master System", icon: "sega" },
      { core: "segaGG", name: "Game Gear", icon: "handheld" },
    ],
  },
];

export function validateFolderName(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value))
    throw new Error("폴더 이름에는 제어 문자를 사용할 수 없습니다.");
  const name = value.trim();
  if (name.length > 80)
    throw new Error("폴더 이름은 80자 이하로 입력하세요.");
  return name;
}

export function planImport(files) {
  const selected = Array.from(files),
    items = [],
    skipped = [];
  for (const file of selected) {
    try {
      items.push({ file, core: coreFor(file.name) });
    } catch {
      skipped.push(file.name);
    }
  }
  const roots = selected.map((file) => {
    const path = file.webkitRelativePath || "";
    return path.includes("/") ? path.split("/")[0] : "";
  });
  const common =
    roots.length && roots[0] && roots.every((root) => root === roots[0])
      ? roots[0]
      : "";
  let suggestedFolder = "";
  if (common) {
    try {
      suggestedFolder = validateFolderName(common);
    } catch {
      // A filesystem name may exceed the collection name limit.
    }
  }
  return { items, skipped, suggestedFolder };
}

export function mergeImportedGame(old, fresh) {
  if (!old) return { ...fresh };
  const merged = { ...fresh, ...old };
  if (typeof fresh.folder === "string" && fresh.folder.trim())
    merged.folder = validateFolderName(fresh.folder);
  if (fresh.artwork) merged.artwork = fresh.artwork;
  return merged;
}
