import test from "node:test";
import assert from "node:assert/strict";
import { detectArtworkType, normalizeArtwork } from "../app/artwork.js";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1]);
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 20, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

function browserMock(t, decoder, canvas) {
  for (const [key, value] of [
    ["createImageBitmap", decoder],
    ["document", { createElement: () => canvas }],
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
}

test("artwork signatures identify raster formats without trusting a filename or MIME label", () => {
  assert.equal(detectArtworkType(png), "image/png");
  assert.equal(detectArtworkType(jpeg.buffer), "image/jpeg");
  assert.equal(detectArtworkType(webp), "image/webp");
  const padded = new Uint8Array(png.length + 4);
  padded.set(png, 2);
  assert.equal(detectArtworkType(padded.subarray(2, 2 + png.length)), "image/png");
  assert.equal(detectArtworkType(new TextEncoder().encode("<svg/>")), null);
  assert.equal(detectArtworkType(new TextEncoder().encode("GIF89a")), null);
  assert.equal(detectArtworkType(png.subarray(0, 7)), null);
  assert.equal(detectArtworkType(webp.subarray(0, 11)), null);
  assert.equal(detectArtworkType([0xff, 0xd8, 0xff]), null);
});

test("empty, oversized, and SVG files are rejected before image decoding", async () => {
  await assert.rejects(normalizeArtwork(new Blob()), /이미지/);
  let sliced = false;
  await assert.rejects(
    normalizeArtwork({
      size: 10 * 1024 * 1024 + 1,
      slice() {
        sliced = true;
      },
    }),
    /10 MB/,
  );
  assert.equal(sliced, false);
  await assert.rejects(
    normalizeArtwork(new Blob(["<svg/>"], { type: "image/png" })),
    /PNG, JPEG, WebP/,
  );
});

test("normalization downsizes wide images, re-encodes WebP, and closes the decoded bitmap", async (t) => {
  let closed = false,
    drawn,
    encoded;
  const bitmap = {
    width: 4000,
    height: 2000,
    close() { closed = true; },
  }, canvas = {
    getContext() {
      return { drawImage(...args) { drawn = args; } };
    },
    toBlob(callback, type, quality) {
      encoded = { type, quality };
      callback(new Blob([webp], { type }));
    },
  };
  browserMock(t, async (file) => {
    assert.equal(file.type, "image/png");
    return bitmap;
  }, canvas);
  const artwork = await normalizeArtwork(new Blob([png], { type: "image/svg+xml" }));
  assert.equal(canvas.width, 1280);
  assert.equal(canvas.height, 640);
  assert.deepEqual(drawn, [bitmap, 0, 0, 1280, 640]);
  assert.deepEqual(encoded, { type: "image/webp", quality: 0.85 });
  assert.equal(artwork.type, "image/webp");
  assert.equal(closed, true);
});

test("unsupported WebP encoder falls back to PNG without enlarging a small image", async (t) => {
  let closed = false;
  const calls = [], bitmap = {
    width: 320,
    height: 480,
    close() { closed = true; },
  }, canvas = {
    getContext() { return { drawImage() {} }; },
    toBlob(callback, type) {
      calls.push(type);
      if (type === "image/webp") throw new Error("Unsupported encoder");
      callback(new Blob([png], { type: "image/png" }));
    },
  };
  browserMock(t, async () => bitmap, canvas);
  const result = await normalizeArtwork(new Blob([jpeg]));
  assert.equal(result.type, "image/png");
  assert.equal(canvas.width, 320);
  assert.equal(canvas.height, 480);
  assert.deepEqual(calls, ["image/webp", "image/png"]);
  assert.equal(closed, true);
});

test("pixel limits reject decompressed giant images and still release bitmap memory", async (t) => {
  let closed = false, canvasCreated = false;
  browserMock(t, async () => ({
    width: 8000,
    height: 8000,
    close() { closed = true; },
  }), null);
  globalThis.document.createElement = () => { canvasCreated = true; };
  await assert.rejects(normalizeArtwork(new Blob([png])), /4,000만/);
  assert.equal(canvasCreated, false);
  assert.equal(closed, true);
});

test("invalid raster bytes fail decoding, and a failed PNG fallback still releases the bitmap", async (t) => {
  let closed = false, decodeFails = true;
  browserMock(t, async () => {
    if (decodeFails) throw new Error("Invalid bytes");
    return { width: 100, height: 100, close() { closed = true; } };
  }, {
    getContext() { return { drawImage() {} }; },
    toBlob(callback) { callback(null); },
  });
  await assert.rejects(normalizeArtwork(new Blob([png])), /읽을 수 없습니다/);
  decodeFails = false;
  await assert.rejects(normalizeArtwork(new Blob([png])), /변환할 수 없습니다/);
  assert.equal(closed, true);
});
