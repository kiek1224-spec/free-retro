import { writeFileSync } from "node:fs";

// Authored from scratch for Free Retro QA. This 4 KiB Atari 2600 cartridge
// contains only our 6502 instructions and an attribution string, with no
// commercial game data or BIOS. TIA WSYNC defines an NTSC 262-scanline frame:
// 3 VSYNC + 37 vertical blank + 192 color stripes + 30 overscan scanlines.
const RESET = 0xf000;
const code = [], labels = {}, fixups = [];
const emit = (...bytes) => code.push(...bytes);
const label = (name) => { labels[name] = code.length; };
const branch = (opcode, name) => {
  emit(opcode, 0);
  fixups.push({ at: code.length - 1, name, relative: true });
};
const jump = (name) => {
  emit(0x4c, 0, 0);
  fixups.push({ at: code.length - 2, name, relative: false });
};
const lda = (value) => emit(0xa9, value);
const ldx = (value) => emit(0xa2, value);
const sta = (address) => emit(0x85, address);

label("reset");
emit(0x78, 0xd8); // SEI; CLD
ldx(0xff); emit(0x9a); // TXS
lda(0); ldx(0x7f);
label("clearRAM");
emit(0x95, 0x80, 0xca); // STA $80,X; DEX — clear RIOT RAM only
branch(0x10, "clearRAM"); // BPL

label("frame");
lda(2); sta(0x01); sta(0x00); // VBLANK on; VSYNC on
ldx(3);
label("sync");
sta(0x02); emit(0xca); // WSYNC; DEX
branch(0xd0, "sync");
lda(0); sta(0x00); // VSYNC off
ldx(37);
label("blank");
sta(0x02); emit(0xca);
branch(0xd0, "blank");
lda(0); sta(0x01); // VBLANK off
ldx(192);
label("visible");
emit(0x8a, 0x29, 0xf0, 0x09, 0x08); // TXA; AND #$F0; ORA #$08
sta(0x09); // COLUBK changes hue every 16 scanlines
sta(0x02); emit(0xca);
branch(0xd0, "visible");
lda(2); sta(0x01); // VBLANK on for overscan
ldx(30);
label("overscan");
sta(0x02); emit(0xca);
branch(0xd0, "overscan");
jump("frame");

for (const fixup of fixups) {
  if (!(fixup.name in labels)) throw new Error(`Undefined label ${fixup.name}`);
  if (fixup.relative) {
    const offset = labels[fixup.name] - (fixup.at + 1);
    if (offset < -128 || offset > 127) throw new Error("Branch exceeds signed byte range");
    code[fixup.at] = offset & 255;
  } else {
    const address = RESET + labels[fixup.name];
    code[fixup.at] = address & 255;
    code[fixup.at + 1] = address >> 8;
  }
}
if (code.length > 0x100) throw new Error("QA code exceeds its reserved page");
const rom = new Uint8Array(4096).fill(0xff);
rom.set(code);
rom.set(new TextEncoder().encode("FREE RETRO AUTHORED ATARI 2600 QA / 262 LINE COLOR STRIPES"), 0x100);
for (const vector of [0xffa, 0xffc, 0xffe]) {
  rom[vector] = RESET & 255;
  rom[vector + 1] = RESET >> 8;
}
const target = new URL("./atari-fixture.a26", import.meta.url);
writeFileSync(target, rom);
console.log(`Generated original Atari 2600 cartridge: ${rom.length} bytes, ${code.length} bytes of authored instructions.`);
