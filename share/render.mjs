export const WIDTH = 1200;
export const HEIGHT = 630;

// Each glyph has seven rows with five bits per row.
const glyphs = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 18, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31], 3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "_": [0, 0, 0, 0, 0, 0, 31],
  ".": [0, 0, 0, 0, 0, 12, 12],
  "'": [12, 4, 8, 0, 0, 0, 0],
  ":": [0, 12, 12, 0, 12, 12, 0],
  "?": [14, 17, 1, 2, 4, 0, 4],
};

const rowBytes = 1 + Math.ceil(WIDTH / 8); // PNG filter byte followed by packed grayscale pixels.

function drawText(pixels, text, left, top, scale) {
  const chars = Array.from(text.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim());
  const maxChars = Math.floor((WIDTH - 2 * left) / (6 * scale));
  if (chars.length > maxChars) chars.splice(maxChars - 3, Infinity, ".", ".", ".");
  for (const [index, char] of chars.entries()) {
    if (char === " ") continue;
    const rows = glyphs[char] || glyphs["?"];
    for (const [row, bits] of rows.entries()) {
      for (let column = 0; column < 5; column++) {
        if (!(bits & (16 >> column))) continue;
        for (let dy = 0; dy < scale; dy++) {
          const offset = (top + row * scale + dy) * rowBytes + 1;
          const x = left + (index * 6 + column) * scale;
          for (let dx = x; dx < x + scale; dx++) pixels[offset + (dx >> 3)] |= 128 >> (dx & 7);
        }
      }
    }
  }
}

function pngChunk(type, data) {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  view.setUint32(chunk.length - 4, crc ^ 0xffffffff);
  return chunk;
}

async function encodePng(pixels) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, WIDTH);
  view.setUint32(4, HEIGHT);
  header[8] = 1; // One-bit grayscale.
  const zipped = new Blob([pixels]).stream().pipeThrough(new CompressionStream("deflate"));
  const data = new Uint8Array(await new Response(zipped).arrayBuffer());
  return new Uint8Array(await new Blob([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    pngChunk("IHDR", header),
    pngChunk("IDAT", data),
    pngChunk("IEND", new Uint8Array()),
  ]).arrayBuffer());
}

// Replace this function to restyle the card. Keep the PNG dimensions and bump IMAGE_CACHE_VERSION.
export function renderShareCard({ name, fallbackName, hero, kda, result }) {
  const pixels = new Uint8Array(rowBytes * HEIGHT);
  const displayName = /[a-z0-9]/i.test(name.normalize("NFKD")) ? name : fallbackName;
  drawText(pixels, displayName, 72, 76, 7);
  drawText(pixels, hero, 72, 196, 6);
  drawText(pixels, "K/D/A: " + kda, 72, 316, 6);
  drawText(pixels, result, 72, 436, 6);
  return encodePng(pixels);
}
