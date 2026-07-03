/**
 * Generates build/icon.png — a PLACEHOLDER app icon for Praxis.
 *
 * This is only a stand-in so the icon pipeline (dock icon in dev, window icon
 * on Win/Linux) has something real to load. Replace build/icon.png (and add a
 * build/icon.icns for macOS packaging) with the artwork from the design's
 * app-icon.zip when available. Pure Node + zlib so it runs offline.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SIZE = 1024
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// --- tiny RGBA canvas ---------------------------------------------------------
const px = Buffer.alloc(SIZE * SIZE * 4)
const set = (x, y, [r, g, b, a]) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  // simple source-over composite onto whatever is there
  const sa = a / 255
  const da = px[i + 3] / 255
  const oa = sa + da * (1 - sa)
  if (oa === 0) return
  for (let c = 0; c < 3; c++) {
    const sc = [r, g, b][c]
    px[i + c] = Math.round((sc * sa + px[i + c] * da * (1 - sa)) / oa)
  }
  px[i + 3] = Math.round(oa * 255)
}

// --- geometry -----------------------------------------------------------------
// Rounded-rect background (indigo) with a bold white triangular "prism" mark.
const BG = [88, 80, 236, 255] // #5850EC
const FG = [255, 255, 255, 255]
const radius = SIZE * 0.22

const inRoundedRect = (x, y) => {
  const min = 0
  const max = SIZE - 1
  const rx = Math.min(Math.max(x, min + radius), max - radius)
  const ry = Math.min(Math.max(y, min + radius), max - radius)
  const dx = x < min + radius || x > max - radius ? x - rx : 0
  const dy = y < min + radius || y > max - radius ? y - ry : 0
  return dx * dx + dy * dy <= radius * radius
}

// Equilateral-ish triangle centered in the icon (a design "prism").
const cx = SIZE / 2
const cy = SIZE / 2
const tr = SIZE * 0.30 // triangle radius
const A = { x: cx, y: cy - tr }
const B = { x: cx - tr * 0.866, y: cy + tr * 0.5 }
const C = { x: cx + tr * 0.866, y: cy + tr * 0.5 }
const sign = (p, a, b) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y)
const inTriangle = (x, y) => {
  const p = { x, y }
  const d1 = sign(p, A, B)
  const d2 = sign(p, B, C)
  const d3 = sign(p, C, A)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundedRect(x, y)) continue
    set(x, y, BG)
    if (inTriangle(x, y)) set(x, y, FG)
  }
}

// --- PNG encode ---------------------------------------------------------------
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
// filter method 0, each scanline prefixed with a filter-type byte (0 = none)
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

mkdirSync(join(root, 'build'), { recursive: true })
writeFileSync(join(root, 'build', 'icon.png'), png)
console.log(`wrote build/icon.png (${SIZE}x${SIZE}, ${png.length} bytes)`)
