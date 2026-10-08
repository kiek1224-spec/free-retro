const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_EDGE = 1280;

export function detectArtworkType(value) {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : null;
  if (!bytes) return null;
  const matches = (signature, start = 0) =>
    bytes.length >= start + signature.length &&
    signature.every((byte, index) => bytes[start + index] === byte);
  if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (matches([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    matches([0x52, 0x49, 0x46, 0x46]) &&
    matches([0x57, 0x45, 0x42, 0x50], 8)
  )
    return "image/webp";
  return null;
}

export async function normalizeArtwork(file) {
  if (
    !file ||
    typeof file.slice !== "function" ||
    !Number.isFinite(file.size) ||
    !file.size
  )
    throw new Error("비어 있지 않은 이미지 파일을 선택하세요.");
  if (file.size > MAX_BYTES)
    throw new Error("아트워크는 10 MB 이하 이미지로 선택하세요.");
  const type = detectArtworkType(await file.slice(0, 16).arrayBuffer());
  if (!type)
    throw new Error("아트워크는 PNG, JPEG, WebP 이미지로 선택하세요. SVG는 지원하지 않습니다.");
  if (typeof createImageBitmap !== "function")
    throw new Error("이 브라우저는 이미지 변환을 지원하지 않습니다. 최신 브라우저에서 다시 시도하세요.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([file], { type }));
  } catch {
    throw new Error("이미지 파일을 읽을 수 없습니다. 다른 이미지를 선택하세요.");
  }
  try {
    if (
      !Number.isFinite(bitmap.width) ||
      !Number.isFinite(bitmap.height) ||
      bitmap.width < 1 ||
      bitmap.height < 1 ||
      bitmap.width * bitmap.height > MAX_PIXELS
    )
      throw new Error("아트워크는 4,000만 픽셀 이하 이미지로 선택하세요.");
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 변환할 수 없습니다.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = (format, quality) =>
      new Promise((resolve, reject) => {
        try {
          canvas.toBlob(resolve, format, quality);
        } catch (error) {
          reject(error);
        }
      });
    let artwork;
    try {
      artwork = await encode("image/webp", 0.85);
    } catch {
      // Older browsers may reject the WebP encoder altogether.
    }
    if (!artwork || artwork.type !== "image/webp")
      artwork = await encode("image/png");
    if (!artwork || !artwork.size)
      throw new Error("이미지를 변환할 수 없습니다.");
    return artwork;
  } finally {
    bitmap.close();
  }
}
